/** Mock trace events for the TraceViewer placeholder — no real API, no fetch. */
export interface MockTraceEvent {
  seq: number;
  event_type: string;
  agent_role: string;
  summary: string;
}

export const MOCK_TRACE_EVENTS: MockTraceEvent[] = [
  { seq: 0, event_type: 'story_started',     agent_role: 'supervisor', summary: 'Supervisor accepted STORY-000.1 and dispatched to developer' },
  { seq: 1, event_type: 'patch_proposed',    agent_role: 'developer',  summary: 'Developer proposed patch for packages/shared/src/index.ts' },
  { seq: 2, event_type: 'validation_passed', agent_role: 'validator',  summary: 'Validator: all tests green (14/14); typecheck clean' },
  { seq: 3, event_type: 'checkpoint_created',agent_role: 'supervisor', summary: 'Supervisor created checkpoint after validation pass' },
  { seq: 4, event_type: 'story_complete',    agent_role: 'supervisor', summary: 'Supervisor confirmed story STORY-000.1 complete' },
];
