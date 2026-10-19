import { useEffect, useMemo, useState } from 'react';
import type { AdItem, AdPlaylist, BrandConfig } from '@/shared/types/signage';
import { isSafeImageUrl, withAlpha } from '@/shared/color';

type AdBarProps = {
  ads: AdPlaylist;
  brand: BrandConfig;
  /** When true the bar collapses to give the timer full attention. */
  compact?: boolean;
  /** Full height as a percentage of the screen height (default 20). */
  heightPct?: number;
};

export function AdBar({ ads, brand, compact = false, heightPct }: AdBarProps) {
  const items = useMemo(() => ads.items.filter((item) => hasContent(item)), [ads.items]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [items.length, ads.secondsPerAd]);

  useEffect(() => {
    if (!ads.enabled || items.length <= 1 || compact) return;
    const duration = Math.max(3, ads.secondsPerAd || 10) * 1000;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, duration);
    return () => clearInterval(interval);
  }, [ads.enabled, items.length, ads.secondsPerAd, compact]);

  if (!ads.enabled || items.length === 0) return null;

  const item = items[Math.min(index, items.length - 1)];
  const normalPct = heightPct && heightPct > 0 ? heightPct : 20;
  const compactPct = Math.max(6, Math.round(normalPct * 0.4));

  return (
    <footer
      className="relative overflow-hidden border-t"
      style={{
        height: `${compact ? compactPct : normalPct}cqh`,
        minHeight: compact ? 42 : 72,
        borderColor: withAlpha(brand.primaryColor, 0.35),
        background: `linear-gradient(180deg, ${withAlpha(brand.primaryColor, 0.08)}, #000 90%)`,
      }}
    >
      <div key={index} className="ad-enter h-full w-full">
        <AdContent item={item} brand={brand} compact={compact} />
      </div>

      {items.length > 1 && (
        <div className="absolute right-[2cqw] top-1/2 flex -translate-y-1/2 gap-1.5">
          {items.map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i === index ? brand.primaryColor : 'rgba(255,255,255,0.3)' }}
            />
          ))}
        </div>
      )}
    </footer>
  );
}

function AdContent({
  item,
  brand,
  compact,
}: {
  item: AdItem;
  brand: BrandConfig;
  compact: boolean;
}) {
  if (item.type === 'image') {
    if (!isSafeImageUrl(item.url)) {
      return (
        <div className="grid h-full w-full place-items-center">
          <span className="text-sm text-white/50">Imagen no válida (usa HTTPS)</span>
        </div>
      );
    }

    const fit = item.fit ?? 'contain';

    if (fit === 'blur-fill') {
      return (
        <div className="relative h-full w-full overflow-hidden">
          <img
            src={item.url}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
          />
          <div className="absolute inset-0 bg-black/40" />
          <img
            src={item.url}
            alt="Publicidad"
            className="relative z-10 h-full w-full object-contain px-[2cqw] py-[1.5cqh]"
          />
        </div>
      );
    }

    return (
      <div className="flex h-full w-full items-center justify-center px-[2cqw] py-[1.5cqh]">
        <img
          src={item.url}
          alt="Publicidad"
          className={
            fit === 'cover'
              ? 'h-full w-full object-cover'
              : 'h-full max-h-full w-auto max-w-[90%] object-contain'
          }
          style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center gap-[2cqw] px-[3cqw]">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="h-[80%] w-auto max-w-[14cqw] object-contain"
          style={{ display: compact ? 'none' : undefined }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className="truncate font-black uppercase leading-tight"
          style={{
            fontSize: compact
              ? 'clamp(0.7rem, min(3.2cqh, 3.4cqw), 2rem)'
              : 'clamp(0.85rem, min(5cqh, 6cqw), 3.2rem)',
            color: brand.primaryColor,
          }}
        >
          {item.title}
        </span>
        {item.subtitle && !compact && (
          <span
            className="truncate text-white/80"
            style={{ fontSize: 'clamp(0.6rem, min(3cqh, 4cqw), 2rem)' }}
          >
            {item.subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

function hasContent(item: AdItem): boolean {
  if (item.type === 'image') return Boolean(item.url);
  return Boolean(item.title);
}
