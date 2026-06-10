import { MOCK_TRACE_EVENTS } from './mockTrace';

const ROLE_COLOR: Record<string, string> = {
  supervisor: '#C792EA', developer: '#5BD6C0', validator: '#7EE081',
  debugger: '#F2A65A', planning_steward: '#8AB4F8',
};
const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
const dim  = { color: 'rgba(230,237,243,.34)' } as const;

/** Trace event viewer placeholder — renders MOCK_TRACE_EVENTS; no fetch, no real API. */
export function TraceViewer() {
  return (
    <div data-testid="trace-viewer" style={{ marginTop: 8 }}>
      {MOCK_TRACE_EVENTS.map(e => (
        <div
          key={e.seq}
          data-trace-row
          data-event-type={e.event_type}
          style={{ borderLeft: '2px solid rgba(230,237,243,.12)', paddingLeft: 12, paddingBottom: 11, marginLeft: 4 }}
        >
          <div style={{ ...mono, fontSize: 11 }}>
            <span style={dim}>#{e.seq} </span>
            <span
              data-field="event_type"
              style={{ color: '#5BD6C0', marginRight: 8 }}
            >
              {e.event_type}
            </span>
            <span style={{ color: ROLE_COLOR[e.agent_role] || '#9FB0BF' }}>{e.agent_role}</span>
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'rgba(230,237,243,.72)', lineHeight: 1.5 }}>
            {e.summary}
          </div>
        </div>
      ))}
    </div>
  );
}
