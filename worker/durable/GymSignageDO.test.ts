import { describe, expect, it } from 'vitest';
import { GymSignageDO } from './GymSignageDO';
import type { GymStatus, Screen } from '../../src/shared/types/signage';

/**
 * Minimal in-memory Durable Object state. The command/screen routes only need
 * `id`, `storage` and `getWebSockets`; WebSocket tests would need more of the
 * runtime, but these tests cover the HTTP state machine.
 */
class MemoryStorage {
  private readonly data = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
}

function makeDO(): GymSignageDO {
  const state = {
    id: { name: 'test-gym' },
    storage: new MemoryStorage(),
    getWebSockets: () => [],
  } as unknown as DurableObjectState;
  return new GymSignageDO(state, { DEFAULT_GYM_ID: 'default' });
}

function commandRequest(screenId: string, command: unknown): Request {
  return new Request(`https://do/command?screenId=${encodeURIComponent(screenId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
}

async function getState(doInstance: GymSignageDO, screenId: string): Promise<Screen> {
  const res = await doInstance.fetch(
    new Request(`https://do/state?screenId=${encodeURIComponent(screenId)}`),
  );
  const body = (await res.json()) as { screen: Screen };
  return body.screen;
}

describe('GymSignageDO admin screen ids', () => {
  it('applies a command to an existing screen', async () => {
    const doInstance = makeDO();
    const res = await doInstance.fetch(
      commandRequest('wod', { type: 'SET_SCREEN_NAME', name: 'TV principal' }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; screen: Screen };
    expect(body.ok).toBe(true);
    expect(body.screen.name).toBe('TV principal');
    expect((await getState(doInstance, 'wod')).name).toBe('TV principal');
  });

  it('does not fall back to the primary screen for an unknown id', async () => {
    const doInstance = makeDO();
    const before = await getState(doInstance, 'wod');

    const res = await doInstance.fetch(
      commandRequest('does-not-exist', { type: 'SET_SCREEN_NAME', name: 'Ooops' }),
    );

    expect(res.status).toBe(404);
    expect(await getState(doInstance, 'wod')).toEqual(before);
  });

  it('rejects malformed screen ids instead of editing the primary screen', async () => {
    const doInstance = makeDO();
    const before = await getState(doInstance, 'wod');

    for (const screenId of ['../admin', 'a/b', '', 'UPPER CASE']) {
      const res = await doInstance.fetch(
        commandRequest(screenId, { type: 'SET_SCREEN_NAME', name: 'Ooops' }),
      );
      // "UPPER CASE" normalises to "upper case", which is still invalid.
      expect(res.status).toBe(404);
    }

    expect(await getState(doInstance, 'wod')).toEqual(before);
  });

  it('returns 400 for invalid JSON or an invalid command', async () => {
    const doInstance = makeDO();

    const invalidJson = await doInstance.fetch(
      new Request('https://do/command?screenId=wod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    );
    expect(invalidJson.status).toBe(400);

    const invalidCommand = await doInstance.fetch(commandRequest('wod', { type: 'NOPE' }));
    expect(invalidCommand.status).toBe(400);
  });

  it('does not delete an unknown screen or the primary screen', async () => {
    const doInstance = makeDO();

    const unknown = await doInstance.fetch(
      new Request('https://do/screens?screenId=does-not-exist', { method: 'DELETE' }),
    );
    expect(unknown.status).toBe(404);

    const malformed = await doInstance.fetch(
      new Request('https://do/screens?screenId=../x', { method: 'DELETE' }),
    );
    expect(malformed.status).toBe(404);

    const primary = await doInstance.fetch(
      new Request('https://do/screens?screenId=wod', { method: 'DELETE' }),
    );
    expect(primary.status).toBe(400);
  });
});

describe('GymSignageDO screen CRUD', () => {
  it('creates a screen with a unique id and inherits brand/ads', async () => {
    const doInstance = makeDO();

    const first = await doInstance.fetch(
      new Request('https://do/screens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TV sala 2' }),
      }),
    );
    expect(first.status).toBe(201);
    const created = (await first.json()) as { screen: Screen };
    expect(created.screen.id).toBe('tv-sala-2');

    const second = await doInstance.fetch(
      new Request('https://do/screens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'TV sala 2' }),
      }),
    );
    const duplicate = (await second.json()) as { screen: Screen };
    expect(duplicate.screen.id).toBe('tv-sala-2-2');

    const listRes = await doInstance.fetch(new Request('https://do/screens'));
    const list = (await listRes.json()) as GymStatus;
    expect(list.screens.map((screen) => screen.id)).toEqual([
      'wod',
      'tv-sala-2',
      'tv-sala-2-2',
    ]);
  });

  it('rejects empty or oversized names', async () => {
    const doInstance = makeDO();
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      const res = await doInstance.fetch(
        new Request('https://do/screens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        }),
      );
      expect(res.status).toBe(400);
    }
  });

  it('deletes a secondary screen and keeps the primary', async () => {
    const doInstance = makeDO();
    await doInstance.fetch(
      new Request('https://do/screens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sala 2' }),
      }),
    );

    const res = await doInstance.fetch(
      new Request('https://do/screens?screenId=sala-2', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);

    const listRes = await doInstance.fetch(new Request('https://do/screens'));
    const list = (await listRes.json()) as GymStatus;
    expect(list.screens.map((screen) => screen.id)).toEqual(['wod']);
  });

  it('keeps the malformed-id fallback for the public TV state route', async () => {
    const doInstance = makeDO();
    const state = await getState(doInstance, 'unknown id');
    expect(state.id).toBe('wod');
  });
});
