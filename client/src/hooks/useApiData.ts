import { useState, useEffect, useCallback, useRef } from "react";

interface UseApiDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook riutilizzabile per fetch dati con gestione loading/error.
 *
 * Uso:
 *   const { data, loading, error, refetch } = useApiData(
 *     () => api.analytics.overview({ startDate }),
 *     [startDate]
 *   );
 */
export function useApiData<T>(
  fetcher: (() => Promise<T>) | null,
  deps: any[] = []
): UseApiDataResult<T> {
  const [data,    setData]    = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async () => {
    if (!fetcher) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mounted.current) setData(result);
    } catch (err: any) {
      if (mounted.current) setError(err.message || "Errore nel caricamento");
    } finally {
      if (mounted.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}
