import { useCallback, useEffect, useRef, useState } from 'react';

import type { SwipeDirection } from '@/lib/types';

interface Options<T> {
  /** Fetch the next batch. Server-side exclusion handles already-persisted swipes. */
  fetchBatch: () => Promise<T[]>;
  /** Persist a swipe. Resolve with a match id when the swipe created a match. */
  persist: (item: T, direction: SwipeDirection) => Promise<string | null>;
  getKey: (item: T) => string;
  /** Refill when this many cards (or fewer) remain. */
  prefetchAt?: number;
  enabled?: boolean;
}

/**
 * Card queue with optimistic swipes:
 *  - the card leaves the queue the instant the gesture completes,
 *  - the write happens in the background,
 *  - on failure the card is put back on top and `error` is set.
 * Keys that are swiped-but-not-yet-persisted are filtered out of refetches so a
 * prefetch racing a pending write can't resurrect a card.
 */
export function useSwipeQueue<T>({
  fetchBatch,
  persist,
  getKey,
  prefetchAt = 3,
  enabled = true,
}: Options<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<{ id: string; item: T } | null>(null);

  const pending = useRef(new Set<string>());
  const fetching = useRef(false);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(
    async (mode: 'replace' | 'append') => {
      if (fetching.current) return;
      fetching.current = true;
      try {
        const batch = (await fetchBatch()).filter((i) => !pending.current.has(getKey(i)));
        // The server also returns cards still sitting in the deck (not swiped yet),
        // so only genuinely new cards count toward "more available".
        const seen = new Set(mode === 'replace' ? [] : itemsRef.current.map(getKey));
        const fresh = batch.filter((i) => !seen.has(getKey(i)));
        setItems((prev) => (mode === 'replace' ? fresh : [...prev, ...fresh]));
        setExhausted(fresh.length === 0);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        fetching.current = false;
        setLoading(false);
      }
    },
    [fetchBatch, getKey],
  );

  useEffect(() => {
    if (enabled) load('replace');
  }, [enabled, load]);

  // Prefetch when the deck runs low.
  useEffect(() => {
    if (enabled && !loading && !exhausted && items.length <= prefetchAt) load('append');
  }, [enabled, items.length, loading, exhausted, prefetchAt, load]);

  const swipe = useCallback(
    (item: T, direction: SwipeDirection) => {
      const key = getKey(item);
      pending.current.add(key);
      setItems((prev) => prev.filter((i) => getKey(i) !== key));

      persist(item, direction)
        .then((id) => {
          if (id) setMatchId({ id, item });
        })
        .catch((e: Error) => {
          // Roll back: return the card to the top of the deck.
          setItems((prev) => [item, ...prev.filter((i) => getKey(i) !== key)]);
          setError(`Couldn't save that swipe — ${e.message}`);
        })
        .finally(() => pending.current.delete(key));
    },
    [persist, getKey],
  );

  return {
    items,
    loading,
    error,
    swipe,
    refresh: () => {
      setLoading(true);
      load('replace');
    },
    clearError: () => setError(null),
    match: matchId,
    clearMatch: () => setMatchId(null),
  };
}
