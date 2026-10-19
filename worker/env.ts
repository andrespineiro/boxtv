export interface Env {
  /** Durable Object namespace: one DO instance per gym. */
  GYM_SIGNAGE: DurableObjectNamespace;
  /** Static asset fetcher (Cloudflare Pages / Workers static assets). */
  ASSETS: Fetcher;
  /** Optional shared secret required by the admin panel. */
  ADMIN_KEY?: string;
  /** Gym used when no `?gym=` query param is provided. */
  DEFAULT_GYM_ID?: string;

  // ----- Backblaze B2 (S3-compatible) image storage -----
  // All four are optional: when unset, uploads return 503 and image URLs keep
  // working. Credentials are secrets; bucket/region are plain text.
  B2_KEY_ID?: string;
  B2_APPLICATION_KEY?: string;
  /** Bucket name, e.g. `boxtv-media`. */
  B2_BUCKET?: string;
  /** S3 region, e.g. `us-west-004` (see your B2 bucket details). */
  B2_REGION?: string;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Key',
};
