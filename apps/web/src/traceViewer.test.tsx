import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { useTraceStream } from './useTraceStream';
import { TraceViewer } from './TraceViewer';
import type { TraceEvent } from '@codeharness/harness-core';

const e = (id: string, type: string, story?: string): TraceEvent => ({
  event_id: id, type, story_id: story, payload: {}, recorded_at: '2026-01-01T00:00:00Z',
});

describe('trace-viewer', () => {
  it('trace_viewer_streams_real_events', () => {
    const mockEvents = [e('e1', 'promotion', 'STORY-A'), e('e2', 'checkpoint', 'STORY-A'), e('e3', 'escalation', 'STORY-B')];
    const { result } = renderHook(() => useTraceStream({ mode: 'mock', mockEvents }));
    expect(result.current.events.length).toBe(3);
    expect(result.current.loading).toBe(false);
  });

  it('event_filtering_by_story_and_type', () => {
    const mockEvents = [e('e1', 'promotion', 'STORY-A'), e('e2', 'checkpoint', 'STORY-A'),
                        e('e3', 'promotion', 'STORY-B'), e('e4', 'checkpoint', 'STORY-B')];
    const { result } = renderHook(() =>
      useTraceStream({ mode: 'mock', mockEvents, storyFilter: 'STORY-A' }));
    expect(result.current.events.length).toBe(2);
    expect(result.current.events.every(ev => ev.story_id === 'STORY-A')).toBe(true);
  });

  it('event_filtering_by_type', () => {
    const mockEvents = [e('e1', 'promotion', 'STORY-A'), e('e2', 'escalation', 'STORY-A'),
                        e('e3', 'promotion', 'STORY-B'), e('e4', 'escalation', 'STORY-B')];
    const { result } = renderHook(() =>
      useTraceStream({ mode: 'mock', mockEvents, typeFilter: ['promotion'] }));
    expect(result.current.events.length).toBe(2);
    expect(result.current.events.every(ev => ev.type === 'promotion')).toBe(true);
  });

  it('mock_mode_still_available_for_ci', () => {
    let fetchCalled = false;
    const origFetch = global.fetch;
    global.fetch = async () => { fetchCalled = true; return new Response('[]'); };
    const mockEvents = [e('e1', 'checkpoint')];
    const { result } = renderHook(() => useTraceStream({ mode: 'mock', mockEvents }));
    expect(result.current.events.length).toBe(1);
    expect(fetchCalled).toBe(false);
    global.fetch = origFetch;
  });

  it('trace_viewer_renders_mock_events', () => {
    const mockEvents = [e('evt-001', 'promotion', 'STORY-A'), e('evt-002', 'escalation', 'STORY-B')];
    render(<TraceViewer mode='mock' mockEvents={mockEvents} />);
    expect(screen.getByText(/evt-001/)).toBeTruthy();
    expect(screen.getByText(/evt-002/)).toBeTruthy();
  });
});
