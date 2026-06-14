import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

    // Scope queries to each pane via its data-pane-role attribute. The role name
    // appears in both the pane title and its event lines, so a global getByText
    // would match multiple nodes — assert on the unique event summary within the
    // owning pane instead, and verify the trace is genuinely role-filtered.
    const supPane = document.querySelector('[data-pane-role="supervisor"]') as HTMLElement;
    const devPane = document.querySelector('[data-pane-role="developer_debugger"]') as HTMLElement;
    const revPane = document.querySelector('[data-pane-role="reviewer"]') as HTMLElement;
    expect(supPane).toBeTruthy();
    expect(devPane).toBeTruthy();
    expect(revPane).toBeTruthy();

    // each pane shows its own role's event …
    expect(within(supPane).getByText(/supervisor did agent_output_event/i)).toBeTruthy();
    expect(within(devPane).getByText(/developer did execution_event/i)).toBeTruthy();
    expect(within(revPane).getByText(/reviewer did validation_event/i)).toBeTruthy();

    // … and not the other roles' events (role-filtered)
    expect(within(supPane).queryByText(/developer did/i)).toBeNull();
    expect(within(supPane).queryByText(/reviewer did/i)).toBeNull();
    expect(within(devPane).queryByText(/supervisor did/i)).toBeNull();
    expect(within(revPane).queryByText(/developer did/i)).toBeNull();
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
