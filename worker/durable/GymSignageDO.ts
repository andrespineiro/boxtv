import type {
  AdminCommand,
  ConnectionRole,
  Screen,
  ScreenRuntimeStatus,
  TvEvent,
} from '../../src/shared/types/signage';
import { createDefaultScreen, DEFAULT_SCREEN_IDS } from '../../src/shared/defaults';
import { normalizeScreenId, resolveScreenId, screenIdFromName } from '../../src/shared/screenId';
import { parseAdminCommand } from '../commandValidation';
import { applyAdminCommand } from '../domain/applyCommand';

interface Env {
  DEFAULT_GYM_ID?: string;
}

type Attachment = {
  screenId: string;
  role: ConnectionRole;
  connectedAt: number;
  lastSeen: number | null;
};

const SCREENS_KEY = 'screens';
const screenKey = (id: string) => `screen:${id}`;

const SEED_VERSION_KEY = 'seedVersion';
/** Bumped whenever the stored screen set has to be reconciled on boot. */
const SEED_VERSION = 4;

/**
 * One Durable Object per gym. It keeps:
 *  - the persisted `Screen` objects keyed by screen id,
 *  - the live WebSocket connections (TV players + admin panels),
 *  - and broadcasts deltas whenever an admin command mutates state.
 *
 * WebSockets use the hibernation API so idle TVs don't keep the DO awake.
 */
