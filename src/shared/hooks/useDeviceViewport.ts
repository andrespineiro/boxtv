import { useEffect, useSyncExternalStore } from 'react';

export type DeviceKind = 'phone' | 'tablet' | 'screen';
export type DeviceOrientation = 'portrait' | 'landscape';

export type DeviceViewport = {
  /** Layout viewport width in CSS pixels. */
  width: number;
  /** Layout viewport height in CSS pixels. */
  height: number;
  orientation: DeviceOrientation;
  kind: DeviceKind;
  isTouch: boolean;
  pixelRatio: number;
};

const PORTRAIT_QUERY = '(orientation: portrait)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** Most phones report a shortest screen side well below this. */
const PHONE_MAX_SHORT_SIDE = 600;
/** Tablets sit between phones and desktop/TV monitors. */
const TABLET_MAX_SHORT_SIDE = 1024;

function emptyViewport(): DeviceViewport {
  return {
    width: 0,
    height: 0,
    orientation: 'landscape',
    kind: 'screen',
    isTouch: false,
    pixelRatio: 1,
  };
}

/**
 * Reads the device once, using the layout viewport (never the pinch-zoomed
 * visual viewport) and the physical screen for the form factor. Both are
 * stable while the mobile browser shows/hides its toolbars, so the UI does not
 * rescale or shift when the user scrolls.
 */
function readViewport(): DeviceViewport {
  if (typeof window === 'undefined') return emptyViewport();

  const width = Math.round(document.documentElement.clientWidth || window.innerWidth);
  const height = Math.round(document.documentElement.clientHeight || window.innerHeight);

  // `screen` is the device size, not the browser window: resizing a phone
  // toolbar (or opening the keyboard) must not change the detected device.
  const screenWidth = window.screen?.width ?? width;
  const screenHeight = window.screen?.height ?? height;
  const shortSide = Math.min(screenWidth, screenHeight);

  const isTouch =
    window.matchMedia?.(COARSE_POINTER_QUERY).matches ??
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

  const kind: DeviceKind = !isTouch
    ? 'screen'
    : shortSide <= PHONE_MAX_SHORT_SIDE
      ? 'phone'
      : shortSide <= TABLET_MAX_SHORT_SIDE
        ? 'tablet'
        : 'screen';

  // Orientation media query is not affected by the address bar height, unlike
  // comparing innerWidth/innerHeight.
  const portrait = window.matchMedia?.(PORTRAIT_QUERY).matches ?? height >= width;

  return {
    width,
    height,
    orientation: portrait ? 'portrait' : 'landscape',
    kind,
    isTouch,
    pixelRatio: window.devicePixelRatio || 1,
  };
}

function sameViewport(a: DeviceViewport, b: DeviceViewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.orientation === b.orientation &&
    a.kind === b.kind &&
    a.isTouch === b.isTouch &&
    a.pixelRatio === b.pixelRatio
  );
}

let current: DeviceViewport | null = null;
let frame: number | null = null;
let teardown: (() => void) | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): DeviceViewport {
  if (!current) current = readViewport();
  return current;
}

function refresh() {
  const next = readViewport();
  if (sameViewport(getSnapshot(), next)) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Coalesces the resize/orientation burst into one React update per frame. */
function scheduleRefresh() {
  if (frame !== null) return;
  frame = window.requestAnimationFrame(() => {
    frame = null;
    refresh();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!teardown) {
    window.addEventListener('resize', scheduleRefresh, { passive: true });
    window.addEventListener('orientationchange', scheduleRefresh, { passive: true });
    // Keyboard/zoom changes only move the visual viewport; listening keeps the
    // reported metrics fresh without using them to resize the whole UI.
    window.visualViewport?.addEventListener('resize', scheduleRefresh, { passive: true });

    teardown = () => {
      window.removeEventListener('resize', scheduleRefresh);
      window.removeEventListener('orientationchange', scheduleRefresh);
      window.visualViewport?.removeEventListener('resize', scheduleRefresh);
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    };
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && teardown) {
      teardown();
      teardown = null;
    }
  };
}

/** Exposes the detected device on <html> so plain CSS can adapt too. */
function applyToDocument(viewport: DeviceViewport) {
  const root = document.documentElement;
  root.dataset.device = viewport.kind;
  root.dataset.orientation = viewport.orientation;
  root.dataset.touch = viewport.isTouch ? 'true' : 'false';
}

/**
 * Detects the real device (phone/tablet/screen, orientation and touch) and
 * keeps it in sync with rotations and viewport changes. Components can read it
 * to adapt the layout instead of assuming a 16:9 television.
 */
export function useDeviceViewport(): DeviceViewport {
  const viewport = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    applyToDocument(viewport);
  }, [viewport]);

  return viewport;
}
