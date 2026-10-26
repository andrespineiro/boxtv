// ---------------------------------------------------------------------------
// Screen id rules, shared by the Worker/DO and the client-facing links.
//
// Ids are lowercase slugs. Malformed input (empty, uppercase-only handled by
// normalisation, slashes, dots…) is not a valid id; callers decide whether to
// fall back to the primary screen (TV links) or return 404 (admin mutations).
// ---------------------------------------------------------------------------

import { DEFAULT_SCREEN_IDS } from './defaults';

export const SCREEN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Normalises and validates a raw id, or returns `null` when it is malformed. */
export function normalizeScreenId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return SCREEN_ID_RE.test(value) ? value : null;
}

/**
 * Normalises a screen id coming from a URL. The app supports several TVs, so
 * every well-formed slug is kept; malformed input falls back to the primary
 * screen (the shipped `wod` TV).
 */
export function resolveScreenId(raw: string | null | undefined): string {
  return normalizeScreenId(raw) ?? DEFAULT_SCREEN_IDS[0];
}

/** Builds a URL-safe id from the name the admin typed, deduplicating it. */
export function screenIdFromName(name: string, existing: readonly string[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tv';

  let candidate = base;
  let suffix = 2;
  while (existing.includes(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
