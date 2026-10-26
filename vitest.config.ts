import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Dedicated config: the app's `vite.config.ts` loads the Cloudflare plugin and
// is meant for `cf dev`/`cf build`, not for unit tests. Tests only need the
// `@/` alias so shared modules resolve exactly like in the app.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts'],
    restoreMocks: true,
  },
});
