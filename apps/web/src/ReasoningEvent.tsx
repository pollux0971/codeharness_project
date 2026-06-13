import { useState } from 'react';

export interface ReasoningEventProps {
  eventId: string;
  preview: string;
  fullText: string;
  agentRole?: string;
}

const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };

export function ReasoningEvent({ eventId, preview, fullText, agentRole }: ReasoningEventProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid={`reasoning-${eventId}`}
      data-expanded={String(expanded)}
      data-agent-role={agentRole}
      style={{
        opacity: expanded ? 1 : 0.55,
        marginBottom: 4,
      }}
    >
      {expanded ? (
        <>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', ...mono, fontSize: 11 }}>
            {fullText}
          </pre>
          <button
            onClick={() => setExpanded(false)}
            style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 11, padding: '2px 0', ...mono }}
          >
            ▼ collapse
          </button>
        </>
      ) : (
        <>
          <div style={{ whiteSpace: 'pre-wrap', ...mono, fontSize: 11 }}>
            {preview}
          </div>
          <button
            onClick={() => setExpanded(true)}
            style={{ background: 'none', border: 'none', color: '#8B949E', cursor: 'pointer', fontSize: 11, padding: '2px 0', ...mono }}
          >
            ▶ thinking…
          </button>
        </>
      )}
    </div>
  );
}
