import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { handleUpload, sanitizeGymId, serveMedia } from './media';

const UUID = '550e8400-e29b-41d4-a716-446655440000';
const env = {} as Env;

describe('serveMedia', () => {
  it('returns 404 for invalid keys before requiring B2 storage', async () => {
    for (const key of ['../x', 'default/x.png', `default/${UUID}.exe`, '']) {
      const res = await serveMedia(env, key);
      expect(res.status).toBe(404);
    }
  });

  it('returns 503 for a valid key when B2 is not configured', async () => {
    const res = await serveMedia(env, `default/${UUID}.png`);
    expect(res.status).toBe(503);
  });
});

describe('handleUpload', () => {
  it('returns 503 when B2 is not configured', async () => {
    const res = await handleUpload(
      new Request('https://example.com/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      }),
      env,
      'default',
    );
    expect(res.status).toBe(503);
  });
});

describe('sanitizeGymId', () => {
  it('keeps safe characters and limits length', () => {
    expect(sanitizeGymId('gym-a_1')).toBe('gym-a_1');
    expect(sanitizeGymId('gym/a b')).toBe('gymab');
    expect(sanitizeGymId('a'.repeat(50))).toBe('a'.repeat(40));
  });

  it('falls back to default when nothing is left', () => {
    expect(sanitizeGymId('')).toBe('default');
    expect(sanitizeGymId('!!!')).toBe('default');
  });
});
