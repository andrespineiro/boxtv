import type { BrandConfig } from '@/shared/types/signage';
import { headerHeightPct } from '@/shared/defaults';
import { isSafeImageUrl, withAlpha } from '@/shared/color';
import { useClock } from '@/shared/hooks/useClock';

type HeaderBarProps = {
  brand: BrandConfig;
  screenName: string;
};

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export function HeaderBar({ brand, screenName }: HeaderBarProps) {
  const now = useClock();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date = DATE_FORMAT.format(now);

  // A custom title wins over the screen name; both may be empty in theory.
  const title = brand.headerTitle?.trim() || screenName;
  const subtitle = brand.headerSubtitle?.trim();
  const height = headerHeightPct(brand);

  return (
    <header
      className="relative flex shrink-0 items-center justify-between gap-[2cqw] overflow-hidden px-[3cqw]"
      style={{
        height: `${height}cqh`,
        background: `linear-gradient(180deg, ${withAlpha(brand.primaryColor, 0.18)}, ${withAlpha(
          brand.primaryColor,
          0.02,
        )})`,
      }}
    >
      <div className="flex min-w-0 items-center gap-[1.6cqw]">
        {brand.logoUrl && isSafeImageUrl(brand.logoUrl) ? (
          <img
            src={brand.logoUrl}
            alt=""
            className="h-[58%] max-h-[min(88px,10cqh)] w-auto shrink-0 object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="h-[46%] w-[0.55cqw] min-w-[4px] shrink-0 rounded-full"
            style={{ background: brand.primaryColor }}
          />
        )}
        <div className="min-w-0">
          {title && (
            <div
              className="truncate font-black uppercase leading-none tracking-[0.06em] text-white"
              style={{ fontSize: 'clamp(0.85rem, min(4cqh, 5cqw), 3.6rem)' }}
            >
              {title}
            </div>
          )}
          {subtitle && (
            <div
              className="mt-[0.7cqh] truncate font-semibold uppercase tracking-[0.3em]"
              style={{
                fontSize: 'clamp(0.5rem, min(1.7cqh, 2.6cqw), 1.3rem)',
                color: withAlpha(brand.primaryColor, 0.9),
              }}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {brand.showClock && (
        <div className="flex shrink-0 items-baseline gap-[1.5cqw] pl-[2cqw] text-right tabular-nums">
          <span
            className="font-black leading-none text-white"
            style={{ fontSize: 'clamp(1.05rem, min(4.6cqh, 7cqw), 5rem)' }}
          >
            {time}
          </span>
          <span
            className="hidden capitalize text-white/55 sm:inline"
            style={{ fontSize: 'clamp(0.55rem, min(1.9cqh, 2.8cqw), 1.5rem)' }}
          >
            {date}
          </span>
        </div>
      )}

      {/* Accent underline: a subtle brand gradient instead of a hard border. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{
          background: `linear-gradient(90deg, ${brand.primaryColor}, ${withAlpha(
            brand.secondaryColor,
            0.7,
          )} 45%, transparent)`,
        }}
      />
    </header>
  );
}
