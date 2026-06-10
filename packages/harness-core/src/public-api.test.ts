/**
 * Verifies that Orchestrator v0 symbols are accessible from the harness-core
 * public entry point (index.ts), not just via the internal source path.
 * If this test fails, the package's public API is broken for downstream consumers.
 */
import { describe, it, expect } from 'vitest';
import {
  // v0 functions
  selectNextRuntimeStory,
  hasBlockedOrEscalatedDependency,
  decideNextAction,
  advanceTrackerState,
  buildResumeSummary,
  // v0 types (imported as values to assert they are not undefined at runtime)
  // TypeScript type-only imports are erased, so we check the functions instead.
  // Pre-existing index.ts exports must still work:
  canTransition,
  selectNextStory,
  enforceAttemptBudget,
  enforceRunBudget,
  tick,
} from './index.js';

describe('harness-core public API', () => {
  it('exports orchestrator-v0 functions from public entry', () => {
    expect(typeof selectNextRuntimeStory).toBe('function');
    expect(typeof hasBlockedOrEscalatedDependency).toBe('function');
    expect(typeof decideNextAction).toBe('function');
    expect(typeof advanceTrackerState).toBe('function');
    expect(typeof buildResumeSummary).toBe('function');
  });

  it('v0 functions are callable and produce correct types', () => {
    const stories = [
      {
        story_id: 'S1', epic_id: 'E1', depends_on: [], status: 'todo' as const,
        priority: 1, order_index: 0, attempts: 0, attempt_budget: 2,
        allowed_write_set: ['src/**'], validation_commands: ['echo ok'],
        rollback_notes: 'git checkout -- src/', blocked_reason: null,
      },
    ];
    expect(selectNextRuntimeStory(stories)).toBe('S1');
    expect(hasBlockedOrEscalatedDependency(stories)).toBe(false);

    const state = {
      run_id: 'run-pub-test', state: 'select' as const,
      run_iteration_budget: 5, iterations_used: 0,
      stories, active_story_id: null,
      last_validation_passed: null, human_gate_cleared: false,
      stop_reason: null, decision_log: [],
    };
    const d = decideNextAction(state);
    expect(d.action).toBe('select_next_story');
    expect(typeof d.tick).toBe('number');

    const s2 = advanceTrackerState(state, d, { success: true });
    expect(s2.state).toBe('contract');
    expect(s2.iterations_used).toBe(1);

    const summary = buildResumeSummary(s2);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('pre-existing index.ts exports remain intact', () => {
    expect(typeof canTransition).toBe('function');
    expect(typeof selectNextStory).toBe('function');
    expect(typeof enforceAttemptBudget).toBe('function');
    expect(typeof enforceRunBudget).toBe('function');
    expect(typeof tick).toBe('function');
    // canTransition still works
    expect(canTransition('VALIDATION', 'CHECKPOINT')).toBe(true);
    expect(canTransition('CHECKPOINT', 'VALIDATION')).toBe(false);
  });
});
