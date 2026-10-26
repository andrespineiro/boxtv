import { describe, expect, it } from 'vitest';
import { computeTimerView, formatTime } from './timer';
import type { TimerState } from './types/signage';

const START = 1_700_000_000_000;

function timer(overrides: Partial<TimerState> = {}): TimerState {
  return {
    status: 'running',
    mode: 'countdown',
    workSeconds: 60,
    restSeconds: 0,
    rounds: 1,
    currentRound: 1,
    startedAt: START,
    pausedAt: null,
    ...overrides,
  };
}

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(9)).toBe('00:09');
    expect(formatTime(59)).toBe('00:59');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(125)).toBe('02:05');
  });

  it('adds hours only when needed', () => {
    expect(formatTime(3599)).toBe('59:59');
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('never renders negative values', () => {
    expect(formatTime(-10)).toBe('00:00');
  });
});

describe('computeTimerView', () => {
  it('describes an idle timer', () => {
    const view = computeTimerView(timer({ status: 'idle', startedAt: null }), START);
    expect(view.phase).toBe('idle');
    expect(view.remaining).toBe(60);
    expect(view.phaseTotal).toBe(60);
    expect(view.progress).toBe(0);
    expect(view.label).toBe('LISTO');
  });

  it('describes a finished timer', () => {
    const view = computeTimerView(timer({ status: 'finished' }), START);
    expect(view.phase).toBe('finished');
    expect(view.remaining).toBe(0);
    expect(view.progress).toBe(1);
    expect(view.label).toBe('FIN');
  });

  it('counts down a countdown timer', () => {
    const atStart = computeTimerView(timer(), START);
    expect(atStart.phase).toBe('work');
    expect(atStart.remaining).toBe(60);
    expect(atStart.progress).toBe(0);
    expect(atStart.label).toBe('CUENTA ATRÁS');

    const halfway = computeTimerView(timer(), START + 30_500);
    expect(halfway.remaining).toBe(30);
    expect(halfway.progress).toBeCloseTo(0.5);
  });

  it('flips to finished when a countdown reaches zero', () => {
    const view = computeTimerView(timer(), START + 60_000);
    expect(view.phase).toBe('finished');
    expect(view.remaining).toBe(0);
    expect(view.progress).toBe(1);
    expect(view.label).toBe('FIN');
  });

  it('freezes a paused timer at pausedAt, regardless of now', () => {
    const paused = timer({ status: 'paused', pausedAt: START + 20_000 });
    const view = computeTimerView(paused, START + 120_000);
    expect(view.phase).toBe('paused');
    expect(view.remaining).toBe(40);
    expect(view.progress).toBeCloseTo(1 / 3);
  });

  it('falls back to now when a paused timer has no pausedAt', () => {
    const paused = timer({ status: 'paused', pausedAt: null });
    const view = computeTimerView(paused, START + 15_000);
    expect(view.phase).toBe('paused');
    expect(view.remaining).toBe(45);
  });

  it('labels AMRAP mode', () => {
    expect(computeTimerView(timer({ mode: 'amrap' }), START).label).toBe('AMRAP');
  });

  it('walks through interval work/rest rounds', () => {
    const intervals = timer({
      mode: 'intervals',
      workSeconds: 30,
      restSeconds: 15,
      rounds: 2,
    });

    const work1 = computeTimerView(intervals, START + 1_000);
    expect(work1.phase).toBe('work');
    expect(work1.round).toBe(1);
    expect(work1.remaining).toBe(29);
    expect(work1.label).toBe('TRABAJO');

    const rest1 = computeTimerView(intervals, START + 30_000);
    expect(rest1.phase).toBe('rest');
    expect(rest1.round).toBe(1);
    expect(rest1.remaining).toBe(15);
    expect(rest1.label).toBe('DESCANSO');

    const work2 = computeTimerView(intervals, START + 45_000);
    expect(work2.phase).toBe('work');
    expect(work2.round).toBe(2);
    expect(work2.remaining).toBe(30);

    const done = computeTimerView(intervals, START + 90_000);
    expect(done.phase).toBe('finished');
    expect(done.round).toBe(2);
    expect(done.label).toBe('FIN');
  });

  it('skips rest phases when restSeconds is zero', () => {
    const intervals = timer({
      mode: 'intervals',
      workSeconds: 30,
      restSeconds: 0,
      rounds: 2,
    });
    const view = computeTimerView(intervals, START + 30_000);
    expect(view.phase).toBe('work');
    expect(view.round).toBe(2);
    expect(view.remaining).toBe(30);
  });

  it('keeps the interval phase but marks paused', () => {
    const intervals = timer({
      status: 'paused',
      mode: 'intervals',
      workSeconds: 30,
      restSeconds: 15,
      rounds: 2,
      pausedAt: START + 10_000,
    });
    const view = computeTimerView(intervals, START + 80_000);
    expect(view.phase).toBe('paused');
    expect(view.remaining).toBe(20);
    expect(view.round).toBe(1);
  });

  it('clamps malformed rounds to at least one', () => {
    const view = computeTimerView(timer({ rounds: 0 }), START);
    expect(view.rounds).toBe(1);
    expect(view.round).toBe(1);
  });

  it('uses the round from state before the timer starts', () => {
    const view = computeTimerView(
      timer({ status: 'idle', startedAt: null, currentRound: 3 }),
      START,
    );
    expect(view.round).toBe(3);
  });
});
