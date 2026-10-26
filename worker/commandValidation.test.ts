import { describe, expect, it } from 'vitest';
import { parseAdminCommand } from './commandValidation';
import {
  MAX_PLAYLIST_ITEMS,
  MAX_SCREEN_NAME_LENGTH,
  MAX_SECONDS_PER_AD,
  MAX_SECONDS_PER_SLIDE,
  MAX_TIMER_ROUNDS,
  MAX_TIMER_SECONDS,
} from '../src/shared/limits';

const brand = {
  logoUrl: 'https://example.com/logo.png',
  primaryColor: '#f97316',
  secondaryColor: '#0ea5e9',
  background: 'black',
  showClock: true,
};

const textMain = { type: 'text', title: 'WOD', body: '21-15-9' };
const imageMain = { type: 'image', url: 'https://example.com/a.png', fit: 'contain' };
const carouselMain = {
  type: 'carousel',
  items: [
    { type: 'image', url: 'https://example.com/a.png', fit: 'cover' },
    { type: 'text', title: 'Hola', body: 'Mundo' },
  ],
  secondsPerItem: 8,
};
const timerState = {
  status: 'running',
  mode: 'intervals',
  workSeconds: 30,
  restSeconds: 15,
  rounds: 5,
  currentRound: 2,
  startedAt: 1000,
  pausedAt: null,
};
const timerMain = { type: 'timer', timer: timerState };
const ads = {
  enabled: true,
  items: [
    { type: 'image', url: 'https://example.com/ad.png', fit: 'blur-fill' },
    { type: 'text', title: 'Patrocinador', subtitle: 'Hoy', imageUrl: 'https://x/y.png' },
  ],
  secondsPerAd: 10,
  pauseDuringTimer: true,
};

