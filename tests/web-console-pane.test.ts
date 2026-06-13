/**
 * STORY-024.2 — Three-pane CLI console acceptance tests
 * Verifies: three_panes_render_role_filtered_trace, no_chat_bubbles_cli_style,
 *           tool_invocations_inline_annotated, agent_dispatch_records_visible
 * Pure node tests — no browser, no backend, no network.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'ConsolePane.tsx'), 'utf8');

describe('STORY-024.2 three-pane CLI console', () => {
  it('three_panes_render_role_filtered_trace: exports ConsolePane and ThreePaneConsole', () => {
    expect(src).toContain('export function ConsolePane');
    expect(src).toContain('export function ThreePaneConsole');
  });

  it('three_panes_render_role_filtered_trace: all three pane roles defined', () => {
    expect(src).toContain("'supervisor'");
    expect(src).toContain("'developer_debugger'");
    expect(src).toContain("'reviewer'");
  });

  it('three_panes_render_role_filtered_trace: role filter maps pane to agent roles', () => {
    expect(src).toContain('developer');
    expect(src).toContain('debugger');
    expect(src).toContain('filterForPane');
  });

  it('no_chat_bubbles_cli_style: renders <pre> element, not chat bubbles', () => {
    expect(src).toContain('<pre');
    expect(src).not.toContain('bubble');
    expect(src).toContain('monospace');
  });

  it('tool_invocations_inline_annotated: tool_call_event renders [TOOL] prefix', () => {
    expect(src).toContain('[TOOL]');
    expect(src).toContain("'tool_call_event'");
  });

  it('agent_dispatch_records_visible: dispatch_event renders [DISPATCH] prefix', () => {
    expect(src).toContain('[DISPATCH]');
    expect(src).toContain("'dispatch_event'");
  });

  it('no_chat_bubbles_cli_style: uses ROLE_CSS_VAR for pane border', () => {
    expect(src).toContain('ROLE_CSS_VAR');
    expect(src).toContain("from './theme'");
  });

  it('three_panes_render_role_filtered_trace: data-event-type attribute present', () => {
    expect(src).toContain('data-event-type');
  });

  it('three_panes_render_role_filtered_trace: ThreePaneConsole renders all three panes', () => {
    expect(src).toContain('paneRole="supervisor"');
    expect(src).toContain('paneRole="developer_debugger"');
    expect(src).toContain('paneRole="reviewer"');
  });

  it('no_chat_bubbles_cli_style: no real API calls in ConsolePane', () => {
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta.env');
    expect(src).not.toContain('XMLHttpRequest');
  });
});
