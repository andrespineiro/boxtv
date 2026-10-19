import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AdminCommand, MainContent, Screen } from '@/shared/types/signage';
import { adsHeightPct, headerHeightPct } from '@/shared/defaults';
import { useAdminScreen } from '@/admin/hooks/useAdminScreen';
import { useAdminScreens } from '@/admin/hooks/useAdminScreens';
import { tvPath } from '@/shared/api/signageClient';
import { Preview } from '@/admin/components/Preview';
import { MainEditor } from '@/admin/components/MainEditor';
import { TimerEditor } from '@/admin/components/TimerEditor';
import { BrandEditor } from '@/admin/components/BrandEditor';
import { AdsEditor } from '@/admin/components/AdsEditor';
import { StatusPanel } from '@/admin/components/StatusPanel';
import { Button, TextInput } from '@/admin/components/ui';

type Tab = 'main' | 'brand' | 'ads' | 'timer' | 'status';

/** Editable screen fields that map 1:1 to an admin command. */
type EditableField = 'main' | 'brand' | 'ads' | 'name';

function isEditableField(field: string): field is EditableField {
  return field === 'main' || field === 'brand' || field === 'ads' || field === 'name';
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'main', label: 'Contenido' },
  { id: 'brand', label: 'Aspecto' },
  { id: 'ads', label: 'Publicidad' },
  { id: 'timer', label: 'Temporizador' },
  { id: 'status', label: 'Estado' },
];

export function ScreenEditor() {
  const { screenId = '' } = useParams();
  const { screen, status, pending, error, send } = useAdminScreen(screenId);
  const { data: allScreens } = useAdminScreens();
  const [draft, setDraft] = useState<Screen | null>(null);
  const [dirtyFields, setDirtyFields] = useState<Set<EditableField>>(() => new Set());
  const [tab, setTab] = useState<Tab>('main');
  const dirty = dirtyFields.size > 0;

  // Keep the local draft in sync with the server while there are no edits.
  // Intentionally keyed only on `screen`: when a publish clears the dirty flags
  // we must not immediately overwrite the freshly published draft with the
  // (possibly stale) `screen` still held by the socket.
  useEffect(() => {
    if (screen && !dirty) setDraft(screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const patch = (partial: Partial<Screen>) => {
    setDraft((current) => (current ? { ...current, ...partial } : current));
    setDirtyFields((current) => {
      const next = new Set(current);
      for (const field of Object.keys(partial)) {
        if (isEditableField(field)) next.add(field);
      }
      return next;
    });
  };

  const publish = async () => {
    if (!draft) return;

    // Only publish the fields the user actually touched, so an unrelated edit
    // never overwrites a timer (or other main content) that changed meanwhile.
    const commands: AdminCommand[] = [];
    if (dirtyFields.has('main')) {
      // A running timer owns its own live state on the server; the draft only
      // carries a placeholder, so keep the server timer (same as the preview).
      const content: MainContent =
        draft.main.type === 'timer' && screen?.main.type === 'timer'
          ? { type: 'timer', timer: screen.main.timer }
          : draft.main;
      commands.push({ type: 'SET_MAIN', content });
    }
    if (dirtyFields.has('brand')) commands.push({ type: 'SET_BRAND', brand: draft.brand });
    if (dirtyFields.has('ads')) commands.push({ type: 'SET_ADS', ads: draft.ads });
    if (dirtyFields.has('name') && (!screen || draft.name !== screen.name)) {
      commands.push({ type: 'SET_SCREEN_NAME', name: draft.name });
    }

    let latest: Screen | null = null;
    for (const command of commands) {
      const result = await send(command);
      if (!result) return; // leave the edits flagged as unsaved
      latest = result;
    }
    // Adopt the server's authoritative copy so the UI never reverts while the
    // socket echo is in flight (or when the admin socket is disconnected).
    if (latest) setDraft(latest);
    setDirtyFields(new Set());
  };

  const discard = () => {
    if (screen) setDraft(screen);
    setDirtyFields(new Set());
  };

  const handleTimerCommand = (command: AdminCommand) => {
    void send(command);
  };

  // The timer is live: preview should use the server tick, not the frozen draft.
  const previewScreen = useMemo<Screen | null>(() => {
    if (!draft) return null;
    if (draft.main.type === 'timer' && screen?.main.type === 'timer') {
      return {
        ...draft,
        main: { type: 'timer', timer: screen.main.timer },
        ads: draft.ads,
        brand: draft.brand,
      };
    }
    return draft;
  }, [draft, screen]);

  const timer = screen?.main.type === 'timer' ? screen.main.timer : null;

  if (!draft || !previewScreen) {
    return (
      <div className="admin-scroll grid place-items-center bg-slate-950 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }

  return (
    <div className="admin-scroll bg-slate-950 pb-28 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/85 px-[4vw] py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Link
            to="/admin"
            aria-label="Volver"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:bg-white/5"
          >
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <TextInput
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              aria-label="Nombre de la pantalla"
              className="!py-2 font-semibold"
            />
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              status === 'open'
                ? 'bg-emerald-500/15 text-emerald-300'
                : status === 'connecting'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-red-500/15 text-red-300'
            }`}
            title={`Conexión: ${status}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'open'
                  ? 'animate-pulse bg-emerald-400'
                  : status === 'connecting'
                    ? 'bg-amber-400'
                    : 'bg-red-400'
              }`}
            />
            {status === 'open' ? 'En vivo' : status === 'connecting' ? 'Conectando' : 'Sin conexión'}
          </span>
          <a
            href={tvPath(draft.id)}
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 sm:block"
          >
            Abrir TV
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl gap-8 px-[4vw] py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Preview first on mobile */}
        <aside className="order-1 mb-6 lg:order-2 lg:mb-0">
          <div className="lg:sticky lg:top-24">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Previsualización 16:9
            </p>
            <Preview screen={previewScreen} />
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>
                Cabecera {headerHeightPct(draft.brand)}% · Principal{' '}
                {Math.max(0, 100 - headerHeightPct(draft.brand) - adsHeightPct(draft.brand))}%
              </span>
              <span>
                Publicidad {draft.ads.enabled ? `${adsHeightPct(draft.brand)}%` : 'off'}
              </span>
            </div>
          </div>
        </aside>

        <div className="order-2 space-y-4 lg:order-1">
          <nav className="flex flex-wrap gap-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  tab === item.id
                    ? 'bg-orange-500 text-black'
                    : 'border border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:p-5">
            {tab === 'main' && (
              <MainEditor value={draft.main} onChange={(main) => patch({ main })} />
            )}
            {tab === 'brand' && (
              <BrandEditor value={draft.brand} onChange={(brand) => patch({ brand })} />
            )}
            {tab === 'ads' && (
              <AdsEditor value={draft.ads} onChange={(ads) => patch({ ads })} />
            )}
            {tab === 'timer' && (
              <TimerEditor timer={timer} onCommand={handleTimerCommand} pending={pending} />
            )}
            {tab === 'status' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-300">
                  Última actualización: {new Date(draft.updatedAt).toLocaleString('es-ES')}
                </p>
                <StatusPanel statuses={allScreens?.statuses ?? []} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Publish bar */}
      <div className="admin-publish-bar fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 px-[4vw] py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-sm text-slate-400">
            {dirty ? 'Cambios sin publicar' : 'Todo publicado'}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={!dirty || pending} onClick={discard}>
              Descartar
            </Button>
            <Button variant="primary" disabled={!dirty || pending} onClick={() => void publish()}>
              {pending ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
