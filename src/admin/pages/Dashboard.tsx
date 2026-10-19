import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MainContent, Screen, ScreenRuntimeStatus } from '@/shared/types/signage';
import { DEFAULT_SCREEN_IDS } from '@/shared/defaults';
import { useAdminScreens } from '@/admin/hooks/useAdminScreens';
import { signageClient, tvPath } from '@/shared/api/signageClient';
import { Button, TextInput } from '@/admin/components/ui';
import { Preview } from '@/admin/components/Preview';
import { formatRelative } from '@/admin/components/StatusPanel';

const MAIN_LABELS: Record<MainContent['type'], string> = {
  text: 'Texto / WOD',
  image: 'Imagen',
  carousel: 'Carrusel',
  timer: 'Temporizador',
};

const PRIMARY_SCREEN_ID = DEFAULT_SCREEN_IDS[0];

export function Dashboard() {
  const { data, error, loading, refresh } = useAdminScreens();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    setActionError(null);
    try {
      await signageClient.createScreen(trimmed);
      setName('');
      setAdding(false);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo añadir la televisión');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (screen: Screen) => {
    const confirmed = window.confirm(
      `¿Eliminar la televisión «${screen.name}»? Su contenido y ajustes se perderán.`,
    );
    if (!confirmed) return;

    setDeletingId(screen.id);
    setActionError(null);
    try {
      await signageClient.deleteScreen(screen.id);
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo eliminar la televisión');
    } finally {
      setDeletingId(null);
    }
  };

  const count = data?.screens.length ?? 0;

  return (
    <div className="admin-scroll bg-slate-950 pb-16 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/85 px-[4vw] py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-base font-black text-black shadow-lg shadow-orange-500/20">
              B
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold leading-tight">Box TV</h1>
              <p className="truncate text-xs text-slate-400">
                {data
                  ? `Gimnasio: ${data.gymId} · ${count} ${count === 1 ? 'televisión' : 'televisiones'}`
                  : 'Cargando…'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" onClick={() => setAdding((value) => !value)}>
              {adding ? 'Cerrar' : '+ Añadir TV'}
            </Button>
            <Button variant="ghost" onClick={() => void refresh()}>
              Actualizar
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-[4vw] py-6">
        {error && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {actionError && (
          <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {actionError}
          </p>
        )}

        {adding && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
            className="space-y-3 rounded-2xl border border-white/10 bg-slate-900 p-4"
          >
            <div>
              <h2 className="text-sm font-semibold">Añadir televisor</h2>
              <p className="text-xs text-slate-500">
                Hereda el aspecto y la publicidad de la TV principal. Después podrás darle su
                propio contenido y enlace.
              </p>
            </div>
            <TextInput
              autoFocus
              value={name}
              maxLength={60}
              placeholder="Ej. TV sala 2"
              aria-label="Nombre de la nueva televisión"
              onChange={(event) => setName(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={creating}
                onClick={() => {
                  setAdding(false);
                  setName('');
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!name.trim() || creating}>
                {creating ? 'Creando…' : 'Crear televisión'}
              </Button>
            </div>
          </form>
        )}

        {loading && <p className="text-sm text-slate-400">Cargando pantallas…</p>}

        {data?.screens.map((screen) => {
          const status = data.statuses.find((s) => s.screenId === screen.id);
          return (
            <ScreenCard
              key={screen.id}
              screen={screen}
              status={status}
              deleting={deletingId === screen.id}
              onDelete={() => void remove(screen)}
            />
          );
        })}
      </main>
    </div>
  );
}

function ScreenCard({
  screen,
  status,
  deleting,
  onDelete,
}: {
  screen: Screen;
  status: ScreenRuntimeStatus | undefined;
  deleting: boolean;
  onDelete: () => void;
}) {
  const connected = status?.connected ?? false;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    const url = new URL(tvPath(screen.id), window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context): the "Ver" button still
      // lets the admin copy the URL from the address bar.
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-xl shadow-black/40">
      {/* Live mirror of what the TV is showing right now. */}
      <div className="p-3 pb-0">
        <Preview screen={screen} />
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{screen.name}</p>
            <p className="truncate text-xs text-slate-500">
              {MAIN_LABELS[screen.main.type]}
              {status?.lastSeen ? ` · ${formatRelative(status.lastSeen)}` : ''}
            </p>
          </div>

          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-300'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'animate-pulse bg-emerald-400' : 'bg-slate-400'}`}
            />
            {connected ? 'En vivo' : 'Desconectada'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <a
            href={tvPath(screen.id)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5"
          >
            Ver
          </a>
          <Link
            to={`/admin/${screen.id}`}
            className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            Editar
          </Link>
          {screen.id !== PRIMARY_SCREEN_ID && (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="rounded-lg border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
