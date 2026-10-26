import { describe, expect, it } from 'vitest';
import {
  ADS_PCT_RANGE,
  HEADER_PCT_RANGE,
  adsHeightPct,
  createDefaultScreen,
  DEFAULT_BRAND,
  DEFAULT_SCREEN_IDS,
  emptyTimer,
  headerHeightPct,
  screenNameFromId,
  timerFromConfig,
} from './defaults';
import type { BrandConfig } from './types/signage';

function brand(overrides: Partial<BrandConfig> = {}): BrandConfig {
  return { ...DEFAULT_BRAND, ...overrides };
}

describe('layout proportions', () => {
  it('defaults missing values', () => {
    expect(headerHeightPct(brand({ headerHeightPct: undefined }))).toBe(10);
    expect(adsHeightPct(brand({ adsHeightPct: undefined }))).toBe(20);
  });

  it('clamps values into the allowed range', () => {
    expect(headerHeightPct(brand({ headerHeightPct: 0 }))).toBe(HEADER_PCT_RANGE.min);
    expect(headerHeightPct(brand({ headerHeightPct: 999 }))).toBe(HEADER_PCT_RANGE.max);
    expect(adsHeightPct(brand({ adsHeightPct: -5 }))).toBe(ADS_PCT_RANGE.min);
    expect(adsHeightPct(brand({ adsHeightPct: 999 }))).toBe(ADS_PCT_RANGE.max);
  });

  it('keeps valid values untouched', () => {
    expect(headerHeightPct(brand({ headerHeightPct: 14 }))).toBe(14);
    expect(adsHeightPct(brand({ adsHeightPct: 25 }))).toBe(25);
  });

  it('rejects non-finite values', () => {
    expect(headerHeightPct(brand({ headerHeightPct: Number.NaN }))).toBe(10);
    expect(adsHeightPct(brand({ adsHeightPct: Number.POSITIVE_INFINITY }))).toBe(20);
  });
});

describe('screenNameFromId', () => {
  it('title-cases slug segments', () => {
    expect(screenNameFromId('wod')).toBe('Wod');
    expect(screenNameFromId('tv-sala-2')).toBe('Tv Sala 2');
    expect(screenNameFromId('sala_principal')).toBe('Sala Principal');
    expect(screenNameFromId('a--b')).toBe('A B');
    expect(screenNameFromId('')).toBe('');
  });
});

describe('timer helpers', () => {
  it('creates an idle timer', () => {
    expect(emptyTimer()).toEqual({
      status: 'idle',
      mode: 'countdown',
      workSeconds: 0,
      restSeconds: 0,
      rounds: 1,
      currentRound: 1,
      startedAt: null,
      pausedAt: null,
    });
  });

  it('creates a running timer from config and sanitises values', () => {
    const now = 1_234;
    const timer = timerFromConfig(
      { mode: 'intervals', workSeconds: 30.9, restSeconds: -3, rounds: 0 },
      now,
    );
    expect(timer).toEqual({
      status: 'running',
      mode: 'intervals',
      workSeconds: 30,
      restSeconds: 0,
      rounds: 1,
      currentRound: 1,
      startedAt: now,
      pausedAt: null,
    });
  });
});

describe('createDefaultScreen', () => {
  it('builds a complete screen with independent nested objects', () => {
    const screen = createDefaultScreen('tv-sala-2', 'gym-a');
    expect(screen.id).toBe('tv-sala-2');
    expect(screen.name).toBe('Tv Sala 2');
    expect(screen.gymId).toBe('gym-a');
    expect(screen.brand).toEqual(DEFAULT_BRAND);
    expect(screen.brand).not.toBe(DEFAULT_BRAND);
    expect(screen.main.type).toBe('text');
    expect(screen.ads.enabled).toBe(false);
    expect(screen.updatedAt).toBe(0);
  });

  it('keeps the shipped primary screen id stable', () => {
    expect(DEFAULT_SCREEN_IDS).toEqual(['wod']);
  });
});