describe('parseAdminCommand', () => {
  it('rejects values that are not command objects', () => {
    expect(parseAdminCommand(null)).toBeNull();
    expect(parseAdminCommand(undefined)).toBeNull();
    expect(parseAdminCommand('SET_MAIN')).toBeNull();
    expect(parseAdminCommand([])).toBeNull();
    expect(parseAdminCommand({})).toBeNull();
    expect(parseAdminCommand({ type: 42 })).toBeNull();
    expect(parseAdminCommand({ type: 'UNKNOWN' })).toBeNull();
  });

  it('accepts SET_BRAND', () => {
    const command = parseAdminCommand({ type: 'SET_BRAND', brand });
    expect(command).toEqual({ type: 'SET_BRAND', brand });
  });

  it('accepts optional brand fields', () => {
    const withOptionals = {
      ...brand,
      background: 'image',
      backgroundUrl: 'https://example.com/bg.png',
      headerTitle: 'Box',
      headerSubtitle: 'WOD',
      headerHeightPct: 12,
      adsHeightPct: 22,
    };
    expect(parseAdminCommand({ type: 'SET_BRAND', brand: withOptionals })).toEqual({
      type: 'SET_BRAND',
      brand: withOptionals,
    });
  });

  it('rejects malformed brand payloads', () => {
    expect(parseAdminCommand({ type: 'SET_BRAND' })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_BRAND', brand: { ...brand, logoUrl: 1 } })).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_BRAND', brand: { ...brand, background: 'rainbow' } }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_BRAND', brand: { ...brand, showClock: 'yes' } }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_BRAND', brand: { ...brand, headerHeightPct: '10' } }),
    ).toBeNull();
  });

  it('accepts every SET_MAIN variant', () => {
    for (const content of [textMain, imageMain, carouselMain, timerMain]) {
      expect(parseAdminCommand({ type: 'SET_MAIN', content })).toEqual({
        type: 'SET_MAIN',
        content,
      });
    }
  });

  it('rejects malformed SET_MAIN payloads', () => {
    expect(parseAdminCommand({ type: 'SET_MAIN' })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_MAIN', content: { type: 'video' } })).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_MAIN', content: { ...imageMain, fit: 'stretch' } }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: { ...carouselMain, items: [{ type: 'image', url: 1, fit: 'contain' }] },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_MAIN', content: { ...carouselMain, secondsPerItem: '8' } }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: { type: 'timer', timer: { ...timerState, status: 'paused-forever' } },
      }),
    ).toBeNull();
  });

  it('accepts SET_ADS', () => {
    expect(parseAdminCommand({ type: 'SET_ADS', ads })).toEqual({ type: 'SET_ADS', ads });
  });

  it('rejects malformed SET_ADS payloads', () => {
    expect(parseAdminCommand({ type: 'SET_ADS' })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, enabled: 'yes' } })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, items: [{}] } })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, secondsPerAd: '10' } })).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, pauseDuringTimer: undefined } }),
    ).toBeNull();
  });

  it('accepts START_TIMER', () => {
    const config = { mode: 'amrap', workSeconds: 600, restSeconds: 0, rounds: 1 };
    expect(parseAdminCommand({ type: 'START_TIMER', config })).toEqual({
      type: 'START_TIMER',
      config,
    });
    expect(parseAdminCommand({ type: 'START_TIMER' })).toBeNull();
    expect(
      parseAdminCommand({ type: 'START_TIMER', config: { ...config, mode: 'tabata' } }),
    ).toBeNull();
  });

  it('accepts the payload-less timer commands', () => {
    for (const type of ['PAUSE_TIMER', 'RESUME_TIMER', 'STOP_TIMER', 'RESET_TIMER'] as const) {
      expect(parseAdminCommand({ type, extra: true })).toEqual({ type });
    }
  });

  it('accepts SET_SCREEN_NAME and rejects non-strings', () => {
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME', name: 'TV sala 2' })).toEqual({
      type: 'SET_SCREEN_NAME',
      name: 'TV sala 2',
    });
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME', name: '  TV sala 2  ' })).toEqual({
      type: 'SET_SCREEN_NAME',
      name: 'TV sala 2',
    });
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME', name: 2 })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME' })).toBeNull();
  });

  it('rejects empty or oversized screen names', () => {
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME', name: '' })).toBeNull();
    expect(parseAdminCommand({ type: 'SET_SCREEN_NAME', name: '   ' })).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_SCREEN_NAME', name: 'x'.repeat(MAX_SCREEN_NAME_LENGTH) }),
    ).not.toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_SCREEN_NAME',
        name: 'x'.repeat(MAX_SCREEN_NAME_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('enforces timer bounds', () => {
    const valid = { mode: 'amrap', workSeconds: 600, restSeconds: 0, rounds: 1 };
    expect(
      parseAdminCommand({
        type: 'START_TIMER',
        config: { ...valid, workSeconds: MAX_TIMER_SECONDS + 1 },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'START_TIMER',
        config: { ...valid, workSeconds: -1 },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'START_TIMER', config: { ...valid, rounds: 0 } }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'START_TIMER',
        config: { ...valid, rounds: MAX_TIMER_ROUNDS + 1 },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: {
          type: 'timer',
          timer: {
            ...timerState,
            workSeconds: MAX_TIMER_SECONDS + 1,
          },
        },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: { type: 'timer', timer: { ...timerState, currentRound: 0 } },
      }),
    ).toBeNull();
  });

  it('enforces carousel and ad dwell-time bounds', () => {
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: { ...carouselMain, secondsPerItem: MAX_SECONDS_PER_SLIDE + 1 },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({
        type: 'SET_MAIN',
        content: { ...carouselMain, secondsPerItem: 0 },
      }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, secondsPerAd: MAX_SECONDS_PER_AD + 1 } }),
    ).toBeNull();
    expect(
      parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, secondsPerAd: 0 } }),
    ).toBeNull();
  });

  it('caps playlist length', () => {
    const tooMany = Array.from({ length: MAX_PLAYLIST_ITEMS + 1 }, () => ({
      type: 'text',
      title: 'Ad',
    }));
    expect(parseAdminCommand({ type: 'SET_ADS', ads: { ...ads, items: tooMany } })).toBeNull();
  });

  it('drops unknown extra fields from known commands', () => {
    const command = parseAdminCommand({ type: 'SET_SCREEN_NAME', name: 'A', injected: 'x' });
    expect(command).toEqual({ type: 'SET_SCREEN_NAME', name: 'A' });
    expect(command && 'injected' in command).toBe(false);
  });
});
