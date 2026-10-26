# Agent guide

This repository is a digital-signage app for CrossFit boxes: a TV player, a
mobile admin panel and a Cloudflare Worker + Durable Object backend that stores
the state and fans it out over WebSockets. Images live in Backblaze B2.

Read this file before changing code. It is written for coding agents: it maps
the repository, lists the invariants that are easy to break, and explains how
to verify a change.

## TL;DR

```bash
npm install
npm run dev        # Vite + Worker + Durable Object on http://localhost:5173
npm run typecheck  # generates binding types + checks app and worker
npm test           # unit tests (Vitest)
npm run build      # typecheck + production build
```

- TV player: `/tv/:screenId` (the bare domain redirects to `/tv/wod`).
- Admin panel: `/admin` (shared-secret gate when `ADMIN_KEY` is set).
- UI copy is Spanish. Code, comments, commits and docs are English.
- Do not commit `.dev.vars`, `.secrets.env`, `.cloudflare/` or `result.json`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `worker/index.ts` | Worker entrypoint: CORS preflight, `/api/*` dispatch, static assets. |
| `worker/api.ts` | `/api/*` routes and WebSocket upgrade forwarding to the DO. |
| `worker/auth.ts` | Admin key checks for HTTP and the WebSocket subprotocol handshake. |
| `worker/http.ts` | `json()` / `errorJson()` helpers and CORS headers. |
| `worker/media.ts` | Image upload validation and the public B2 read proxy. |
| `worker/env.ts` | `Env` bindings interface. |
| `worker/mediaStorage.ts` | S3/SigV4 client for Backblaze B2 (upload + proxy read). |
| `worker/commandValidation.ts` | Runtime validation of untrusted `AdminCommand` JSON. |
| `worker/domain/applyCommand.ts` | Pure command → next `Screen` + `TvEvent[]` state machine. |
| `worker/durable/GymSignageDO.ts` | One Durable Object per gym: persisted screens, WebSockets, broadcast. |
| `src/shared/types/signage.ts` | Domain contract (`Screen`, `AdminCommand`, `TvEvent`, …). Single source of truth. |
| `src/shared/defaults.ts` | Defaults, seeded screen ids, layout proportion helpers. |
| `src/shared/timer.ts` | Pure timer math shared by TV and admin panel. |
| `src/shared/color.ts` | Colour helpers + `isSafeImageUrl` validation. |
| `src/shared/wsKey.ts` | Admin key ↔ WebSocket subprotocol encoding. |
| `src/shared/screenId.ts` | Slug normalisation/validation and id generation from a TV name. |
| `src/shared/api/signageClient.ts` | Typed browser client for the HTTP/WS API. |
| `src/shared/hooks/` | Reusable client hooks (socket, clock, timer, fullscreen, viewport…). |
| `src/tv/` | TV player components (`HeaderBar`, `MainStage`, `AdBar`, `TimerView`). |
| `src/admin/` | Admin panel (gate, dashboard, per-screen editor, editors, preview). |
| `src/App.tsx` | Route table. |
| `*.test.ts` | Co-located Vitest unit tests (`src/**`, `worker/**`). |
| `cloudflare.config.ts` | Worker name, bindings, DO export, static assets. |
| `vitest.config.ts` | Unit-test runner config (node env, `@/` alias). |
| `.dev.vars.example` | Documented local secrets template (copy to `.dev.vars`). |

## Architecture in one screen

```
TV (React) ──WS /api/ws/:id?role=tv────┐
Admin (React) ──WS role=admin──────────┤
Admin ──HTTP POST /api/screens/...──────┴─► Worker ──► GymSignageDO (per gym)
                                              │            · storage: Screen[]
                                              │            · WebSockets (hibernation)
                                              │            · broadcast deltas
                                              └──► B2 (S3) via worker/mediaStorage.ts
```

- The Worker owns HTTP concerns: `worker/index.ts` → `worker/api.ts` → `worker/auth.ts` / `worker/media.ts`.
- The DO owns state and realtime fan-out. It never talks to the browser
  directly; the Worker forwards a synthetic request to `stub.fetch()`.
- The client is optimistic only for local drafts; the server is authoritative.
- The timer is **not** streamed per second. The DO stores `startedAt` /
  `pausedAt`; each client derives the display with `computeTimerView`.

## Invariants (do not break these)

1. **`src/shared/types/signage.ts` is the contract.** Changing a persisted
   shape (`Screen`, `BrandConfig`, `MainContent`, `AdPlaylist`, `TimerState`)
   requires: default/migration handling, `worker/commandValidation.ts`, and a
   check of both TV and admin renderers.
2. **Stored screens must stay backward compatible.** Old screens in DO storage
   may lack newer optional fields. Prefer optional fields plus defaults in
   `src/shared/defaults.ts` over required fields.
3. **The primary screen id is `wod`** (`DEFAULT_SCREEN_IDS`). It cannot be
   deleted and the bare domain/TV routes fall back to it.
4. **Every admin mutation goes through `AdminCommand`.** Validate it with
   `parseAdminCommand`, persist it in the DO, then broadcast a `TvEvent`
   delta. Do not let the TV poll or write state.
