import { useEffect } from 'react';
import { getItem, setItem, STORAGE_KEYS } from '../storage';

/**
 * Reloads the page every night at 03:00 to free memory on long-running TV
 * browsers. The check runs every 30 seconds and skips if the reload already
 * happened today.
 */
export function useNightlyRefresh(hour = 3): void {
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const stamp = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      // Any tick during the target hour triggers a single reload, so a throttled
      // background timer that misses 03:00 exactly still refreshes that night.
      if (now.getHours() === hour) {
        const last = getItem(STORAGE_KEYS.lastNightlyRefresh, 'session');
        if (last !== stamp) {
          setItem(STORAGE_KEYS.lastNightlyRefresh, stamp, 'session');
          window.location.reload();
        }
      }
    }, 30_000);

    return () => clearInterval(timer);
  }, [hour]);
}
