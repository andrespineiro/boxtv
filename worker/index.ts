import { GymSignageDO } from './durable/GymSignageDO';
import { CORS_HEADERS, type Env } from './env';
import { getMediaStorage } from './mediaStorage';
import { decodeWsKey } from '../src/shared/wsKey';

export { GymSignageDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return json({ error: message }, 500);
      }
    }

    // Everything else is served from the static build (Pages / Workers assets).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;

  if (pathname === '/api/health') {
    return json({ ok: true, service: 'boxtv', ts: Date.now() });
  }

  // Public: TVs load uploaded images with a plain <img>, so this route must not
  // require the admin key. Keys are unguessable UUIDs generated on upload.
  const mediaMatch = pathname.match(/^\/api\/media\/(.+)$/);
  if (mediaMatch && request.method === 'GET') {
    return serveMedia(env, decodeURIComponent(mediaMatch[1]));
  }

  const gymId = url.searchParams.get('gym') || env.DEFAULT_GYM_ID || 'default';
  const stub = env.GYM_SIGNAGE.get(env.GYM_SIGNAGE.idFromName(gymId));

  // Admin: upload an image to B2 and get back a stable site-relative URL.
  if (pathname === '/api/uploads' && request.method === 'POST') {
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    return handleUpload(request, env, gymId);
  }

  // WebSocket upgrade: /api/ws/:screenId?role=tv|admin
  const wsMatch = pathname.match(/^\/api\/ws\/([^/]+)$/);
  if (wsMatch) {
    const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'tv';
    const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    // Admins authenticate with the key carried as a subprotocol (a header),
    // never in the URL. The accepted token must be echoed back on the 101.
    let subprotocol: string | null = null;
    if (role === 'admin') {
      if (env.ADMIN_KEY) {
        const accepted = offered.find((value) => decodeWsKey(value) === env.ADMIN_KEY);
        if (!accepted) return json({ error: 'Unauthorized' }, 401);
        subprotocol = accepted;
      } else {
        subprotocol = offered[0] ?? null;
      }
    }

    const doUrl = new URL('https://do/ws');
    doUrl.searchParams.set('screenId', decodeURIComponent(wsMatch[1]));
    doUrl.searchParams.set('role', role);
    if (subprotocol) doUrl.searchParams.set('subprotocol', subprotocol);
    return stub.fetch(doUrl.toString(), request);
  }

  // Public screen state: /api/screen/:screenId
  const screenMatch = pathname.match(/^\/api\/screen\/([^/]+)$/);
  if (screenMatch && request.method === 'GET') {
    const doUrl = new URL('https://do/state');
    doUrl.searchParams.set('screenId', decodeURIComponent(screenMatch[1]));
    const res = await stub.fetch(doUrl.toString());
    const body = await res.json();
    return json(body, res.status);
  }

  // Admin: list all screens + live statuses.
  if (pathname === '/api/screens' && request.method === 'GET') {
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const res = await stub.fetch('https://do/screens');
    const body = await res.json();
    return json(body, res.status);
  }

  // Admin: add a TV. The DO picks a unique id from the requested name.
  if (pathname === '/api/screens' && request.method === 'POST') {
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const payload = await request.text();
    const res = await stub.fetch('https://do/screens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const body = await res.json();
    return json(body, res.status);
  }

  // Admin: remove a TV (the primary one is protected by the DO).
  const deleteMatch = pathname.match(/^\/api\/screens\/([^/]+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const doUrl = new URL('https://do/screens');
    doUrl.searchParams.set('screenId', decodeURIComponent(deleteMatch[1]));
    const res = await stub.fetch(doUrl.toString(), { method: 'DELETE' });
    const body = await res.json();
    return json(body, res.status);
  }

  // Admin: send a command to a screen.
  const cmdMatch = pathname.match(/^\/api\/screens\/([^/]+)\/command$/);
  if (cmdMatch && request.method === 'POST') {
    if (!isAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);
    const payload = await request.text();
    const doUrl = new URL('https://do/command');
    doUrl.searchParams.set('screenId', decodeURIComponent(cmdMatch[1]));
    const res = await stub.fetch(doUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const body = await res.json();
    return json(body, res.status);
  }

  return json({ error: 'Not found' }, 404);
}

/** HTTP admin endpoints authenticate with the `X-Admin-Key` header only. */
function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return true; // no key configured -> open (dev)
  return request.headers.get('x-admin-key') === env.ADMIN_KEY;
}

// ------------------------------ Media (B2) ---------------------------------

/** Hard cap per image so a single upload can't exhaust storage/bandwidth. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Accepted upload content types mapped to the file extension used in the key. */
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

async function handleUpload(request: Request, env: Env, gymId: string): Promise<Response> {
  const storage = getMediaStorage(env);
  if (!storage) return json({ error: 'Almacenamiento de imágenes no configurado' }, 503);

  const contentType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) {
    return json({ error: `Tipo de imagen no admitido: ${contentType || 'desconocido'}` }, 415);
  }

  const maxLabel = `${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return json({ error: `La imagen supera el máximo de ${maxLabel}` }, 413);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'El archivo está vacío' }, 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return json({ error: `La imagen supera el máximo de ${maxLabel}` }, 413);
  }

  const safeGym = gymId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
  const key = `${safeGym}/${crypto.randomUUID()}.${ext}`;

  try {
    await storage.put(key, bytes, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al subir la imagen';
    return json({ error: message }, 502);
  }

  return json({ url: `/api/media/${key}`, key, contentType, size: bytes.byteLength });
}

async function serveMedia(env: Env, key: string): Promise<Response> {
  const storage = getMediaStorage(env);
  if (!storage) return json({ error: 'Almacenamiento de imágenes no configurado' }, 503);

  let object: Response | null;
  try {
    object = await storage.get(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al leer la imagen';
    return json({ error: message }, 502);
  }
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  const contentType = object.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  // Defence in depth: uploads are admin-only, but never run scripts if an SVG
  // is opened directly instead of being embedded with <img>.
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  return new Response(object.body, { status: 200, headers });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
