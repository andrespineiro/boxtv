// ---------------------------------------------------------------------------
// Pure state machine for admin commands.
//
// The Durable Object is responsible for loading/persisting a Screen and for
// broadcasting events; this module only decides what the next Screen is and
// which deltas TVs should receive. Keeping it pure makes the command semantics
// testable without a Cloudflare runtime.
// ---------------------------------------------------------------------------

import type { AdminCommand, MainContent, Screen, TvEvent } from '../../src/shared/types/signage';
import { timerFromConfig } from '../../src/shared/defaults';

export type ApplyCommandResult =
  | { changed: true; screen: Screen; events: TvEvent[] }
  | { changed: false; screen: Screen; events: [] };

/**
 * Applies `command` to `screen` at `now` (epoch ms).
 *
 * - Never mutates the input screen.
 * - Returns `changed: false` for no-ops (unknown timer state, pausing an idle
 *   timer, …) so callers can skip storage writes and broadcasts.
 * - Bumps `updatedAt` only when something actually changed.
 */
export function applyAdminCommand(
  screen: Screen,
  command: AdminCommand,
  now: number,
): ApplyCommandResult {
  const events: TvEvent[] = [];
  let next: Screen = screen;

  switch (command.type) {
    case 'SET_BRAND':
      next = { ...screen, brand: command.brand };
      events.push({ type: 'BRAND_CHANGED', brand: command.brand, updatedAt: now });
      break;

    case 'SET_MAIN':
      next = { ...screen, main: command.content };
      events.push({ type: 'CONTENT_CHANGED', main: command.content, updatedAt: now });
      if (command.content.type === 'timer') {
        events.push({ type: 'TIMER_CHANGED', timer: command.content.timer, updatedAt: now });
      }
      break;

    case 'SET_ADS':
      next = { ...screen, ads: command.ads };
      events.push({ type: 'ADS_CHANGED', ads: command.ads, updatedAt: now });
      break;

    case 'START_TIMER': {
      const timer = timerFromConfig(command.config, now);
      const main: MainContent = { type: 'timer', timer };
      next = { ...screen, main };
      events.push({ type: 'TIMER_CHANGED', timer, updatedAt: now });
      events.push({ type: 'CONTENT_CHANGED', main, updatedAt: now });
      break;
    }

    case 'PAUSE_TIMER':
    case 'RESUME_TIMER':
    case 'STOP_TIMER':
    case 'RESET_TIMER': {
      if (screen.main.type !== 'timer') break;
      const timer = { ...screen.main.timer };
      let changed = false;

      if (command.type === 'PAUSE_TIMER' && timer.status === 'running') {
        timer.status = 'paused';
        timer.pausedAt = now;
        changed = true;
      } else if (command.type === 'RESUME_TIMER' && timer.status === 'paused') {
        if (timer.pausedAt && timer.startedAt) {
          timer.startedAt += now - timer.pausedAt;
        }
        timer.pausedAt = null;
        timer.status = 'running';
        changed = true;
      } else if (
        command.type === 'STOP_TIMER' &&
        (timer.status === 'running' || timer.status === 'paused')
      ) {
        timer.status = 'finished';
        timer.pausedAt = null;
        changed = true;
      } else if (command.type === 'RESET_TIMER' && timer.status !== 'idle') {
        timer.status = 'idle';
        timer.startedAt = null;
        timer.pausedAt = null;
        timer.currentRound = 1;
        changed = true;
      }

      // A no-op timer command (e.g. pausing an idle timer) changes nothing.
      if (!changed) break;
      const main: MainContent = { type: 'timer', timer };
      next = { ...screen, main };
      events.push({ type: 'TIMER_CHANGED', timer, updatedAt: now });
      events.push({ type: 'CONTENT_CHANGED', main, updatedAt: now });
      break;
    }

    case 'SET_SCREEN_NAME':
      next = { ...screen, name: command.name };
      events.push({ type: 'SCREEN_NAME_CHANGED', name: command.name, updatedAt: now });
      break;
  }

  if (events.length === 0) return { changed: false, screen, events: [] };

  next = { ...next, updatedAt: now };
  return { changed: true, screen: next, events };
}
