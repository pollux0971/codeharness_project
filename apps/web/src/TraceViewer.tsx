import { useState } from 'react';
import type { TraceEvent } from '@codeharness/harness-core';
import { useTraceStream, type TraceMode } from './useTraceStream';
import { MOCK_TRACE_EVENTS } from './mockTrace';

const ALL_TYPES = ['promotion', 'human_review', 'test_integrity', 'checkpoint', 'escalation'] as const;

const TYPE_COLOR: Record<string, string> = {
  promotion:      '#7EE081',
  human_review:   '#8AB4F8',
  test_integrity: '#C792EA',
  checkpoint:     '#5BD6C0',
  escalation:     '#F2A65A',
};

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
const dim  = { color: 'rgba(230,237,243,.34)' } as const;

export interface TraceViewerProps {
  mode: TraceMode;
  mockEvents?: TraceEvent[];
}

export function TraceViewer({ mode, mockEvents }: TraceViewerProps): JSX.Element {
  const [storyFilter, setStoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const resolvedMockEvents = mockEvents ?? (mode === 'mock' ? MOCK_TRACE_EVENTS : undefined);

  const { events, loading, error } = useTraceStream({
    mode,
    storyFilter: storyFilter || undefined,
    typeFilter: typeFilter.length > 0 ? typeFilter : undefined,
    mockEvents: resolvedMockEvents,
  });

  const allEvents = resolvedMockEvents ?? events;
  const stories = [...new Set(
    allEvents.map(e => e.story_id).filter((s): s is string => Boolean(s))
  )];

  const toggleType = (t: string) => {
    setTypeFilter(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  return (
    <div data-testid="trace-viewer">
      {mode === 'mock' && (
        <span style={{
          display: 'inline-block',
          background: '#0D3A3A',
          color: '#5BD6C0',
          border: '1px solid #5BD6C044',
          borderRadius: 4,
          padding: '2px 8px',
          fontSize: 10,
          ...mono,
          marginBottom: 10,
        }}>
          mock mode
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <select
          value={storyFilter}
          onChange={e => setStoryFilter(e.target.value)}
          style={{ ...mono, fontSize: 11, background: '#18242F', color: '#E6EDF3', border: '1px solid rgba(230,237,243,.2)', borderRadius: 5, padding: '3px 8px' }}
          aria-label="Filter by story"
        >
          <option value="">All stories</option>
          {stories.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {ALL_TYPES.map(t => (
            <label key={t} style={{ ...mono, fontSize: 10.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="checkbox"
                checked={typeFilter.includes(t)}
                onChange={() => toggleType(t)}
              />
              <span style={{ color: TYPE_COLOR[t] || '#9FB0BF' }}>{t}</span>
            </label>
          ))}
        </div>
      </div>
      {loading && <div style={{ ...mono, fontSize: 11, ...dim }}>loading…</div>}
      {error && <div style={{ ...mono, fontSize: 11, color: '#F2A65A' }}>error: {error}</div>}
      <div>
        {events.map(e => (
          <div
            key={e.event_id}
            data-trace-row
            data-event-type={e.event_type}
            style={{
              borderLeft: '2px solid rgba(230,237,243,.12)',
              paddingLeft: 12,
              paddingBottom: 11,
              marginLeft: 4,
              marginBottom: 4,
            }}
          >
            <div style={{ ...mono, fontSize: 11, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span data-field="event_id" style={dim}>{e.event_id}</span>
              <span
                data-field="type"
                style={{
                  color: TYPE_COLOR[e.type] || '#9FB0BF',
                  border: `1px solid ${(TYPE_COLOR[e.type] || '#9FB0BF')}44`,
                  borderRadius: 4,
                  padding: '0 5px',
                  fontSize: 10,
                }}
              >
                {e.type}
              </span>
              <span data-field="event_type" style={{ display: 'none' }}>{e.event_type}</span>
              {e.story_id && <span style={{ color: '#8AB4F8', fontSize: 10 }}>{e.story_id}</span>}
              <span style={{ ...dim, fontSize: 9.5, marginLeft: 'auto' }}>{e.recorded_at}</span>
            </div>
            <details style={{ marginTop: 4 }}>
              <summary style={{ ...mono, fontSize: 10, ...dim, cursor: 'pointer' }}>payload</summary>
              <pre style={{ ...mono, fontSize: 10, background: '#0E1620', padding: '4px 8px', borderRadius: 4, margin: '4px 0', overflow: 'auto' }}>
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </details>
          </div>
        ))}
      </div>
      {events.length === 0 && !loading && (
        <div style={{ ...mono, fontSize: 11, ...dim }}>— no trace events —</div>
      )}
    </div>
  );
}
