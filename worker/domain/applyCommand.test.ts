import { describe, expect, it } from 'vitest';
import { applyAdminCommand } from './applyCommand';
import { createDefaultScreen, emptyTimer, timerFromConfig } from '../../src/shared/defaults';
import type { AdminCommand, Screen, TimerState } from '../../src/shared/types/signage';

const NOW = 1_700_000_100_000;

function screen(overrides: Partial<Screen> = {}): Screen {
  return { ...createDefaultScreen('wod', 'gym'), updatedAt: 1_700_000_000_000, ...overrides };
}

function timerScreen(timer: TimerState, overrides: Partial<Screen> = {}): Screen {
  return screen({ main: { type: 'timer', timer }, ...overrides });
}

function runningTimer(overrides: Partial<TimerState> = {}): TimerState {
  return { ...timerFromConfig({ mode: 'countdown', workSeconds: 60, restSeconds: 0, rounds: 1 }, 1_000), ...overrides };
}

function apply(base: Screen, command: AdminCommand) {
  return applyAdminCommand(base, command, NOW);
}

describe('applyAdminCommand', () => {
  it('SET_BRAND replaces the brand and emits BRAND_CHANGED', () => {
    const base = screen();
    const brand = { ...base.brand, primaryColor: '#ff0000' };
    const result = apply(base, { type: 'SET_BRAND', brand });

    expect(result.changed).toBe(true);
    expect(result.screen.brand).toBe(brand);
    expect(result.screen.updatedAt).toBe(NOW);
    expect(result.events).toEqual([{ type: 'BRAND_CHANGED', brand, updatedAt: NOW }]);
    expect(base.brand.primaryColor).toBe('#f97316');
  });

  it('SET_MAIN emits CONTENT_CHANGED', () => {
    const base = screen();
    const content = { type: 'text' as const, title: 'Nuevo', body: 'WOD' };
    const result = apply(base, { type: 'SET_MAIN', content });

    expect(result.changed).toBe(true);
    expect(result.screen.main).toEqual(content);
    expect(result.events).toEqual([{ type: 'CONTENT_CHANGED', main: content, updatedAt: NOW }]);
  });

  it('SET_MAIN with a timer also emits TIMER_CHANGED', () => {
    const timer = emptyTimer();
    const result = apply(screen(), { type: 'SET_MAIN', content: { type: 'timer', timer } });

    expect(result.events.map((event) => event.type)).toEqual([
      'CONTENT_CHANGED',
      'TIMER_CHANGED',
    ]);
  });

  it('SET_ADS replaces the playlist', () => {
    const base = screen();
    const ads = { ...base.ads, enabled: true, secondsPerAd: 5 };
    const result = apply(base, { type: 'SET_ADS', ads });

    expect(result.screen.ads).toBe(ads);
    expect(result.events).toEqual([{ type: 'ADS_CHANGED', ads, updatedAt: NOW }]);
  });

  it('START_TIMER replaces main with a running timer', () => {
    const result = apply(screen(), {
      type: 'START_TIMER',
      config: { mode: 'intervals', workSeconds: 30.9, restSeconds: 15, rounds: 3 },
    });

    expect(result.changed).toBe(true);
    if (result.screen.main.type !== 'timer') throw new Error('expected timer');
    expect(result.screen.main.timer).toEqual({
      status: 'running',
      mode: 'intervals',
      workSeconds: 30,
      restSeconds: 15,
      rounds: 3,
      currentRound: 1,
      startedAt: NOW,
      pausedAt: null,
    });
    expect(result.events.map((event) => event.type)).toEqual([
      'TIMER_CHANGED',
      'CONTENT_CHANGED',
    ]);
  });

  it('PAUSE_TIMER pauses a running timer without mutating the input', () => {
    const base = timerScreen(runningTimer());
    const before = JSON.parse(JSON.stringify(base)) as Screen;
    const result = apply(base, { type: 'PAUSE_TIMER' });

    expect(result.changed).toBe(true);
    if (result.screen.main.type !== 'timer') throw new Error('expected timer');
    expect(result.screen.main.timer.status).toBe('paused');
    expect(result.screen.main.timer.pausedAt).toBe(NOW);
    expect(result.events.map((event) => event.type)).toEqual([
      'TIMER_CHANGED',
      'CONTENT_CHANGED',
    ]);
    expect(base).toEqual(before);
  });

  it('ignores timer commands when main is not a timer', () => {
    for (const command of [
      { type: 'PAUSE_TIMER' },
      { type: 'RESUME_TIMER' },
      { type: 'STOP_TIMER' },
      { type: 'RESET_TIMER' },
    ] as const) {
      const base = screen();
      const result = apply(base, command);
      expect(result).toEqual({ changed: false, screen: base, events: [] });
    }
  });

  it('treats invalid timer transitions as no-ops', () => {
    const paused = timerScreen(runningTimer({ status: 'paused', pausedAt: 2_000 }));
    const idle = timerScreen(emptyTimer());
    const finished = timerScreen(runningTimer({ status: 'finished' }));

    expect(apply(paused, { type: 'PAUSE_TIMER' }).changed).toBe(false);
    expect(apply(idle, { type: 'PAUSE_TIMER' }).changed).toBe(false);
    expect(apply(finished, { type: 'PAUSE_TIMER' }).changed).toBe(false);
    expect(apply(idle, { type: 'RESUME_TIMER' }).changed).toBe(false);
    expect(apply(idle, { type: 'STOP_TIMER' }).changed).toBe(false);
    expect(apply(idle, { type: 'RESET_TIMER' }).changed).toBe(false);
  });

  it('does not bump updatedAt on a no-op', () => {
    const base = timerScreen(emptyTimer());
    const result = apply(base, { type: 'RESUME_TIMER' });
    expect(result.changed).toBe(false);
    expect(result.screen.updatedAt).toBe(base.updatedAt);
  });

  it('RESUME_TIMER shifts startedAt by the pause duration', () => {
    const base = timerScreen(
      runningTimer({ status: 'paused', startedAt: 1_000, pausedAt: NOW - 5_000 }),
    );
    const result = apply(base, { type: 'RESUME_TIMER' });

    if (result.screen.main.type !== 'timer') throw new Error('expected timer');
    expect(result.screen.main.timer.status).toBe('running');
    expect(result.screen.main.timer.pausedAt).toBeNull();
    expect(result.screen.main.timer.startedAt).toBe(1_000 + (NOW - (NOW - 5_000)));
  });

  it('RESUME_TIMER leaves startedAt alone when pause metadata is missing', () => {
    const base = timerScreen(runningTimer({ status: 'paused', startedAt: null, pausedAt: null }));
    const result = apply(base, { type: 'RESUME_TIMER' });

    if (result.screen.main.type !== 'timer') throw new Error('expected timer');
    expect(result.screen.main.timer.startedAt).toBeNull();
    expect(result.screen.main.timer.status).toBe('running');
  });

  it('STOP_TIMER finishes running and paused timers', () => {
    for (const status of ['running', 'paused'] as const) {
      const base = timerScreen(runningTimer({ status, pausedAt: status === 'paused' ? 2_000 : null }));
      const result = apply(base, { type: 'STOP_TIMER' });
      if (result.screen.main.type !== 'timer') throw new Error('expected timer');
      expect(result.screen.main.timer.status).toBe('finished');
      expect(result.screen.main.timer.pausedAt).toBeNull();
    }
  });

  it('RESET_TIMER returns the timer to idle and round 1', () => {
    const base = timerScreen(runningTimer({ currentRound: 4 }));
    const result = apply(base, { type: 'RESET_TIMER' });

    if (result.screen.main.type !== 'timer') throw new Error('expected timer');
    expect(result.screen.main.timer).toMatchObject({
      status: 'idle',
      startedAt: null,
      pausedAt: null,
      currentRound: 1,
    });
  });

  it('SET_SCREEN_NAME renames the screen', () => {
    const result = apply(screen(), { type: 'SET_SCREEN_NAME', name: 'TV sala 2' });
    expect(result.screen.name).toBe('TV sala 2');
    expect(result.events).toEqual([
      { type: 'SCREEN_NAME_CHANGED', name: 'TV sala 2', updatedAt: NOW },
    ]);
  });
});
