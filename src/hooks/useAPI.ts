import { useState, useEffect, useCallback } from 'react';

/**
 * Simple data fetching hook (no react-query dependency)
 */
export function useAPI<T>(fetcher: () => Promise<T>, refreshMs = 5000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    load();
    if (refreshMs > 0) {
      const interval = setInterval(load, refreshMs);
      return () => clearInterval(interval);
    }
  }, [load, refreshMs]);

  return { data, error, loading, refresh: load };
}