export class GymSignageDO implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly gymId: string;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.gymId = state.id.name || env.DEFAULT_GYM_ID || 'default';
  }

  // ------------------------------- Routing --------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case 'GET /ws':
        return this.handleWebSocket(url);
      case 'GET /state':
        return this.handleGetState(url);
      case 'GET /screens':
        return this.handleListScreens();
      case 'POST /screens':
        return this.handleCreateScreen(request);
      case 'DELETE /screens':
        return this.handleDeleteScreen(url);
      case 'POST /command':
        return this.handleCommand(url, request);
      default:
        return json({ error: 'Not found', route }, 404);
    }
  }

  // ------------------------------ WebSocket --------------------------------

  private async handleWebSocket(url: URL): Promise<Response> {
    const screenId = resolveScreenId(url.searchParams.get('screenId'));
    const role: ConnectionRole = url.searchParams.get('role') === 'admin' ? 'admin' : 'tv';

    const screen = await this.getScreen(screenId);
    if (!screen) return json({ error: 'Pantalla no encontrada' }, 404);
    const subprotocol = url.searchParams.get('subprotocol');

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    const attachment: Attachment = {
      screenId,
      role,
      connectedAt: Date.now(),
      lastSeen: null,
    };
    server.serializeAttachment(attachment);

    this.send(server, { type: 'STATE_SYNC', screen });

    // Echo the accepted subprotocol so the browser completes the handshake.
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: subprotocol ? { 'Sec-WebSocket-Protocol': subprotocol } : undefined,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    const attachment = (ws.deserializeAttachment() as Attachment | null) ?? null;
    if (!attachment) return;

    const msg = parsed as { type?: string };

    if (msg.type === 'PING') {
      attachment.lastSeen = Date.now();
      ws.serializeAttachment(attachment);
      this.send(ws, { type: 'PONG', ts: Date.now() });
      return;
    }

    if (msg.type === 'STATE_REQUEST') {
      const screen = await this.getScreen(attachment.screenId);
      if (screen) this.send(ws, { type: 'STATE_SYNC', screen });
      return;
    }

    if (attachment.role === 'admin' && typeof msg.type === 'string') {
      const command = parseAdminCommand(parsed);
      if (command) await this.dispatchCommand(attachment.screenId, command);
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000, 'closed');
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'error');
    } catch {
      // already closed
    }
  }

  // ------------------------------- Commands --------------------------------

  private async handleCommand(url: URL, request: Request): Promise<Response> {
    let body: { screenId?: unknown; command?: unknown } | null = null;
    try {
      body = (await request.json()) as { screenId?: unknown; command?: unknown };
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    // The screen id in the URL (set by the Worker from the request path) is the
    // source of truth; the body field is only a fallback. Unlike TV routes,
    // admin mutations must NOT fall back to the primary screen: a typo would
    // otherwise edit `wod` silently.
    const screenId = normalizeScreenId(
      url.searchParams.get('screenId') ??
        (typeof body.screenId === 'string' ? body.screenId : null),
    );
    if (!screenId) return json({ error: 'Pantalla no encontrada' }, 404);

    const command = parseAdminCommand(body.command);
    if (!command) {
      return json({ error: 'A valid command is required' }, 400);
    }
    const result = await this.dispatchCommand(screenId, command);
    if (!result) return json({ error: 'Pantalla no encontrada' }, 404);
    return json({ ok: true, screen: result.screen });
  }

  private async dispatchCommand(
    screenId: string,
    command: AdminCommand,
  ): Promise<{ screen: Screen; events: TvEvent[] } | null> {
    const screen = await this.getScreen(screenId);
    if (!screen) return null;

    const result = applyAdminCommand(screen, command, Date.now());
    // Ignore no-ops (e.g. pausing an idle timer) so they don't bump
    // `updatedAt` or rewrite storage.
    if (!result.changed) return { screen: result.screen, events: [] };

    await this.saveScreen(result.screen);
    this.broadcast(screenId, result.events);
    return { screen: result.screen, events: result.events };
  }

  // -------------------------------- Reads ----------------------------------

  private async handleGetState(url: URL): Promise<Response> {
    const screenId = resolveScreenId(url.searchParams.get('screenId'));
    const screen = await this.getScreen(screenId);
    if (!screen) return json({ error: 'Pantalla no encontrada' }, 404);
    return json({ screen });
  }

  private async handleListScreens(): Promise<Response> {
    await this.ensureSeed();
    const ids = (await this.state.storage.get<string[]>(SCREENS_KEY)) ?? [];
    const stored = await Promise.all(ids.map((id) => this.state.storage.get<Screen>(screenKey(id))));
    const screens = stored.filter((screen): screen is Screen => Boolean(screen));

    const connections = this.state.getWebSockets();
    const runtime = new Map<string, ScreenRuntimeStatus>();
    for (const id of ids) {
      runtime.set(id, {
        screenId: id,
        connected: false,
        tvConnections: 0,
        adminConnections: 0,
        lastSeen: null,
      });
    }
    for (const ws of connections) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      const status = runtime.get(att.screenId);
      if (!status) continue;
      if (att.role === 'tv') status.tvConnections += 1;
      else status.adminConnections += 1;
      status.connected = status.tvConnections > 0;
      if (att.lastSeen && (!status.lastSeen || att.lastSeen > status.lastSeen)) {
        status.lastSeen = att.lastSeen;
      }
    }

    return json({
      gymId: this.gymId,
      updatedAt: Date.now(),
      screens,
      statuses: Array.from(runtime.values()),
    });
  }

  // ----------------------------- Screen CRUD -------------------------------

  private async handleCreateScreen(request: Request): Promise<Response> {
    let body: { name?: unknown } | null = null;
    try {
      body = (await request.json()) as { name?: unknown };
    } catch {
      // handled below
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) return json({ error: 'El nombre de la televisión es obligatorio' }, 400);
    if (name.length > 60) {
      return json({ error: 'El nombre no puede superar los 60 caracteres' }, 400);
    }

    await this.ensureSeed();
    const ids = (await this.state.storage.get<string[]>(SCREENS_KEY)) ?? [];
    const id = screenIdFromName(name, ids);

    // A new TV starts with its own content but inherits the look and ads from
    // the first screen, so the box stays visually consistent.
    const base = ids.length ? await this.state.storage.get<Screen>(screenKey(ids[0])) : undefined;
    const screen = createDefaultScreen(id, this.gymId);
    screen.name = name;
    if (base) {
      screen.brand = { ...base.brand };
      screen.ads = { ...base.ads, items: [...base.ads.items] };
    }

    await this.state.storage.put(screenKey(id), screen);
    await this.state.storage.put(SCREENS_KEY, [...ids, id]);
    return json({ ok: true, screen }, 201);
  }

  private async handleDeleteScreen(url: URL): Promise<Response> {
    // Strict: deleting an unknown/malformed id must 404, never target `wod`.
    const screenId = normalizeScreenId(url.searchParams.get('screenId'));
    if (!screenId) return json({ error: 'Pantalla no encontrada' }, 404);
    await this.ensureSeed();
    const ids = (await this.state.storage.get<string[]>(SCREENS_KEY)) ?? [];

    if (!ids.includes(screenId)) return json({ error: 'Pantalla no encontrada' }, 404);
    if (ids.length <= 1) {
      return json({ error: 'Debe quedar al menos una televisión' }, 400);
    }
    if (screenId === DEFAULT_SCREEN_IDS[0]) {
      return json({ error: 'La televisión principal no se puede eliminar' }, 400);
    }

    // Kick any TV still showing this screen so it doesn't keep a dead channel.
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (att?.screenId !== screenId) continue;
      try {
        ws.close(1000, 'screen-deleted');
      } catch {
        // already closed
      }
    }

    await this.state.storage.delete(screenKey(screenId));
    await this.state.storage.put(
      SCREENS_KEY,
      ids.filter((id) => id !== screenId),
    );
    return json({ ok: true });
  }

  // ------------------------------- Storage ---------------------------------

  private async ensureSeed(): Promise<void> {
    const stored = await this.state.storage.get<string[]>(SCREENS_KEY);
    if (!stored) {
      await this.state.storage.put(SCREENS_KEY, [...DEFAULT_SCREEN_IDS]);
      await Promise.all(
        DEFAULT_SCREEN_IDS.map((id) =>
          this.state.storage.put(screenKey(id), createDefaultScreen(id, this.gymId)),
        ),
      );
      await this.state.storage.put(SEED_VERSION_KEY, SEED_VERSION);
      return;
    }

    // One-time migration. v4 introduced multiple TVs, so from now on stored
    // screens are never dropped; we only backfill the primary one if missing.
    const version = (await this.state.storage.get<number>(SEED_VERSION_KEY)) ?? 1;
    if (version >= SEED_VERSION) return;

    // v4: the box supports several TVs. Unlike the old single-TV migration,
    // never drop stored screens — only make sure the primary one exists.
    if (!stored.includes(DEFAULT_SCREEN_IDS[0])) {
      const id = DEFAULT_SCREEN_IDS[0];
      await this.state.storage.put(screenKey(id), createDefaultScreen(id, this.gymId));
      await this.state.storage.put(SCREENS_KEY, [id, ...stored]);
    }
    await this.state.storage.put(SEED_VERSION_KEY, SEED_VERSION);
  }

  private async getScreen(rawScreenId: string): Promise<Screen | null> {
    const screenId = resolveScreenId(rawScreenId);
    await this.ensureSeed();
    return (await this.state.storage.get<Screen>(screenKey(screenId))) ?? null;
  }

  private async saveScreen(screen: Screen): Promise<void> {
    await this.state.storage.put(screenKey(screen.id), screen);
  }

  // ----------------------------- Broadcast ---------------------------------

  private broadcast(screenId: string, events: TvEvent[]): void {
    if (events.length === 0) return;
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att || att.screenId !== screenId) continue;
      for (const event of events) {
        this.send(ws, event);
      }
    }
  }

  private send(ws: WebSocket, event: TvEvent): void {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // socket is gone; hibernation cleanup will handle it
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
