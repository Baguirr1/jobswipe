import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { NO_FILTERS } from '@/components/FilterSheet';
import { isEmploymentType, isJobFunction, isWorkplaceType } from '@/lib/jobLabels';
import type { JobFilters } from '@/lib/types';

const STORAGE_KEY = 'jobswipe:filters:v1';

function restoreFilters(value: unknown): JobFilters {
  const filters = { ...NO_FILTERS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return filters;
  const stored = value as Record<string, unknown>;
  const list = <T,>(v: unknown, is: (x: unknown) => x is T): T[] =>
    Array.isArray(v) ? [...new Set(v.filter(is))] : [];
  filters.employmentTypes = list(stored.employmentTypes, isEmploymentType);
  filters.workplaceTypes = list(stored.workplaceTypes, isWorkplaceType);
  filters.jobFunctions = list(stored.jobFunctions, isJobFunction);
  if (typeof stored.company === 'string') filters.company = stored.company;
  if (stored.sponsorship === 'open' || stored.sponsorship === 'offered') filters.sponsorship = stored.sponsorship;
  // Filters saved by earlier versions: "Remote only" and the internship level.
  if (stored.remoteOnly === true && !filters.workplaceTypes.length) filters.workplaceTypes = ['remote'];
  if (stored.level === 'internship' && !filters.employmentTypes.length) filters.employmentTypes = ['internship'];
  if (typeof stored.minSalary === 'number' && Number.isFinite(stored.minSalary) && stored.minSalary >= 0) {
    filters.minSalary = stored.minSalary;
  }
  if (typeof stored.location === 'string') filters.location = stored.location;
  if (typeof stored.keyword === 'string') filters.keyword = stored.keyword;
  if (stored.postedWithinDays === 1 || stored.postedWithinDays === 7 || stored.postedWithinDays === 30) {
    filters.postedWithinDays = stored.postedWithinDays;
  }
  if (stored.level === 'entry' || stored.level === 'senior') {
    filters.level = stored.level;
  }
  if (typeof stored.includeEstimates === 'boolean') filters.includeEstimates = stored.includeEstimates;
  if (typeof stored.quickApplyOnly === 'boolean') filters.quickApplyOnly = stored.quickApplyOnly;
  if (typeof stored.salaryListed === 'boolean') filters.salaryListed = stored.salaryListed;
  if (typeof stored.skillsMatch === 'boolean') filters.skillsMatch = stored.skillsMatch;
  if (stored.minMatch === 50 || stored.minMatch === 70 || stored.minMatch === 85) {
    filters.minMatch = stored.minMatch;
  }
  if (stored.sort === 'match' || stored.sort === 'newest' || stored.sort === 'salary') {
    filters.sort = stored.sort;
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
