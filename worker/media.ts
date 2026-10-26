// ---------------------------------------------------------------------------
// Media routes: uploads to B2 and the public read proxy used by the TVs.
// ---------------------------------------------------------------------------

import type { Env } from './env';
import { errorJson, json } from './http';
import { getMediaStorage } from './mediaStorage';

/** Hard cap per image so a single upload can't exhaust storage/bandwidth. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Accepted upload content types mapped to the file extension used in the key. */
export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

/**
 * Uploads an image and returns a stable site-relative URL.
 *
 * The bucket stays private: the Worker signs the request and later proxies the
 * reads. Callers must already have authenticated the request.
 */
export async function handleUpload(
  request: Request,
  env: Env,
  gymId: string,
): Promise<Response> {
  const storage = getMediaStorage(env);
  if (!storage) return errorJson('Almacenamiento de imágenes no configurado', 503);

  const contentType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const ext = IMAGE_TYPES[contentType];
  if (!ext) {
    return errorJson(`Tipo de imagen no admitido: ${contentType || 'desconocido'}`, 415);
  }

  const maxLabel = `${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return errorJson(`La imagen supera el máximo de ${maxLabel}`, 413);
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength === 0) return errorJson('El archivo está vacío', 400);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return errorJson(`La imagen supera el máximo de ${maxLabel}`, 413);
  }

  const safeGym = sanitizeGymId(gymId);
  const key = `${safeGym}/${crypto.randomUUID()}.${ext}`;

  try {
    await storage.put(key, bytes, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al subir la imagen';
    return errorJson(message, 502);
  }

  return json({ url: `/api/media/${key}`, key, contentType, size: bytes.byteLength });
}

/**
 * Public read proxy. Keys are unguessable UUIDs generated on upload, so no
 * admin key is required: TVs load them with a plain `<img>`.
 */
export async function serveMedia(env: Env, key: string): Promise<Response> {
  const storage = getMediaStorage(env);
  if (!storage) return errorJson('Almacenamiento de imágenes no configurado', 503);

  let object: Response | null;
  try {
    object = await storage.get(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al leer la imagen';
    return errorJson(message, 502);
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

/** Keeps the B2 key prefix limited to safe characters. */
export function sanitizeGymId(gymId: string): string {
  return gymId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'default';
}
