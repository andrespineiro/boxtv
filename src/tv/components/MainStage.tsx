import { useEffect, useMemo, useState } from 'react';
import type { BrandConfig, CarouselItem, MainContent } from '@/shared/types/signage';
import { isSafeImageUrl, withAlpha } from '@/shared/color';
import { useTimer } from '@/shared/hooks/useTimer';
import { MediaFrame } from './MediaFrame';
import { TimerView } from './TimerView';

type MainStageProps = {
  main: MainContent;
  brand: BrandConfig;
};

export function MainStage({ main, brand }: MainStageProps) {
  return (
    <section className="relative min-h-0 flex-1 overflow-hidden">
      {/* Brand background layer */}
      {brand.background === 'brand' && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 30% 20%, ${withAlpha(
              brand.primaryColor,
              0.35,
            )}, #000 70%)`,
          }}
        />
      )}
      {brand.background === 'image' && brand.backgroundUrl && isSafeImageUrl(brand.backgroundUrl) && (
        <>
          <img
            src={brand.backgroundUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-black/50" />
        </>
      )}
      {brand.background === 'black' && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 35%, ${withAlpha(
              brand.primaryColor,
              0.07,
            )}, #000 78%)`,
          }}
        />
      )}

      <div className="relative z-10 h-full w-full">
        {main.type === 'text' && <TextStage title={main.title} body={main.body} brand={brand} />}
        {main.type === 'image' && <MediaFrame url={main.url} fit={main.fit} />}
        {main.type === 'carousel' && (
          <Carousel items={main.items} secondsPerItem={main.secondsPerItem} brand={brand} />
        )}
        {main.type === 'timer' && <TimerStage main={main} brand={brand} />}
      </div>
    </section>
  );
}

function TextStage({
  title,
  body,
  brand,
}: {
  title: string;
  body: string;
  brand: BrandConfig;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[min(3cqh,3cqw)] px-[6cqw] text-center">
      <h1
        className="max-w-full break-words font-black uppercase leading-[1.05] tracking-tight"
        style={{
          fontSize: 'clamp(1.1rem, min(9cqh, 10cqw), 8rem)',
          color: brand.primaryColor,
          textShadow: `0 0 40px ${withAlpha(brand.primaryColor, 0.35)}`,
        }}
      >
        {title}
      </h1>
      <p
        className="max-w-[80cqw] whitespace-pre-wrap break-words font-medium leading-snug text-white/90"
        style={{ fontSize: 'clamp(0.75rem, min(4.2cqh, 5cqw), 3.5rem)' }}
      >
        {body}
      </p>
    </div>
  );
}

function TimerStage({
  main,
  brand,
}: {
  main: Extract<MainContent, { type: 'timer' }>;
  brand: BrandConfig;
}) {
  const view = useTimer(main.timer);
  if (!view) return null;
  return (
    <TimerView
      view={view}
      primaryColor={brand.primaryColor}
      secondaryColor={brand.secondaryColor}
    />
  );
}

function Carousel({
  items,
  secondsPerItem,
  brand,
}: {
  items: CarouselItem[];
  secondsPerItem: number;
  brand: BrandConfig;
}) {
  const safeItems = useMemo(
    () => (items.length > 0 ? items : [{ type: 'text' as const, title: 'Sin contenido', body: '' }]),
    [items],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [safeItems.length, secondsPerItem]);

  useEffect(() => {
    if (safeItems.length <= 1) return;
    const duration = Math.max(2, secondsPerItem || 8) * 1000;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % safeItems.length);
    }, duration);
    return () => clearInterval(interval);
  }, [safeItems.length, secondsPerItem]);

  const item = safeItems[Math.min(index, safeItems.length - 1)];

  return (
    <div className="relative h-full w-full">
      <div key={index} className="fade-in h-full w-full">
        {item.type === 'image' ? (
          <MediaFrame url={item.url} fit={item.fit} />
        ) : (
          <TextStage title={item.title} body={item.body} brand={brand} />
        )}
      </div>

      {safeItems.length > 1 && (
        <div className="absolute bottom-[2cqh] left-1/2 flex -translate-x-1/2 gap-2">
          {safeItems.map((_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full transition-opacity"
              style={{
                background: i === index ? brand.primaryColor : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
