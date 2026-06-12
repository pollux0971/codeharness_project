import type { TraceEvent } from '@codeharness/harness-core';

/** Mock trace events for the TraceViewer — no real API, no fetch. */
export const MOCK_TRACE_EVENTS: TraceEvent[] = [
  {
    event_id:    'evt-mock-001',
    type:        'story_started',
    story_id:    'STORY-000.1',
    payload:     { agent: 'supervisor', action: 'dispatched_to_developer' },
    recorded_at: '2026-01-01T00:00:00Z',
  },
  {
    event_id:    'evt-mock-002',
    type:        'checkpoint',
    story_id:    'STORY-000.1',
    payload:     { commit_sha: 'abc1234', tests_passed: 14 },
    recorded_at: '2026-01-01T00:01:00Z',
  },
  {
    event_id:    'evt-mock-003',
    type:        'promotion',
    story_id:    'STORY-000.1',
    payload:     { outcome: 'approved', decided_by: 'human' },
    recorded_at: '2026-01-01T00:02:00Z',
  },
  {
    event_id:    'evt-mock-004',
    type:        'human_review',
    story_id:    'STORY-000.2',
    payload:     { outcome: 'approved', reason: 'all tests green' },
    recorded_at: '2026-01-01T00:03:00Z',
  },
  {
    event_id:    'evt-mock-005',
    type:        'escalation',
    story_id:    'STORY-000.2',
    payload:     { reason: 'attempt_budget_exceeded', story_id: 'STORY-000.2' },
    recorded_at: '2026-01-01T00:04:00Z',
  },
];