5. **The admin key never goes in a URL.** HTTP uses `X-Admin-Key`; WebSockets
   use the `Sec-WebSocket-Protocol` token built by `encodeWsKey`. Keep the
   Worker echo of the accepted subprotocol on the 101 response.
6. **Image URLs must pass `isSafeImageUrl`** (HTTPS or site-relative; no
   protocol-relative `//host`). Render untrusted images only through
   `MediaFrame` / the ad renderer, which enforce this.
7. **The TV layout uses container-query units (`cqw`/`cqh`)** and
   `100svh`/`100dvh`, not fixed pixels or `height: 100%` chains. The same
   components are reused in the 16:9 admin preview, so they must not assume a
   real TV.
8. **`body` is `overflow: hidden`** for the TV. Admin pages must use
   `.admin-scroll` for their own scrolling.
9. **Only `src/shared`, `src/tv` and `src/admin` may be imported by the
   client.** The Worker may import `src/shared` and `worker/*`; never import
   React/admin/TV modules from the Worker.
10. **`ADMIN_KEY` currently has a literal dev default in
    `cloudflare.config.ts`.** Do not "fix" it silently: production should move
    back to `bindings.secret()` + `cf deploy --secrets-file` (see README).

## Common changes

### Add an admin command

1. Add the variant to `AdminCommand` and the matching `TvEvent` (if TVs need
   to react) in `src/shared/types/signage.ts`.
2. Validate it in `worker/commandValidation.ts` (reject unknown shapes).
3. Apply it in `worker/domain/applyCommand.ts` and push the delta event(s);
   `GymSignageDO.dispatchCommand` only persists and broadcasts.
4. Handle the delta in `applyEvent` in `src/shared/hooks/useScreenSocket.ts`.
5. Add the UI in the relevant admin editor and publish it from
   `src/admin/pages/ScreenEditor.tsx`.
6. Add unit tests for validation and the event/reducer path.

### Add a field to `Screen`

1. Extend the type as **optional** unless every stored screen is migrated.
2. Add a default/fallback in `src/shared/defaults.ts`.
3. Validate it in `commandValidation.ts` if it is client-writable.
4. Render it in `src/tv/*` and (when useful) in the admin preview/editor.
5. Add a migration/seed version bump only if existing data must change.

### Add an API endpoint

1. Add the route in `worker/index.ts` (admin routes need `isAuthorized`).
2. Add the typed method to `src/shared/api/signageClient.ts`.
3. Keep `/api/media/*` public (TVs load images with `<img>`); everything that
   mutates state is admin-only.
4. Add a short entry to `docs/api.md`.

### Add an admin tab

1. Extend the `Tab` union and `TABS` in
   `src/admin/pages/ScreenEditor.tsx`.
2. Put the form in `src/admin/components/<Name>Editor.tsx`.
3. Call `patch({ field })`; only dirty fields are published.
4. Make sure the preview (`src/admin/components/Preview.tsx`) reflects it.

## Verification

- `npm run typecheck` must pass for both TS projects. The app and worker have
  separate `tsconfig` files on purpose (DOM vs Worker libs).
- `npm test` runs the unit suite (`vitest run`); `npm run test:watch` watches.
  New pure logic belongs in `src/shared` or `worker/*` so it can be tested
  without a browser or Cloudflare runtime. Tests are co-located as
  `<module>.test.ts`.
- `npm run build` is the full gate used before deploy.
- Manual smoke test: `npm run dev`, open `/admin` and `/tv/wod`; publish a
  text change and confirm the TV updates without reloading.
- The worker typecheck needs generated bindings: `npm run cf-typegen`
  (already part of `npm run typecheck`).

## Gotchas

- `cf` (Cloudflare's new CLI) drives dev/build/deploy. `wrangler` is kept only
  for `tail` and `secret put` while the beta lacks them.
- `.dev.vars` is not read for values declared with `bindings.text(...)`;
  `B2_BUCKET`/`B2_REGION` live in `cloudflare.config.ts`.
- In local dev, B2 is **not** emulated: uploads hit the real bucket, so leave
  `B2_KEY_ID`/`B2_APPLICATION_KEY` empty unless you need uploads.
- React StrictMode double-invokes effects in dev; socket hooks must clean up
  correctly (they do: `closedByUs` + timer cleanup).
- The DO uses WebSocket hibernation: state that must survive a restart belongs
  in storage or `serializeAttachment`, not instance fields.
- `resolveScreenId` / `normalizeScreenId` live in `src/shared/screenId.ts`.
  Malformed ids fall back to the primary screen on TV routes; admin mutations
  should use `normalizeScreenId` + a 404 instead of silently editing `wod`.
- `ScreenEditor` keeps a local draft and only publishes dirty fields, so a
  publish never clobbers a concurrently running timer.
- Admin/screen errors are surfaced in Spanish through `errorMessage` in
  `signageClient`; keep API `{ "error": "…" }` shapes.

## Pull requests

- Keep changes focused; one concern per PR.
- Update this file when you add a new layer, script, invariant or gotcha.
- Include the verification commands you ran in the PR body.
