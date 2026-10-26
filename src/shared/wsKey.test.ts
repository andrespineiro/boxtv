import { describe, expect, it } from 'vitest';
import { decodeWsKey, encodeWsKey, WS_KEY_PREFIX } from './wsKey';

describe('encodeWsKey / decodeWsKey', () => {
  it('round-trips a plain key', () => {
    const key = 'box123';
    const encoded = encodeWsKey(key);
    expect(encoded.startsWith(WS_KEY_PREFIX)).toBe(true);
    expect(decodeWsKey(encoded)).toBe(key);
  });

  it('round-trips unicode and punctuation', () => {
    const key = 'clave-secreta/ñ+ç=🔑';
    expect(decodeWsKey(encodeWsKey(key))).toBe(key);
  });

  it('produces a valid WebSocket subprotocol token', () => {
    const token = encodeWsKey('a+b/c==');
    expect(token).toMatch(/^[\x21-\x7e]+$/);
    expect(token).not.toMatch(/[+/=]/);
  });

  it('returns null for tokens without the prefix', () => {
    expect(decodeWsKey('chat')).toBeNull();
    expect(decodeWsKey('')).toBeNull();
  });

  it('returns null for malformed base64 payloads', () => {
    expect(decodeWsKey(`${WS_KEY_PREFIX}***`)).toBeNull();
  });
});
