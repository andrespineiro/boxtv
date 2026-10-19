import type { AdminCommand, GymStatus, Screen } from '../types/signage';
import { encodeWsKey } from '../wsKey';

const ADMIN_KEY_STORAGE = 'signage.adminKey';
const GYM_STORAGE = 'signage.gymId';

/**
 * Optional API origin. When empty the app talks to its own origin, which is
 * both production and `cf dev` (the Cloudflare Vite plugin serves the client
 * and the Worker together). Can still be overridden with `VITE_API_ORIGIN`.
 */
const API_ORIGIN = ((import.meta.env.VITE_API_ORIGIN as string | undefined) ?? '').replace(
  /\/$/,
  '',
);

export function getAdminKey(): string {
  try {
    return localStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setAdminKey(key: string): void {
  try {
    if (key) localStorage.setItem(ADMIN_KEY_STORAGE, key);
    else localStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // ignore storage failures (private mode)
  }
}

export function getGymId(): string {
  try {
    return localStorage.getItem(GYM_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setGymId(gymId: string): void {
  try {
    if (gymId) localStorage.setItem(GYM_STORAGE, gymId);
    else localStorage.removeItem(GYM_STORAGE);
  } catch {
    // ignore storage failures (private mode)
  }
}

/**
 * Persists a `?gym=` coming from the URL (e.g. a TV link handed to a device
 * with no stored gym) so every API/WS request keeps targeting the same gym.
 * Called once at startup.
 */
export function adoptGymFromUrl(): void {
  try {
    const gym = new URLSearchParams(window.location.search).get('gym');
    if (gym) setGymId(gym);
  } catch {
    // ignore (no window / private mode)
  }
}

function withGym(url: string): string {
  const gym = getGymId();
  if (!gym) return url;
  const u = new URL(url, window.location.origin);
  u.searchParams.set('gym', gym);
  return u.pathname + u.search;
}

// --------------------------- Unauth handling -------------------------------

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/**
 * Fires whenever an admin request is rejected with `401` (e.g. the shared key
 * was changed on the Worker while the panel was open). Returns an unsubscribe
 * function. The gate uses it to send the user back to the password form.
 */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function handleUnauthorized(): void {
  // Drop the stale key so the gate asks for it again...
  setAdminKey('');
  // ...and let whoever is listening switch back to the lock screen.
  for (const listener of unauthorizedListeners) listener();
}

/** Site-relative URL of a TV player, preserving the configured gym. */
export function tvPath(screenId: string): string {
  return withGym(`/tv/${encodeURIComponent(screenId)}`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getAdminKey();
  if (key) headers.set('X-Admin-Key', key);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_ORIGIN}${withGym(path)}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) handleUnauthorized();
    throw new Error(errorMessage(text, res.status));
  }
  return (await res.json()) as T;
}

/** Prefers the Worker's `{ "error": "…" }` message over raw JSON when present. */
function errorMessage(text: string, status: number): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    // not JSON; fall through to the raw text
  }
  return text || `Request failed with ${status}`;
}

export const signageClient = {
  listScreens() {
    return request<GymStatus>('/api/screens');
  },

  sendCommand(screenId: string, command: AdminCommand) {
    return request<{ ok: boolean; screen: Screen }>(
      `/api/screens/${encodeURIComponent(screenId)}/command`,
      { method: 'POST', body: JSON.stringify({ command }) },
    );
  },

  /** Adds a TV. The server derives a unique id from the name. */
  createScreen(name: string) {
    return request<{ ok: boolean; screen: Screen }>('/api/screens', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  /** Removes a TV. The primary screen can never be deleted. */
  deleteScreen(screenId: string) {
    return request<{ ok: boolean }>(`/api/screens/${encodeURIComponent(screenId)}`, {
      method: 'DELETE',
    });
  },

  /** Uploads an image file to B2 and returns a stable site-relative URL. */
  uploadImage(file: File) {
    const headers = new Headers();
    const key = getAdminKey();
    if (key) headers.set('X-Admin-Key', key);
    headers.set('Content-Type', file.type || 'application/octet-stream');

    return request<UploadedImage>('/api/uploads', {
      method: 'POST',
      headers,
      body: file,
    });
  },
};

export type UploadedImage = {
  /** Site-relative URL to store in the screen (e.g. `/api/media/default/x.png`). */
  url: string;
  key: string;
  contentType: string;
  size: number;
};

export function wsUrl(screenId: string, role: 'tv' | 'admin'): string {
  const origin = API_ORIGIN || window.location.origin;
  const url = new URL(withGym(`/api/ws/${encodeURIComponent(screenId)}`), origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('role', role);
  return url.toString();
}

/**
 * WebSocket subprotocols offered during the handshake. Admins pass the shared
 * key here (as a header) instead of in the URL, where it would be logged.
 */
export function wsProtocols(role: 'tv' | 'admin'): string[] {
  if (role !== 'admin') return [];
  const key = getAdminKey();
  return key ? [encodeWsKey(key)] : [];
}
