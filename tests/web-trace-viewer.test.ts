/**
 * STORY-005.2 — Trace viewer placeholder acceptance tests
 * Verifies: trace_list_renders_mock_events, event_type_visible_per_row, no_real_api_called
 * Pure node tests — no browser, no backend, no network.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MOCK_TRACE_EVENTS } from '../apps/web/src/mockTrace';

const webSrc = path.resolve(__dirname, '../apps/web/src');

describe('STORY-005.2 trace viewer placeholder', () => {
  it('trace_list_renders_mock_events: MOCK_TRACE_EVENTS is non-empty', () => {
    expect(MOCK_TRACE_EVENTS.length).toBeGreaterThan(0);
  });

  it('trace_list_renders_mock_events: events have monotonically increasing seq', () => {
    for (let i = 0; i < MOCK_TRACE_EVENTS.length; i++) {
      expect(MOCK_TRACE_EVENTS[i].seq).toBe(i);
    }
  });

  it('trace_list_renders_mock_events: each event has required fields', () => {
    for (const e of MOCK_TRACE_EVENTS) {
      expect(typeof e.seq).toBe('number');
      expect(typeof e.event_type).toBe('string');
      expect(typeof e.agent_role).toBe('string');
      expect(typeof e.summary).toBe('string');
    }
  });

  it('event_type_visible_per_row: each event has a non-empty event_type string', () => {
    for (const e of MOCK_TRACE_EVENTS) {
      expect(e.event_type.trim().length).toBeGreaterThan(0);
    }
  });

  it('event_type_visible_per_row: TraceViewer renders event_type per row (data-field attribute)', () => {
    const src = fs.readFileSync(path.join(webSrc, 'TraceViewer.tsx'), 'utf8');
    expect(src).toContain('data-field="event_type"');
    expect(src).toContain('data-event-type={e.event_type}');
    expect(src).toContain('data-trace-row');
  });

  it('no_real_api_called: TraceViewer uses MOCK_TRACE_EVENTS not fetch', () => {
    const src = fs.readFileSync(path.join(webSrc, 'TraceViewer.tsx'), 'utf8');
    expect(src).toContain('MOCK_TRACE_EVENTS');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta.env');
  });

  it('no_real_api_called: mock data contains no secret-like values', () => {
    const serialised = JSON.stringify(MOCK_TRACE_EVENTS);
    expect(serialised).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(serialised).not.toMatch(/ghp_[A-Za-z0-9]{8,}/);
    expect(serialised).not.toMatch(/AKIA[0-9A-Z]{12,}/);
  });

  it('no_real_api_called: mockTrace.ts has no fetch or network calls', () => {
    const src = fs.readFileSync(path.join(webSrc, 'mockTrace.ts'), 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta');
    expect(src).not.toContain('XMLHttpRequest');
  });

  it('trace_list_renders_mock_events: App.tsx includes TraceViewer', () => {
    const src = fs.readFileSync(path.join(webSrc, 'App.tsx'), 'utf8');
    expect(src).toContain('TraceViewer');
    expect(src).toContain('data-panel="conversation"');
  });
});
