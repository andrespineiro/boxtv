import { handleApi } from './api';
import { GymSignageDO } from './durable/GymSignageDO';
import type { Env } from './env';
import { CORS_HEADERS, errorJson } from './http';

export { GymSignageDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return errorJson(message, 500);
      }
    }

    // Everything else is served from the static build (Pages / Workers assets).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
