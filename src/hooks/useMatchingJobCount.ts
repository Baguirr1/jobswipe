import { useEffect, useMemo, useState } from 'react';

import { countMatchingJobs } from '@/lib/api';
import type { JobFilters } from '@/lib/types';

export function useMatchingJobCount(
  candidateId: string | null | undefined,
  filters: JobFilters,
  enabled: boolean,
): { count: number | null; loading: boolean } {
  const serializedFilters = JSON.stringify(filters);
  const request = useMemo(
    () => enabled && candidateId ? { candidateId, serializedFilters } : null,
    [candidateId, enabled, serializedFilters],
  );
  const [result, setResult] = useState<{ request: typeof request; count: number | null }>({
    request: null,
    count: null,
  });

  useEffect(() => {
    if (!request) return;

    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const count = await countMatchingJobs(
          request.candidateId,
          JSON.parse(request.serializedFilters),
        );
        if (active) setResult({ request, count });
      } catch {
        if (active) setResult({ request, count: null });
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [request]);

  return { count: result.count, loading: request !== null && request !== result.request };
}
