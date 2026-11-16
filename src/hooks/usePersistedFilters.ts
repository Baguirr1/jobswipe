import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { NO_FILTERS } from '@/components/FilterSheet';
import type { JobFilters } from '@/lib/types';

const STORAGE_KEY = 'jobswipe:filters:v1';

function restoreFilters(value: unknown): JobFilters {
  const filters = { ...NO_FILTERS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return filters;
  const stored = value as Record<string, unknown>;
  if (typeof stored.remoteOnly === 'boolean') filters.remoteOnly = stored.remoteOnly;
  if (typeof stored.minSalary === 'number' && Number.isFinite(stored.minSalary) && stored.minSalary >= 0) {
    filters.minSalary = stored.minSalary;
  }
  if (typeof stored.location === 'string') filters.location = stored.location;
  if (typeof stored.keyword === 'string') filters.keyword = stored.keyword;
  if (stored.postedWithinDays === 1 || stored.postedWithinDays === 7 || stored.postedWithinDays === 30) {
    filters.postedWithinDays = stored.postedWithinDays;
  }
  if (stored.level === 'internship' || stored.level === 'entry' || stored.level === 'senior') {
    filters.level = stored.level;
  }
  return filters;
}

export function usePersistedFilters(): [JobFilters, (f: JobFilters) => void] {
  const [filters, setFilters] = useState<JobFilters>({ ...NO_FILTERS });
  const edited = useRef(false);
  const writes = useRef(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const restored = restoreFilters(raw ? JSON.parse(raw) : null);
        // A slow initial read must not replace filters the user already applied.
        if (mounted && !edited.current) setFilters(restored);
      } catch {
        // Missing or corrupt storage leaves the in-memory defaults usable.
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  const applyFilters = useCallback((next: JobFilters) => {
    edited.current = true;
    const normalized = restoreFilters(next);
    setFilters(normalized);
    // Serialize writes so a rapid clear/apply cannot persist an older value last.
    writes.current = writes.current.then(async () => {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // Storage failure should not prevent filtering for this session.
      }
    });
  }, []);

  return [filters, applyFilters];
}
