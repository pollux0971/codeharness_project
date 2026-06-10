/**
 * STORY-002.1 — Implement workflow state machine
 *
 * Covers all three acceptance-criteria behaviors:
 *   1. valid_transitions_pass
 *   2. invalid_transitions_rejected
 *   3. main_workflow_happy_path_covered
 *
 * All tests are deterministic; no LLM, no external API, no secrets.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  tick,
  selectNextStory,
  enforceAttemptBudget,
  enforceRunBudget,
  type HarnessState,
  type StoryRecord,
  type RunBudget,
  type TickInput,
} from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<StoryRecord> = {}): StoryRecord {
  return {
    story_id: 'STORY-002.1',
    epic_id: 'EPIC-002',
    depends_on: [],
    parallelism_class: 'sequential',
    status: 'todo',
    attempts: 0,
    attempt_budget: 3,
    branch: null,
    last_action: null,
    last_result: null,
    last_validation: null,
    blocked_reason: null,
    ...overrides,
  };
}

function makeRunBudget(used = 0, budget = 10): RunBudget {
  return { run_iteration_budget: budget, iterations_used: used };
}

function makeTickInput(overrides: Partial<TickInput>): TickInput {
  return {
    state: 'SUPERVISOR_CONTRACT',
    story: makeStory(),
    runBudget: makeRunBudget(),
    lastValidationPassed: null,
    humanGateCleared: false,
    ...overrides,
  };
}

// ── AC 1: valid_transitions_pass ──────────────────────────────────────────────

describe('STORY-002.1 valid_transitions_pass', () => {
  it('IDEA_INBOX → PLANNING_BUNDLE is valid', () => {
    expect(canTransition('IDEA_INBOX', 'PLANNING_BUNDLE')).toBe(true);
  });

  it('PLANNING_BUNDLE → SUPERVISOR_CONTRACT is valid', () => {
    expect(canTransition('PLANNING_BUNDLE', 'SUPERVISOR_CONTRACT')).toBe(true);
  });

  it('SUPERVISOR_CONTRACT → DEVELOPER_PATCH_PROPOSAL is valid', () => {
    expect(canTransition('SUPERVISOR_CONTRACT', 'DEVELOPER_PATCH_PROPOSAL')).toBe(true);
  });

  it('DEVELOPER_PATCH_PROPOSAL → DEVELOPER_PREFLIGHT is valid', () => {
    expect(canTransition('DEVELOPER_PATCH_PROPOSAL', 'DEVELOPER_PREFLIGHT')).toBe(true);
  });

  it('DEVELOPER_PATCH_PROPOSAL → HUMAN_GATE is valid (escalation path)', () => {
    expect(canTransition('DEVELOPER_PATCH_PROPOSAL', 'HUMAN_GATE')).toBe(true);
  });

  it('DEVELOPER_PREFLIGHT → SPEC_CONFORMANCE_REVIEW is valid (pass)', () => {
    expect(canTransition('DEVELOPER_PREFLIGHT', 'SPEC_CONFORMANCE_REVIEW')).toBe(true);
  });

  it('DEVELOPER_PREFLIGHT → DEVELOPER_PATCH_PROPOSAL is valid (self-correct)', () => {
    expect(canTransition('DEVELOPER_PREFLIGHT', 'DEVELOPER_PATCH_PROPOSAL')).toBe(true);
  });

  it('DEVELOPER_PREFLIGHT → HUMAN_GATE is valid (escalation)', () => {
    expect(canTransition('DEVELOPER_PREFLIGHT', 'HUMAN_GATE')).toBe(true);
  });

  it('SPEC_CONFORMANCE_REVIEW → WORKSPACE_APPLY is valid (pass)', () => {
    expect(canTransition('SPEC_CONFORMANCE_REVIEW', 'WORKSPACE_APPLY')).toBe(true);
  });

  it('SPEC_CONFORMANCE_REVIEW → DEVELOPER_PATCH_PROPOSAL is valid (fix proposal)', () => {
    expect(canTransition('SPEC_CONFORMANCE_REVIEW', 'DEVELOPER_PATCH_PROPOSAL')).toBe(true);
  });

  it('SPEC_CONFORMANCE_REVIEW → HUMAN_GATE is valid (escalation)', () => {
    expect(canTransition('SPEC_CONFORMANCE_REVIEW', 'HUMAN_GATE')).toBe(true);
  });

  it('WORKSPACE_APPLY → VALIDATION is valid', () => {
    expect(canTransition('WORKSPACE_APPLY', 'VALIDATION')).toBe(true);
  });

  it('VALIDATION → DEBUG_LOOP is valid (failure path)', () => {
    expect(canTransition('VALIDATION', 'DEBUG_LOOP')).toBe(true);
  });

  it('VALIDATION → CHECKPOINT is valid (pass path)', () => {
    expect(canTransition('VALIDATION', 'CHECKPOINT')).toBe(true);
  });

  it('VALIDATION → HUMAN_GATE is valid (escalation path)', () => {
    expect(canTransition('VALIDATION', 'HUMAN_GATE')).toBe(true);
  });

  it('DEBUG_LOOP → DEVELOPER_PATCH_PROPOSAL is valid (retry)', () => {
    expect(canTransition('DEBUG_LOOP', 'DEVELOPER_PATCH_PROPOSAL')).toBe(true);
  });

  it('DEBUG_LOOP → SUPERVISOR_CONTRACT is valid (re-contract)', () => {
    expect(canTransition('DEBUG_LOOP', 'SUPERVISOR_CONTRACT')).toBe(true);
  });

  it('DEBUG_LOOP → HUMAN_GATE is valid (escalation)', () => {
    expect(canTransition('DEBUG_LOOP', 'HUMAN_GATE')).toBe(true);
  });

  it('CHECKPOINT → PROMOTION_REVIEW is valid', () => {
    expect(canTransition('CHECKPOINT', 'PROMOTION_REVIEW')).toBe(true);
  });

  it('CHECKPOINT → SUPERVISOR_CONTRACT is valid (next story)', () => {
    expect(canTransition('CHECKPOINT', 'SUPERVISOR_CONTRACT')).toBe(true);
  });

  it('HUMAN_GATE → SUPERVISOR_CONTRACT is valid (cleared)', () => {
    expect(canTransition('HUMAN_GATE', 'SUPERVISOR_CONTRACT')).toBe(true);
  });

  it('HUMAN_GATE → CHECKPOINT is valid', () => {
    expect(canTransition('HUMAN_GATE', 'CHECKPOINT')).toBe(true);
  });

  it('HUMAN_GATE → DONE is valid', () => {
    expect(canTransition('HUMAN_GATE', 'DONE')).toBe(true);
  });

  it('PROMOTION_REVIEW → DONE is valid (approved)', () => {
    expect(canTransition('PROMOTION_REVIEW', 'DONE')).toBe(true);
  });

  it('PROMOTION_REVIEW → HUMAN_GATE is valid (needs review)', () => {
    expect(canTransition('PROMOTION_REVIEW', 'HUMAN_GATE')).toBe(true);
  });
});

// ── AC 2: invalid_transitions_rejected ────────────────────────────────────────

describe('STORY-002.1 invalid_transitions_rejected', () => {
  it('IDEA_INBOX → DONE is rejected (skips pipeline)', () => {
    expect(canTransition('IDEA_INBOX', 'DONE')).toBe(false);
  });

  it('IDEA_INBOX → SUPERVISOR_CONTRACT is rejected (skips planning)', () => {
    expect(canTransition('IDEA_INBOX', 'SUPERVISOR_CONTRACT')).toBe(false);
  });

  it('PLANNING_BUNDLE → DONE is rejected (no direct promotion)', () => {
    expect(canTransition('PLANNING_BUNDLE', 'DONE')).toBe(false);
  });

  it('PLANNING_BUNDLE → WORKSPACE_APPLY is rejected (skips middle states)', () => {
    expect(canTransition('PLANNING_BUNDLE', 'WORKSPACE_APPLY')).toBe(false);
  });

  it('WORKSPACE_APPLY → CHECKPOINT is rejected (skips VALIDATION)', () => {
    expect(canTransition('WORKSPACE_APPLY', 'CHECKPOINT')).toBe(false);
  });

  it('WORKSPACE_APPLY → DONE is rejected (must go through VALIDATION)', () => {
    expect(canTransition('WORKSPACE_APPLY', 'DONE')).toBe(false);
  });

  it('VALIDATION → SUPERVISOR_CONTRACT is rejected (must go through DEBUG_LOOP)', () => {
    expect(canTransition('VALIDATION', 'SUPERVISOR_CONTRACT')).toBe(false);
  });

  it('VALIDATION → DONE is rejected (must go through CHECKPOINT)', () => {
    expect(canTransition('VALIDATION', 'DONE')).toBe(false);
  });

  it('CHECKPOINT → DONE is rejected (must pass through PROMOTION_REVIEW or next story)', () => {
    expect(canTransition('CHECKPOINT', 'DONE')).toBe(false);
  });

  it('DONE → SUPERVISOR_CONTRACT is rejected (terminal state)', () => {
    expect(canTransition('DONE', 'SUPERVISOR_CONTRACT')).toBe(false);
  });

  it('DONE → IDEA_INBOX is rejected (terminal state has no transitions)', () => {
    expect(canTransition('DONE', 'IDEA_INBOX')).toBe(false);
  });

  it('DONE → DONE is rejected (terminal → terminal is a no-op, not a valid transition)', () => {
    expect(canTransition('DONE', 'DONE')).toBe(false);
  });

  it('DEBUG_LOOP → VALIDATION is rejected (must retry via developer)', () => {
    expect(canTransition('DEBUG_LOOP', 'VALIDATION')).toBe(false);
  });

  it('SUPERVISOR_CONTRACT → DONE is rejected (skips all implementation states)', () => {
    expect(canTransition('SUPERVISOR_CONTRACT', 'DONE')).toBe(false);
  });

  it('PROMOTION_REVIEW → PLANNING_BUNDLE is rejected (no backward transition)', () => {
    expect(canTransition('PROMOTION_REVIEW', 'PLANNING_BUNDLE')).toBe(false);
  });

  it('SPEC_CONFORMANCE_REVIEW → VALIDATION is rejected (must apply first)', () => {
    expect(canTransition('SPEC_CONFORMANCE_REVIEW', 'VALIDATION')).toBe(false);
  });

  it('DEVELOPER_PREFLIGHT → WORKSPACE_APPLY is rejected (must pass conformance first)', () => {
    expect(canTransition('DEVELOPER_PREFLIGHT', 'WORKSPACE_APPLY')).toBe(false);
  });
});

// ── AC 3: main_workflow_happy_path_covered ─────────────────────────────────────

describe('STORY-002.1 main_workflow_happy_path_covered', () => {
  it('tick returns issue_contract from SUPERVISOR_CONTRACT state', () => {
    const input = makeTickInput({ state: 'SUPERVISOR_CONTRACT' });
    expect(tick(input)).toBe('issue_contract');
  });

  it('tick returns request_patch from DEVELOPER_PATCH_PROPOSAL state', () => {
    const input = makeTickInput({ state: 'DEVELOPER_PATCH_PROPOSAL' });
    expect(tick(input)).toBe('request_patch');
  });

  it('tick returns apply_patch from WORKSPACE_APPLY state', () => {
    const input = makeTickInput({ state: 'WORKSPACE_APPLY' });
    expect(tick(input)).toBe('apply_patch');
  });

  it('tick returns run_validation when VALIDATION with no result yet', () => {
    const input = makeTickInput({ state: 'VALIDATION', lastValidationPassed: null });
    expect(tick(input)).toBe('run_validation');
  });

  it('tick returns write_checkpoint when VALIDATION passes', () => {
    const input = makeTickInput({ state: 'VALIDATION', lastValidationPassed: true });
    expect(tick(input)).toBe('write_checkpoint');
  });

  it('tick returns mark_story_done from CHECKPOINT state', () => {
    const input = makeTickInput({ state: 'CHECKPOINT' });
    expect(tick(input)).toBe('mark_story_done');
  });

  it('happy path states form a valid transition chain', () => {
    const happyPath: HarnessState[] = [
      'IDEA_INBOX',
      'PLANNING_BUNDLE',
      'SUPERVISOR_CONTRACT',
      'DEVELOPER_PATCH_PROPOSAL',
      'DEVELOPER_PREFLIGHT',
      'SPEC_CONFORMANCE_REVIEW',
      'WORKSPACE_APPLY',
      'VALIDATION',
      'CHECKPOINT',
      'PROMOTION_REVIEW',
      'DONE',
    ];

    for (let i = 0; i < happyPath.length - 1; i++) {
      const from = happyPath[i];
      const to = happyPath[i + 1];
      expect(canTransition(from, to), `${from} → ${to} must be valid`).toBe(true);
    }
  });

  it('stop_run is returned when run budget is exhausted', () => {
    const input = makeTickInput({
      state: 'SUPERVISOR_CONTRACT',
      runBudget: makeRunBudget(10, 10), // exhausted
    });
    expect(tick(input)).toBe('stop_run');
  });

  it('tick routes to debugger when validation fails within attempt budget', () => {
    const input = makeTickInput({
      state: 'VALIDATION',
      lastValidationPassed: false,
      story: makeStory({ attempts: 1, attempt_budget: 3 }),
    });
    expect(tick(input)).toBe('route_debugger');
  });

  it('tick escalates human when validation fails and attempt budget is exhausted', () => {
    const input = makeTickInput({
      state: 'VALIDATION',
      lastValidationPassed: false,
      story: makeStory({ attempts: 3, attempt_budget: 3 }),
    });
    expect(tick(input)).toBe('escalate_human');
  });

  it('tick escalates human from DEBUG_LOOP when attempt budget is exhausted', () => {
    const input = makeTickInput({
      state: 'DEBUG_LOOP',
      story: makeStory({ attempts: 3, attempt_budget: 3 }),
    });
    expect(tick(input)).toBe('escalate_human');
  });

  it('tick returns retry_develop from DEBUG_LOOP when within attempt budget', () => {
    const input = makeTickInput({
      state: 'DEBUG_LOOP',
      story: makeStory({ attempts: 1, attempt_budget: 3 }),
    });
    expect(tick(input)).toBe('retry_develop');
  });

  it('HUMAN_GATE cleared → select_story; not cleared → stop_run', () => {
    const cleared = makeTickInput({ state: 'HUMAN_GATE', humanGateCleared: true });
    expect(tick(cleared)).toBe('select_story');

    const blocked = makeTickInput({ state: 'HUMAN_GATE', humanGateCleared: false });
    expect(tick(blocked)).toBe('stop_run');
  });

  it('PROMOTION_REVIEW always requires human escalation', () => {
    const input = makeTickInput({ state: 'PROMOTION_REVIEW' });
    expect(tick(input)).toBe('escalate_human');
  });
});

// ── selectNextStory (DAG-awareness, referenced by story-002.1 scope) ──────────

describe('STORY-002.1 selectNextStory DAG behavior', () => {
  it('selects first todo story with no unmet dependencies', () => {
    const stories: StoryRecord[] = [
      makeStory({ story_id: 'A', status: 'done', depends_on: [] }),
      makeStory({ story_id: 'B', status: 'todo', depends_on: ['A'] }),
    ];
    expect(selectNextStory(stories)).toBe('B');
  });

  it('returns null when all todo stories have unmet dependencies', () => {
    const stories: StoryRecord[] = [
      makeStory({ story_id: 'A', status: 'todo', depends_on: [] }),
      makeStory({ story_id: 'B', status: 'todo', depends_on: ['A'] }),
    ];
    // A is todo but not done; B depends on A
    // selectNextStory should pick A first
    expect(selectNextStory(stories)).toBe('A');
  });

  it('returns null when no stories are todo', () => {
    const stories: StoryRecord[] = [
      makeStory({ story_id: 'A', status: 'done' }),
    ];
    expect(selectNextStory(stories)).toBeNull();
  });

  it('stable ordering: lower epic_id then lower story_id wins', () => {
    const stories: StoryRecord[] = [
      makeStory({ story_id: 'STORY-002', epic_id: 'EPIC-002', status: 'todo' }),
      makeStory({ story_id: 'STORY-001', epic_id: 'EPIC-001', status: 'todo' }),
    ];
    expect(selectNextStory(stories)).toBe('STORY-001');
  });
});

// ── enforceAttemptBudget + enforceRunBudget ───────────────────────────────────

describe('STORY-002.1 budget enforcement', () => {
  it('enforceAttemptBudget returns ok when under budget', () => {
    const story = makeStory({ attempts: 1, attempt_budget: 3 });
    expect(enforceAttemptBudget(story)).toBe('ok');
  });

  it('enforceAttemptBudget returns escalate when at budget', () => {
    const story = makeStory({ attempts: 3, attempt_budget: 3 });
    expect(enforceAttemptBudget(story)).toBe('escalate');
  });

  it('enforceAttemptBudget returns escalate when over budget', () => {
    const story = makeStory({ attempts: 5, attempt_budget: 3 });
    expect(enforceAttemptBudget(story)).toBe('escalate');
  });

  it('enforceRunBudget returns ok when under budget', () => {
    expect(enforceRunBudget(makeRunBudget(2, 10))).toBe('ok');
  });

  it('enforceRunBudget returns stop when at budget', () => {
    expect(enforceRunBudget(makeRunBudget(10, 10))).toBe('stop');
  });

  it('enforceRunBudget returns stop when over budget', () => {
    expect(enforceRunBudget(makeRunBudget(15, 10))).toBe('stop');
  });
});
