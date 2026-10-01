/**
 * In-memory cache for ranking read queries.
 *
 * Ranking data is static between syncs — it only changes when a new Excel file
 * is uploaded (which triggers `syncAllData`) or a manual sync is run. So instead
 * of re-querying PostgreSQL on every page load, we compute each result once and
 * serve it from memory until the data is re-synced.
 *
 * Promises (not resolved values) are cached so that concurrent requests for the
 * same key — e.g. the dashboard firing /overview, /trends and /world at once —
 * share a single in-flight computation instead of each hitting the DB.
 *
 * Call `clearRankingCache()` after every successful sync to invalidate.
 */

const store = new Map<string, Promise<unknown>>();

export function memoizeAsync<A extends unknown[], R>(
  prefix: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args: A): Promise<R> => {
    const key = args.length ? `${prefix}:${JSON.stringify(args)}` : prefix;
    const existing = store.get(key);
    if (existing) return existing as Promise<R>;

    const promise = (async () => {
      try {
        return await fn(...args);
      } catch (err) {
        // Don't cache failures — let the next request retry.
        store.delete(key);
        throw err;
      }
    })();

    store.set(key, promise);
    return promise;
  };
}

/** Invalidate all cached ranking data. Call after any successful sync. */
export function clearRankingCache(): void {
  store.clear();
}
