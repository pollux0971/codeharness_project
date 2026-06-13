import { useState } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

export interface DecisionEntry {
  id:                string;
  option:            string;
  description:       string;
  status:            'open' | 'resolved';
  current_value?:    string;
  affected_stories?: string[];
}

export interface DecisionCardsPageProps {
  decisions: DecisionEntry[];
}

export function DecisionCard({ decision }: { decision: DecisionEntry }): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const statusColor = decision.status === 'resolved'
    ? { background: 'rgba(126,224,129,.12)', color: '#7EE081', border: '1px solid rgba(126,224,129,.25)' }
    : { background: 'rgba(242,166,90,.12)',  color: '#F2A65A', border: '1px solid rgba(242,166,90,.25)' };

  return (
    <div
      style={{
        border:        '1px solid rgba(230,237,243,.15)',
        borderRadius:  8,
        padding:       14,
        marginBottom:  12,
        ...mono,
        fontSize:      12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{decision.option}</span>
        <span
          style={{
            ...statusColor,
            fontSize:     10,
            borderRadius: 4,
            padding:      '2px 7px',
          }}
        >
          {decision.status}
        </span>
      </div>

      <p style={{ margin: '0 0 8px', opacity: 0.7, lineHeight: 1.5 }}>{decision.description}</p>

      {decision.current_value && (
        <div style={{ marginBottom: 8, opacity: 0.6 }}>
          <span style={{ opacity: 0.5 }}>current: </span>
          {decision.current_value}
        </div>
      )}

      {decision.affected_stories && decision.affected_stories.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            style={{
              ...mono,
              fontSize:     10,
              background:   'none',
              border:       '1px solid rgba(230,237,243,.2)',
              borderRadius: 4,
              color:        'rgba(230,237,243,.5)',
              padding:      '2px 7px',
              cursor:       'pointer',
            }}
          >
            {expanded ? '▴' : '▾'} {decision.affected_stories.length} affected stories
          </button>
          {expanded && (
            <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', opacity: 0.6 }}>
              {decision.affected_stories.map(s => (
                <li key={s} style={{ marginBottom: 2 }}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DecisionCardsPage({ decisions }: DecisionCardsPageProps): JSX.Element {
  return (
    <div style={{ padding: 16 }}>
      {decisions.map(d => (
        <DecisionCard key={d.id} decision={d} />
      ))}
    </div>
  );
}
