import { useState, useEffect } from 'react';
import type { TraceEvent } from '@codeharness/harness-core';

export type TraceMode = 'live' | 'mock';

export interface UseTraceStreamOptions {
  mode: TraceMode;
  storyFilter?: string;
  typeFilter?: string[];
  mockEvents?: TraceEvent[];
  pollIntervalMs?: number;
  apiBase?: string;
}

function applyFilters(
  events: TraceEvent[],
  storyFilter?: string,
  typeFilter?: string[],
): TraceEvent[] {
  return events.filter(e => {
    if (storyFilter && e.story_id !== storyFilter) return false;
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(e.type)) return false;
    return true;
  });
}

export function useTraceStream(opts: UseTraceStreamOptions): {
  events: TraceEvent[];
  loading: boolean;
  error: string | null;
} {
  const {
    mode,
    storyFilter,
    typeFilter,
    mockEvents = [],
    pollIntervalMs = 2000,
    apiBase,
  } = opts;

  const [liveEvents, setLiveEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeFilterKey = typeFilter ? typeFilter.join(',') : '';

  useEffect(() => {
    if (mode !== 'live') return;
    let cancelled = false;
    setLoading(true);

    const poll = async () => {
      try {
        const base = apiBase ?? (import.meta as Record<string, unknown> & { env?: Record<string, string> }).env?.VITE_API ?? '';
        const params = new URLSearchParams();
        if (storyFilter) params.set('story_id', storyFilter);
        if (typeFilter?.length) typeFilter.forEach(t => params.append('type', t));
        const res = await fetch(`${base}/api/trace?${params}`);
        const data: TraceEvent[] = await res.json();
        if (!cancelled) {
          setLiveEvents(prev => {
            const seen = new Set(prev.map(e => e.event_id));
            const fresh = data.filter(e => !seen.has(e.event_id));
            return fresh.length > 0 ? [...prev, ...fresh] : prev;
          });
          setLoading(false);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    poll();
    const timer = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mode, storyFilter, typeFilterKey, pollIntervalMs, apiBase]);

  if (mode === 'mock') {
    return {
      events: applyFilters(mockEvents, storyFilter, typeFilter),
      loading: false,
      error: null,
    };
  }

  return {
    events: applyFilters(liveEvents, storyFilter, typeFilter),
    loading,
    error,
  };
}
