import { describe, expect, it } from 'vitest';
import {
  normalizeScreenId,
  resolveScreenId,
  SCREEN_ID_RE,
  screenIdFromName,
} from './screenId';

describe('normalizeScreenId', () => {
  it('accepts and normalises valid slugs', () => {
    expect(normalizeScreenId('wod')).toBe('wod');
    expect(normalizeScreenId('tv-sala-2')).toBe('tv-sala-2');
    expect(normalizeScreenId('  TV_SALA  ')).toBe('tv_sala');
    expect(normalizeScreenId('a'.repeat(64))).toBe('a'.repeat(64));
  });

  it('rejects malformed ids', () => {
    expect(normalizeScreenId('')).toBeNull();
    expect(normalizeScreenId(null)).toBeNull();
    expect(normalizeScreenId(undefined)).toBeNull();
    expect(normalizeScreenId('../admin')).toBeNull();
    expect(normalizeScreenId('a/b')).toBeNull();
    expect(normalizeScreenId('-leading')).toBeNull();
    expect(normalizeScreenId('_leading')).toBeNull();
    expect(normalizeScreenId('a'.repeat(65))).toBeNull();
    expect(normalizeScreenId('a b')).toBeNull();
  });

  it('keeps the regex and the helper in sync', () => {
    expect(SCREEN_ID_RE.test('tv-1')).toBe(true);
    expect(SCREEN_ID_RE.test('TV-1')).toBe(false);
  });
});

describe('resolveScreenId', () => {
  it('keeps valid ids and falls back to the primary screen', () => {
    expect(resolveScreenId('tv-sala-2')).toBe('tv-sala-2');
    expect(resolveScreenId('UNKNOWN ID')).toBe('wod');
    expect(resolveScreenId(null)).toBe('wod');
  });
});

describe('screenIdFromName', () => {
  it('builds a slug from a display name', () => {
    expect(screenIdFromName('TV sala 2', [])).toBe('tv-sala-2');
    expect(screenIdFromName('  Sala principal  ', [])).toBe('sala-principal');
    expect(screenIdFromName('ÁÉÍÓÚ ñ', [])).toBe('aeiou-n');
  });

  it('truncates long names to 40 characters', () => {
    const id = screenIdFromName('a'.repeat(60), []);
    expect(id).toBe('a'.repeat(40));
  });

  it('falls back to tv when the name has no usable characters', () => {
    expect(screenIdFromName('!!!', [])).toBe('tv');
    expect(screenIdFromName('', [])).toBe('tv');
  });

  it('deduplicates against existing ids', () => {
    expect(screenIdFromName('TV sala 2', ['tv-sala-2'])).toBe('tv-sala-2-2');
    expect(screenIdFromName('TV sala 2', ['tv-sala-2', 'tv-sala-2-2'])).toBe('tv-sala-2-3');
    expect(screenIdFromName('WOD', ['wod', 'wod-2'])).toBe('wod-3');
  });

  it('always produces a valid id', () => {
    for (const name of ['TV sala 2', '¡Hola!', 'a b c', '---', 'Ñandú']) {
      expect(normalizeScreenId(screenIdFromName(name, []))).not.toBeNull();
    }
  });
});
