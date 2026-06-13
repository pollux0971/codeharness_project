import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsolePane, ThreePaneConsole } from './ConsolePane';
import type { TraceEvent } from '@codeharness/harness-core';

const makeEvent = (role: string, type: string, id: string): TraceEvent => ({
  event_id: id, type, story_id: 'S-1', payload: {}, recorded_at: '2026-01-01T00:00Z',
  seq: 0, event_type: type, agent_role: role, summary: `${role} did ${type}`,
} as any);

describe('three-pane-console', () => {
  it('three_panes_render_role_filtered_trace', () => {
    const events = [
      makeEvent('supervisor', 'agent_output_event', 'e1'),
      makeEvent('developer',  'execution_event',    'e2'),
      makeEvent('reviewer',   'validation_event',   'e3'),
    ];
    render(<ThreePaneConsole events={events} />);
    expect(screen.getByText(/supervisor/i)).toBeTruthy();
    expect(screen.getByText(/developer/i)).toBeTruthy();
    expect(screen.getByText(/reviewer/i)).toBeTruthy();
  });

  it('no_chat_bubbles_cli_style', () => {
    const events = [makeEvent('supervisor', 'agent_output_event', 'e1')];
    render(<ConsolePane paneRole="supervisor" events={events} title="Supervisor" />);
    const pre = document.querySelector('pre');
    expect(pre).toBeTruthy();
  });

  it('tool_invocations_inline_annotated', () => {
    const event = makeEvent('developer', 'tool_call_event', 'e1');
    render(<ConsolePane paneRole="developer_debugger" events={[event]} title="Dev" />);
    expect(screen.getByText(/\[TOOL\]/)).toBeTruthy();
  });

  it('agent_dispatch_records_visible', () => {
    const event = makeEvent('supervisor', 'dispatch_event', 'e1');
    render(<ConsolePane paneRole="supervisor" events={[event]} title="Sup" />);
    expect(screen.getByText(/\[DISPATCH\]/)).toBeTruthy();
  });
});
