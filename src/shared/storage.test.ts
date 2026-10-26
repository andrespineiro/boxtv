import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getItem,
  getJson,
  removeItem,
  setItem,
  setJson,
  STORAGE_KEYS,
  type StorageKind,
} from './storage';

class FakeStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function stubStorage(kind: StorageKind, storage: Storage): void {
  vi.stubGlobal(kind === 'session' ? 'sessionStorage' : 'localStorage', storage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage helpers', () => {
  it('is a no-op when storage is unavailable', () => {
    expect(getItem('missing')).toBeNull();
    expect(getJson('missing')).toBeNull();
    expect(() => setItem('key', 'value')).not.toThrow();
    expect(() => removeItem('key')).not.toThrow();
  });

  it('reads, writes and removes local values', () => {
    const storage = new FakeStorage();
    stubStorage('local', storage);

    setItem('key', 'value');
    expect(getItem('key')).toBe('value');
    removeItem('key');
    expect(getItem('key')).toBeNull();
  });

  it('supports session storage independently', () => {
    const local = new FakeStorage();
    const session = new FakeStorage();
    stubStorage('local', local);
    stubStorage('session', session);

    setItem('key', 'local-value');
    setItem('key', 'session-value', 'session');

    expect(getItem('key')).toBe('local-value');
    expect(getItem('key', 'session')).toBe('session-value');
  });

  it('round-trips JSON values', () => {
    stubStorage('local', new FakeStorage());
    const screen = { id: 'wod', nested: { ok: true } };

    setJson('screen', screen);
    expect(getJson('screen')).toEqual(screen);
  });

  it('returns null for missing or corrupt JSON', () => {
    const storage = new FakeStorage();
    stubStorage('local', storage);

    expect(getJson('missing')).toBeNull();
    storage.setItem('corrupt', '{not json');
    expect(getJson('corrupt')).toBeNull();
  });

  it('swallows quota and access errors', () => {
    const throwing = new FakeStorage();
    throwing.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    stubStorage('local', throwing);

    expect(() => setItem('key', 'value')).not.toThrow();
    expect(() => setJson('key', { a: 1 })).not.toThrow();
  });

  it('centralises storage keys', () => {
    expect(STORAGE_KEYS.adminKey).toBe('signage.adminKey');
    expect(STORAGE_KEYS.gymId).toBe('signage.gymId');
    expect(STORAGE_KEYS.lastNightlyRefresh).toBe('signage.lastNightlyRefresh');
    expect(STORAGE_KEYS.screen('wod')).toBe('signage.screen.wod');
  });
});
