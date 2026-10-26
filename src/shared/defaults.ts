import { MAX_TIMER_ROUNDS, MAX_TIMER_SECONDS } from './limits';
import type {
  AdPlaylist,
  BrandConfig,
  Screen,
  TimerConfig,
  TimerState,
} from './types/signage';

/** Stable screen ids created for every box from day one. */
export const DEFAULT_SCREEN_IDS = ['wod'] as const;

export const DEFAULT_BRAND: BrandConfig = {
  logoUrl: '',
  primaryColor: '#f97316',
  secondaryColor: '#0ea5e9',
  background: 'black',
  showClock: true,
  headerTitle: '',
  headerSubtitle: '',
  headerHeightPct: 10,
  adsHeightPct: 20,
};

// --------------------------- Layout proportions ----------------------------

/** Allowed ranges for the adjustable screen proportions (percent of height). */
export const HEADER_PCT_RANGE = { min: 6, max: 20 } as const;
export const ADS_PCT_RANGE = { min: 8, max: 40 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Floors a finite value and clamps it; non-finite input uses `fallback`. */
function clampWhole(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Math.floor(value), min, max);
}

/** Header height in `cqh`, clamped and defaulted for older stored screens. */
export function headerHeightPct(brand: BrandConfig): number {
  const value = brand.headerHeightPct;
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, HEADER_PCT_RANGE.min, HEADER_PCT_RANGE.max)
    : DEFAULT_BRAND.headerHeightPct!;
}

/** Ad bar height in `cqh`, clamped and defaulted for older stored screens. */
export function adsHeightPct(brand: BrandConfig): number {
  const value = brand.adsHeightPct;
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, ADS_PCT_RANGE.min, ADS_PCT_RANGE.max)
    : DEFAULT_BRAND.adsHeightPct!;
}

export const DEFAULT_ADS: AdPlaylist = {
  enabled: false,
  items: [],
  secondsPerAd: 10,
  pauseDuringTimer: true,
};

export function screenNameFromId(id: string): string {
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function emptyTimer(): TimerState {
  return {
    status: 'idle',
    mode: 'countdown',
    workSeconds: 0,
    restSeconds: 0,
    rounds: 1,
    currentRound: 1,
    startedAt: null,
    pausedAt: null,
  };
}

export function timerFromConfig(config: TimerConfig, now: number): TimerState {
  return {
    status: 'running',
    mode: config.mode,
    workSeconds: clampWhole(config.workSeconds, 0, MAX_TIMER_SECONDS, 0),
    restSeconds: clampWhole(config.restSeconds, 0, MAX_TIMER_SECONDS, 0),
    rounds: clampWhole(config.rounds, 1, MAX_TIMER_ROUNDS, 1),
    currentRound: 1,
    startedAt: now,
    pausedAt: null,
  };
}

export function createDefaultScreen(id: string, gymId: string): Screen {
  return {
    id,
    name: screenNameFromId(id),
    gymId,
    brand: { ...DEFAULT_BRAND },
    main: {
      type: 'text',
      title: 'WOD DE HOY',
      body: 'Añade el entrenamiento desde el panel de administración.',
    },
    ads: { ...DEFAULT_ADS },
    updatedAt: 0,
  };
}
