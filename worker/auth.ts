// ---------------------------------------------------------------------------
// Admin authentication.
//
// HTTP requests use the `X-Admin-Key` header. Browsers cannot set headers on
// a WebSocket handshake, so admins pass the key as a subprotocol token (built
// by `encodeWsKey`) and the Worker echoes the accepted token on the 101.
// ---------------------------------------------------------------------------

import { decodeWsKey } from '../src/shared/wsKey';
import type { Env } from './env';

/** HTTP admin endpoints authenticate with the `X-Admin-Key` header only. */
export function isAuthorized(request: Request, env: Env): boolean {
  if (!env.ADMIN_KEY) return true; // no key configured -> open (dev)
  return request.headers.get('x-admin-key') === env.ADMIN_KEY;
}

export type WebSocketAuth =
  | { authorized: true; subprotocol: string | null }
  | { authorized: false };

/**
 * Validates the admin key offered in `Sec-WebSocket-Protocol`.
 *
 * When `ADMIN_KEY` is unset the API is open (dev) and the first offered token
 * is echoed back so the browser completes the handshake. TV connections do not
 * need authentication and are handled by the caller before this runs.
 */
export function authenticateWebSocket(request: Request, env: Env): WebSocketAuth {
  const offered = (request.headers.get('Sec-WebSocket-Protocol') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!env.ADMIN_KEY) {
    return { authorized: true, subprotocol: offered[0] ?? null };
  }

  const accepted = offered.find((value) => decodeWsKey(value) === env.ADMIN_KEY);
  if (!accepted) return { authorized: false };
  return { authorized: true, subprotocol: accepted };
}
