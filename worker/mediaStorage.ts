// ---------------------------------------------------------------------------
// Image storage on Backblaze B2 (S3-compatible).
//
// Requests are signed with AWS SigV4 (via `aws4fetch`) and objects are proxied
// through the Worker. Proxying means B2 egress flows to Cloudflare (Backblaze
// is part of the Bandwidth Alliance -> free egress) and the bucket stays
// private: only the Worker holds the credentials.
// ---------------------------------------------------------------------------

import { AwsClient } from 'aws4fetch';
import type { Env } from './env';
import { isMediaKey } from './mediaKeys';

export interface MediaStorage {
  /** Stores `body` under `key` (e.g. `default/<uuid>.png`). */
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  /** Fetches an object, or returns `null` when it does not exist. */
  get(key: string): Promise<Response | null>;
}

/**
 * Builds a B2-backed storage, or returns `null` when the four env values are
 * not configured (so the app still runs without image uploads).
 */
export function getMediaStorage(env: Env): MediaStorage | null {
  const { B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_REGION } = env;
  if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET || !B2_REGION) return null;

  const client = new AwsClient({
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APPLICATION_KEY,
    service: 's3',
    region: B2_REGION,
  });

  const base = `https://s3.${B2_REGION}.backblazeb2.com/${B2_BUCKET}`;
  const objectUrl = (key: string) =>
    `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;

  return {
    async put(key, body, contentType) {
      if (!isMediaKey(key)) throw new Error('Invalid media key');
      const res = await client.fetch(objectUrl(key), {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body,
      });
      if (!res.ok) {
        throw new Error(`B2 upload failed (${res.status}): ${await res.text()}`);
      }
    },

    async get(key) {
      if (!isMediaKey(key)) return null;
      const res = await client.fetch(objectUrl(key), { method: 'GET' });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`B2 download failed (${res.status})`);
      return res;
    },
  };
}
