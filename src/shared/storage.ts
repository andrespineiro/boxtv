// ---------------------------------------------------------------------------
// Browser storage helpers.
//
// Every read/write is best-effort: private mode, disabled storage and quota
// errors must never break the TV or the admin panel. Keys live in one place so
// features cannot drift apart.
// ---------------------------------------------------------------------------

export type StorageKind = 'local' | 'session';

export const STORAGE_KEYS = {
  adminKey: 'signage.adminKey',
  gymId: 'signage.gymId',
  lastNightlyRefresh: 'signage.lastNightlyRefresh',
  screen: (screenId: string) => `signage.screen.${screenId}`,
} as const;

function getStorage(kind: StorageKind): Storage | null {
  try {
    if (kind === 'session') {
      return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    }
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    // Access can throw when storage is disabled by policy.
    return null;
  }
}

export function getItem(key: string, kind: StorageKind = 'local'): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function setItem(key: string, value: string, kind: StorageKind = 'local'): void {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {
    // ignore quota/security errors
  }
}

export function removeItem(key: string, kind: StorageKind = 'local'): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {
    // ignore
  }
}

/** Reads and parses a JSON value, returning `null` for missing/corrupt data. */
export function getJson<T>(key: string, kind: StorageKind = 'local'): T | null {
  const raw = getItem(key, kind);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJson(key: string, value: unknown, kind: StorageKind = 'local'): void {
  try {
    setItem(key, JSON.stringify(value), kind);
  } catch {
    // ignore serialisation errors (circular values, BigInt…)
  }
}
