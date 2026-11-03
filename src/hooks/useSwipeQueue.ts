import { useCallback, useEffect, useRef, useState } from 'react';

import type { SwipeDirection } from '@/lib/types';

interface Options<T> {
  /** Fetch the next batch. Server-side exclusion handles already-persisted swipes. */
  fetchBatch: () => Promise<T[]>;
  /** Persist a swipe. Resolve with a match id when the swipe created a match. */
  persist: (item: T, direction: SwipeDirection) => Promise<string | null>;
  getKey: (item: T) => string;
  /** Reverse a persisted swipe. When given, the last swipe can be undone. */
  undo?: (item: T) => Promise<void>;
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
  undo,
  prefetchAt = 3,
  enabled = true,
}: Options<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<{ id: string; item: T } | null>(null);
  // Only the most recent swipe can be undone. `saved` resolves true once its
  // write succeeded (false if it failed and the card was already restored).
  // `source` is the fetchBatch (i.e. feed + filters) the swipe was made in.
  const lastSwipe = useRef<{ item: T; saved: Promise<boolean>; source: () => Promise<T[]> } | null>(
    null,
  );
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // A new fetchBatch means a different feed (e.g. new filters): clear the old
  // deck right away instead of leaving its cards swipeable under the new
  // filters, and drop undo (its card may not belong in the new feed).
  // State adjusted during render, per the React docs.
  const [source, setSource] = useState(() => fetchBatch);
  if (source !== fetchBatch) {
    setSource(() => fetchBatch);
    setItems([]);
    setLoading(true);
    setExhausted(false);
    setCanUndo(false);
  }
  const sourceRef = useRef(fetchBatch);
  useEffect(() => {
    sourceRef.current = fetchBatch;
  }, [fetchBatch]);

  const pending = useRef(new Set<string>());
  const fetching = useRef(false);
  // A refresh requested mid-fetch is queued, not dropped, so it still runs
  // (e.g. a profile save landing during a prefetch).
  const replaceQueued = useRef(false);
  const loadRef = useRef<(mode: 'replace' | 'append') => Promise<void>>(async () => {});
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const load = useCallback(
    async (mode: 'replace' | 'append') => {
      if (fetching.current) {
        if (mode === 'replace') replaceQueued.current = true;
        return;
      }
      fetching.current = true;
      // Results for a feed that has since been replaced are thrown away.
      let stale = false;
      try {
        const raw = await fetchBatch();
        if (fetchBatch !== sourceRef.current) {
          stale = true;
          return;
        }
        const batch = raw.filter((i) => !pending.current.has(getKey(i)));
        // The server also returns cards still sitting in the deck (not swiped yet),
        // so only genuinely new cards count toward "more available".
        const seen = new Set(mode === 'replace' ? [] : itemsRef.current.map(getKey));
        const fresh = batch.filter((i) => !seen.has(getKey(i)));
        setItems((prev) => (mode === 'replace' ? fresh : [...prev, ...fresh]));
        setExhausted(fresh.length === 0);
        setError(null);
      } catch (e) {
        if (fetchBatch !== sourceRef.current) stale = true;
        else setError((e as Error).message);
      } finally {
        fetching.current = false;
        if (replaceQueued.current || stale) {
          // Keep showing the spinner; the current feed loads next.
          replaceQueued.current = false;
          loadRef.current('replace');
        } else {
          setLoading(false);
        }
      }
    },
    [fetchBatch, getKey],
  );
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

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
      const swipedIn = fetchBatch;
      pending.current.add(key);
      setItems((prev) => prev.filter((i) => getKey(i) !== key));

      const saved = persist(item, direction)
        .then((id) => {
          if (id) setMatchId({ id, item });
          return true;
        })
        .catch((e: Error) => {
          // Roll back: return the card to the top of the deck (if it's still
          // the same feed; otherwise the next load brings it back if it fits).
          if (swipedIn === sourceRef.current) {
            setItems((prev) => [item, ...prev.filter((i) => getKey(i) !== key)]);
          }
          setError(`Couldn't save that swipe — ${e.message}`);
          if (lastSwipe.current?.item === item) {
            lastSwipe.current = null;
            setCanUndo(false);
          }
          return false;
        })
        .finally(() => pending.current.delete(key));

      lastSwipe.current = { item, saved, source: swipedIn };
      setCanUndo(true);
    },
    [persist, getKey, fetchBatch],
  );

  const undoLast = useCallback(async () => {
    const last = lastSwipe.current;
    lastSwipe.current = null;
    if (!last || !undo || last.source !== sourceRef.current) {
      setCanUndo(false);
      return;
    }
    setCanUndo(false);
    setUndoing(true);
    try {
      // The write may still be in flight; undo only what actually got saved.
      if (!(await last.saved)) return;
      await undo(last.item);
      // Filters changed while undoing: the swipe is gone server-side, and the
      // card comes back through the new feed only if it matches.
      if (last.source !== sourceRef.current) return;
      const key = getKey(last.item);
      setItems((prev) => [last.item, ...prev.filter((i) => getKey(i) !== key)]);
    } catch (e) {
      setError(`Couldn't undo — ${(e as Error).message}`);
    } finally {
      setUndoing(false);
    }
  }, [undo, getKey]);

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
    canUndo: !!undo && canUndo && !undoing,
    undo: undoLast,
  };
}
