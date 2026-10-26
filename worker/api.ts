// ---------------------------------------------------------------------------
// `/api/*` routing.
//
// The Worker stays thin: it authenticates, parses the path and forwards a
// synthetic request to the gym's Durable Object. State lives in the DO.
// ---------------------------------------------------------------------------

import type { Env } from './env';
import { authenticateWebSocket, isAuthorized } from './auth';
import { errorJson, json } from './http';
import { handleUpload, serveMedia } from './media';

const MEDIA_ROUTE = /^\/api\/media\/(.+)$/;
const WS_ROUTE = /^\/api\/ws\/([^/]+)$/;
const SCREEN_ROUTE = /^\/api\/screen\/([^/]+)$/;
const SCREEN_COMMAND_ROUTE = /^\/api\/screens\/([^/]+)\/command$/;
const SCREEN_ROUTE_ADMIN = /^\/api\/screens\/([^/]+)$/;

/** Handles every request under `/api/`. Errors bubble up to `worker/index.ts`. */
export async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;

  if (pathname === '/api/health') {
    return json({ ok: true, service: 'boxtv', ts: Date.now() });
  }

  // Public: TVs load uploaded images with a plain <img>, so this route must not
  // require the admin key. Keys are unguessable UUIDs generated on upload.
  const mediaMatch = pathname.match(MEDIA_ROUTE);
  if (mediaMatch && request.method === 'GET') {
    return serveMedia(env, decodeURIComponent(mediaMatch[1]));
  }

  const gymId = url.searchParams.get('gym') || env.DEFAULT_GYM_ID || 'default';
  const stub = env.GYM_SIGNAGE.get(env.GYM_SIGNAGE.idFromName(gymId));

  // Admin: upload an image to B2 and get back a stable site-relative URL.
  if (pathname === '/api/uploads' && request.method === 'POST') {
    if (!isAuthorized(request, env)) return errorJson('Unauthorized', 401);
    return handleUpload(request, env, gymId);
  }

  // WebSocket upgrade: /api/ws/:screenId?role=tv|admin
  const wsMatch = pathname.match(WS_ROUTE);
  if (wsMatch) {
    return handleWebSocket(request, env, url, stub, decodeURIComponent(wsMatch[1]));
  }

  // Public screen state: /api/screen/:screenId
  const screenMatch = pathname.match(SCREEN_ROUTE);
  if (screenMatch && request.method === 'GET') {
    const doUrl = new URL('https://do/state');
    doUrl.searchParams.set('screenId', decodeURIComponent(screenMatch[1]));
    return forward(stub, doUrl);
  }

  // Admin: list all screens + live statuses.
  if (pathname === '/api/screens' && request.method === 'GET') {
    if (!isAuthorized(request, env)) return errorJson('Unauthorized', 401);
    return forward(stub, new URL('https://do/screens'));
  }

  // Admin: add a TV. The DO picks a unique id from the requested name.
  if (pathname === '/api/screens' && request.method === 'POST') {
    if (!isAuthorized(request, env)) return errorJson('Unauthorized', 401);
    return forward(stub, new URL('https://do/screens'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    });
  }

  // Admin: remove a TV (the primary one is protected by the DO).
  const deleteMatch = pathname.match(SCREEN_ROUTE_ADMIN);
  if (deleteMatch && request.method === 'DELETE') {
    if (!isAuthorized(request, env)) return errorJson('Unauthorized', 401);
    const doUrl = new URL('https://do/screens');
    doUrl.searchParams.set('screenId', decodeURIComponent(deleteMatch[1]));
    return forward(stub, doUrl, { method: 'DELETE' });
  }

  // Admin: send a command to a screen.
  const commandMatch = pathname.match(SCREEN_COMMAND_ROUTE);
  if (commandMatch && request.method === 'POST') {
    if (!isAuthorized(request, env)) return errorJson('Unauthorized', 401);
    const doUrl = new URL('https://do/command');
    doUrl.searchParams.set('screenId', decodeURIComponent(commandMatch[1]));
    return forward(stub, doUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    });
  }

  return errorJson('Not found', 404);
}

// ------------------------------- WebSocket ---------------------------------

async function handleWebSocket(
  request: Request,
  env: Env,
  url: URL,
  stub: DurableObjectStub,
  screenId: string,
): Promise<Response> {
  const role = url.searchParams.get('role') === 'admin' ? 'admin' : 'tv';

  // Admins authenticate with the key carried as a subprotocol (a header),
  // never in the URL. The accepted token must be echoed back on the 101.
  let subprotocol: string | null = null;
  if (role === 'admin') {
    const auth = authenticateWebSocket(request, env);
    if (!auth.authorized) return errorJson('Unauthorized', 401);
    subprotocol = auth.subprotocol;
  }

  const doUrl = new URL('https://do/ws');
  doUrl.searchParams.set('screenId', screenId);
  doUrl.searchParams.set('role', role);
  if (subprotocol) doUrl.searchParams.set('subprotocol', subprotocol);
  return stub.fetch(doUrl.toString(), request);
}

// ------------------------------- Forwarding --------------------------------

/** Forwards a request to the DO and re-emits its JSON body with CORS headers. */
async function forward(
  stub: DurableObjectStub,
  doUrl: URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await stub.fetch(doUrl.toString(), init);
  const body = await res.json();
  return json(body, res.status);
}
