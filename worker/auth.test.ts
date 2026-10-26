import { describe, expect, it } from 'vitest';
import { authenticateWebSocket, isAuthorized } from './auth';
import type { Env } from './env';
import { encodeWsKey } from '../src/shared/wsKey';

function env(overrides: Partial<Env> = {}): Env {
  return overrides as Env;
}

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/api/screens', { headers });
}

describe('isAuthorized', () => {
  it('accepts every request when no admin key is configured', () => {
    expect(isAuthorized(request(), env())).toBe(true);
    expect(isAuthorized(request({ 'x-admin-key': 'anything' }), env())).toBe(true);
  });

  it('requires the exact X-Admin-Key header when configured', () => {
    const configured = env({ ADMIN_KEY: 'secret' });
    expect(isAuthorized(request({ 'x-admin-key': 'secret' }), configured)).toBe(true);
    expect(isAuthorized(request({ 'x-admin-key': 'wrong' }), configured)).toBe(false);
    expect(isAuthorized(request(), configured)).toBe(false);
  });
});

describe('authenticateWebSocket', () => {
  it('is open when no admin key is configured', () => {
    expect(authenticateWebSocket(request(), env())).toEqual({
      authorized: true,
      subprotocol: null,
    });
    expect(
      authenticateWebSocket(request({ 'Sec-WebSocket-Protocol': 'chat' }), env()),
    ).toEqual({ authorized: true, subprotocol: 'chat' });
  });

  it('accepts and echoes the token that decodes to the admin key', () => {
    const token = encodeWsKey('secret');
    const result = authenticateWebSocket(
      request({ 'Sec-WebSocket-Protocol': `chat, ${token}` }),
      env({ ADMIN_KEY: 'secret' }),
    );
    expect(result).toEqual({ authorized: true, subprotocol: token });
  });

  it('rejects missing, wrong or malformed tokens', () => {
    const configured = env({ ADMIN_KEY: 'secret' });
    expect(authenticateWebSocket(request(), configured)).toEqual({ authorized: false });
    expect(
      authenticateWebSocket(
        request({ 'Sec-WebSocket-Protocol': encodeWsKey('wrong') }),
        configured,
      ),
    ).toEqual({ authorized: false });
    expect(
      authenticateWebSocket(request({ 'Sec-WebSocket-Protocol': 'not-a-key' }), configured),
    ).toEqual({ authorized: false });
  });
});
