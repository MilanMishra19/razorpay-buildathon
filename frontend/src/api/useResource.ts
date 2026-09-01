import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useResource<T>(load: (token: string) => Promise<T>, deps: unknown[] = [], pollMs?: number) {
  const { session } = useAuth();
  const token = session?.token ?? null;
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  const run = useCallback(
    async (showSpinner: boolean) => {
      if (!token) return;
      if (showSpinner) setState((prev) => ({ ...prev, loading: true }));
      try {
        const data = await loadRef.current(token);
        setState({ data, error: null, loading: false });
      } catch (error) {
        setState({ data: null, error: (error as Error).message, loading: false });
      }
    },
    [token],
  );

  useEffect(() => {
    run(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  useEffect(() => {
    if (!pollMs || !token) return;
    const tick = () => {
      if (document.visibilityState === 'visible') run(false);
    };
    const id = window.setInterval(tick, pollMs);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, pollMs, token, ...deps]);

  return { ...state, reload: () => run(false) };
}
