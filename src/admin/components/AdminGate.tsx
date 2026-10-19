import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  getAdminKey,
  onUnauthorized,
  setAdminKey,
  signageClient,
} from '@/shared/api/signageClient';

type AuthState = 'checking' | 'authorized' | 'locked';

/**
 * Lightweight shared-secret gate for the admin panel.
 *
 * If the Worker has no `ADMIN_KEY` configured the API accepts any request and
 * the panel opens directly (handy for local development).
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('checking');
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the user is currently inside the panel, so we can tell a
  // failed first attempt (wrong key) apart from a key that stopped working
  // mid-session (e.g. the Worker was redeployed with a new key).
  const authorizedRef = useRef(false);

  const validate = async (key: string, { silent = false }: { silent?: boolean } = {}) => {
    setAdminKey(key);
    try {
      await signageClient.listScreens();
      authorizedRef.current = true;
      setState('authorized');
      setError(null);
    } catch (err) {
      authorizedRef.current = false;
      const message = err instanceof Error ? err.message : 'Error';
      if (message.toLowerCase().includes('unauthorized')) {
        // Don't scold the user on the automatic first check when no key was
        // provided yet; only show the error after an actual attempt.
        setError(silent && !key ? null : 'Clave incorrecta');
      } else {
        setError(message);
      }
      setState('locked');
    }
  };

  useEffect(() => {
    // Any admin request answered with 401 (stale/changed key) drops us back to
    // the password form instead of leaving the panel showing errors.
    const unsubscribe = onUnauthorized(() => {
      if (authorizedRef.current) {
        setError('La clave ha cambiado o ya no es válida. Vuelve a introducirla.');
      }
      authorizedRef.current = false;
      setState('locked');
    });
    void validate(getAdminKey(), { silent: true });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'checking') {
    return (
      <div className="admin-scroll grid place-items-center bg-slate-950 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      </div>
    );
  }
  if (state === 'authorized') return <>{children}</>;

  return <KeyScreen error={error} onUnlock={validate} />;
}

function KeyScreen({
  error,
  onUnlock,
}: {
  error: string | null;
  onUnlock: (key: string) => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="admin-scroll relative grid place-items-center overflow-hidden bg-slate-950 p-6 text-white">
      {/* Soft brand glow behind the card. */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onUnlock(value.trim());
        }}
        className="relative w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-slate-900/80 p-7 shadow-2xl shadow-black/50 backdrop-blur"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-lg font-black text-black shadow-lg shadow-orange-500/20">
            B
          </span>
          <div>
            <h1 className="text-lg font-bold">Panel de administración</h1>
            <p className="text-sm text-slate-400">Introduce la clave del box para continuar.</p>
          </div>
        </div>

        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Clave secreta"
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-center text-white tracking-widest outline-none transition focus:border-orange-500"
        />

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-black transition hover:bg-orange-400"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
