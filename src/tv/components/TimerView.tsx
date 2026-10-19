import type { TimerView as TimerViewData } from '@/shared/timer';
import { formatTime } from '@/shared/timer';

type TimerViewProps = {
  view: TimerViewData;
  primaryColor: string;
  secondaryColor: string;
};

export function TimerView({ view, primaryColor, secondaryColor }: TimerViewProps) {
  const isRest = view.phase === 'rest';
  const isFinished = view.phase === 'finished';
  const isPaused = view.phase === 'paused';
  const danger = view.remaining <= 5 && view.remaining > 0 && view.phase !== 'idle';
  const accent = isRest ? secondaryColor : primaryColor;

  const timeText = isFinished ? 'FIN' : formatTime(view.remaining);
  const showProgress = view.phaseTotal > 0;
  const progressPct = Math.round(view.progress * 100);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-[min(3cqh,3cqw)] px-[4cqw]">
      {/* Round indicator */}
      <div className="flex flex-wrap items-center justify-center gap-x-[2cqw] text-center text-[min(2.6cqh,3cqw)] font-bold uppercase tracking-[0.25em]">
        <span style={{ color: accent }}>{isPaused ? 'PAUSA' : view.label}</span>
        {view.mode === 'intervals' && (
          <span className="text-white/50">
            Ronda {view.round}/{view.rounds}
          </span>
        )}
        {view.mode === 'amrap' && (
          <span className="text-white/50">Objetivo {view.rounds} rondas</span>
        )}
      </div>

      {/* Giant digits, sized by the smaller side so they never overflow the
          width on portrait phones. */}
      <div
        className={`max-w-full font-black leading-none tabular-nums ${danger ? 'timer-danger' : ''}`}
        style={{
          fontSize: 'clamp(2rem, min(26cqh, 26cqw), 22rem)',
          color: isFinished ? accent : danger ? '#ef4444' : '#ffffff',
        }}
      >
        {timeText}
      </div>

      {/* Progress bar */}
      {showProgress && !isFinished && (
        <div className="h-[min(2cqh,2cqw)] w-[70cqw] max-w-[70cqw] overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-linear"
            style={{ width: `${progressPct}%`, background: accent }}
          />
        </div>
      )}
    </div>
  );
}
