import type { TraceEvent } from '@codeharness/harness-core';
import { ROLE_CSS_VAR } from './theme';
import { ReasoningEvent } from './ReasoningEvent';

export type PaneRole = 'supervisor' | 'developer_debugger' | 'reviewer';

export interface ConsolePaneProps {
  paneRole: PaneRole;
  events: TraceEvent[];
  title: string;
}

export interface ThreePaneConsoleProps {
  events: TraceEvent[];
}

const PANE_ROLE_MAP: Record<PaneRole, string[]> = {
  supervisor:          ['supervisor'],
  developer_debugger:  ['developer', 'debugger'],
  reviewer:            ['reviewer'],
};

const PANE_CSS_ROLE: Record<PaneRole, keyof typeof ROLE_CSS_VAR> = {
  supervisor:          'supervisor',
  developer_debugger:  'developer',
  reviewer:            'reviewer',
};

function filterForPane(events: TraceEvent[], pane: PaneRole): TraceEvent[] {
  const roles = PANE_ROLE_MAP[pane];
  return events.filter(e => roles.includes((e as any).agent_role ?? ''));
}

function formatLine(e: TraceEvent): string {
  const type = (e as any).event_type ?? e.type ?? 'event';
  const story = e.story_id ? `[${e.story_id}]` : '';
  if (type === 'tool_call_event') return `[TOOL] ${story} ${(e as any).summary ?? e.type}`.trim();
  if (type === 'dispatch_event')  return `[DISPATCH] ${story} ${(e as any).summary ?? ''}`.trim();
  return `[${String(type).toUpperCase()}] ${story} ${(e as any).summary ?? ''}`.trim();
}

const mono: React.CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };

export function ConsolePane({ paneRole, events, title }: ConsolePaneProps): JSX.Element {
  const filtered = filterForPane(events, paneRole);
  const borderColor = ROLE_CSS_VAR[PANE_CSS_ROLE[paneRole]];

  return (
    <div
      data-pane-role={paneRole}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <div
        style={{
          padding: '4px 10px',
          borderBottom: `1px solid ${borderColor}`,
          ...mono,
          fontSize: 11,
          color: borderColor,
          background: 'rgba(0,0,0,.2)',
        }}
      >
        {title}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: '8px 10px',
          ...mono,
          fontSize: 11,
          overflowY: 'auto',
          background: '#0E1620',
          color: '#E6EDF3',
        }}
      >
        {filtered.length === 0
          ? <span style={{ color: 'rgba(230,237,243,.34)' }}>— no events —</span>
          : filtered.map(e => {
            const evType = (e as any).event_type ?? e.type;
            if (evType === 'reasoning_event') {
              const full: string = (e as any).full_text ?? (e as any).summary ?? '';
              const lines = full.split('\n');
              const preview = lines.slice(0, 2).join('\n');
              return (
                <ReasoningEvent
                  key={e.event_id}
                  eventId={e.event_id}
                  preview={preview}
                  fullText={full}
                  agentRole={(e as any).agent_role}
                />
              );
            }
            return (
              <div
                key={e.event_id}
                data-event-type={evType}
              >
                {formatLine(e)}
              </div>
            );
          })
        }
      </pre>
    </div>
  );
}

export function ThreePaneConsole({ events }: ThreePaneConsoleProps): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, height: '100%', minHeight: 0 }}>
      <ConsolePane paneRole="supervisor"         events={events} title="Supervisor" />
      <ConsolePane paneRole="developer_debugger" events={events} title="Developer + Debugger" />
      <ConsolePane paneRole="reviewer"           events={events} title="Reviewer" />
    </div>
  );
}
