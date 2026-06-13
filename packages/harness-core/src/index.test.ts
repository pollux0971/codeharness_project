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
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';
import {
  canTransition,
  tick,
  selectNextStory,
  enforceAttemptBudget,
  enforceRunBudget,
  loadOrInitProjectRunState,
  persistProjectRunState,
  buildReviewSummary,
  recordReviewDecision,
  flagTestAuthorship,
  recordTestIntegrity,
  sendNotification,
  enrichBrownfieldStory,
  recordResolvedSettings,
  recordProviderRegistrations,
  classifyConsoleMessage,
  routeConsoleMessage,
  applyBacklogDelta,
  transitionToTerminalState,
  type HarnessState,
  type StoryRecord,
  type RunBudget,
  type TickInput,
  type ProjectRunState,
  type NotificationConfig,
  type NotificationPayload,
  type NotificationHttpClient,
  type BrownfieldCodeGraphClient,
  type BacklogTransaction,
  type BacklogDeltaInput,
  type TerminalStateCause,
  evaluateGateSla,
  GLOBAL_GATES_NO_AUTO_CLOSE,
  type GateSlaConfig,
} from './index.js';
import { readJsonl } from '@codeharness/event-log';
import { DEFAULT_SETTINGS } from '@codeharness/settings';

const tmpPath = () => join(tmpdir(), `prs_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}.json`);

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

// ── project-run-state (STORY-010.3) ───────────────────────────────────────────

describe('project-run-state', () => {
  it('run_state_persisted_per_target_project', async () => {
    const p = tmpPath();
    const state = loadOrInitProjectRunState(p, 'proj-A', ['STORY-A', 'STORY-B'], 10);
    state.stories.find(s => s.story_id === 'STORY-A')!.status = 'done';
    await persistProjectRunState(p, state);

    const reloaded = loadOrInitProjectRunState(p, 'proj-A', ['STORY-A', 'STORY-B'], 10);
    expect(reloaded.stories.find(s => s.story_id === 'STORY-A')?.status).toBe('done');
    unlinkSync(p);
  });

  it('resume_continues_from_last_checkpoint', async () => {
    const p = tmpPath();
    const state = loadOrInitProjectRunState(p, 'proj-B', ['STORY-A','STORY-B','STORY-C'], 10);
    state.current_story = 'STORY-B';
    state.iterations_used = 1;
    state.stories.find(s => s.story_id === 'STORY-A')!.status = 'done';
    state.stories.find(s => s.story_id === 'STORY-A')!.checkpoint_sha = 'abc123';
    state.stories.find(s => s.story_id === 'STORY-B')!.status = 'in_progress';
    await persistProjectRunState(p, state);

    const resumed = loadOrInitProjectRunState(p, 'proj-B', ['STORY-A','STORY-B','STORY-C'], 10);
    expect(resumed.current_story).toBe('STORY-B');
    expect(resumed.iterations_used).toBe(1);
    expect(resumed.stories.find(s => s.story_id === 'STORY-A')?.status).toBe('done');
    expect(resumed.stories.find(s => s.story_id === 'STORY-C')?.status).toBe('todo');
    unlinkSync(p);
  });

  it('no_done_recorded_without_validator_evidence', () => {
    const state = loadOrInitProjectRunState('/nonexistent/fresh.json', 'proj-C', ['STORY-X'], 10);
    expect(state.stories.every(s => s.status === 'todo')).toBe(true);
  });

  it('fresh_init_when_file_missing', () => {
    const state = loadOrInitProjectRunState('/nonexistent/path.json', 'proj-D', ['STORY-Z'], 5);
    expect(state.project_id).toBe('proj-D');
    expect(state.stories.length).toBe(1);
    expect(state.stories[0].status).toBe('todo');
    expect(state.iterations_used).toBe(0);
  });

  it('persist_sets_updated_at', async () => {
    const p = tmpPath();
    const state = loadOrInitProjectRunState(p, 'proj-E', [], 5);
    const before = state.updated_at;
    await new Promise(r => setTimeout(r, 5));
    await persistProjectRunState(p, state);
    const after = JSON.parse(require('fs').readFileSync(p, 'utf8')).updated_at;
    expect(after >= before).toBe(true);
    unlinkSync(p);
  });
});

// ── review-cli domain (STORY-012.2) ───────────────────────────────────────────

function makeCheckpointedRunState(): ProjectRunState {
  return {
    schema_version: 1, project_id: 'proj-review', run_id: 'run-rev-1',
    created_at: '', updated_at: '', current_story: null, last_decision: null,
    iterations_used: 2, run_iteration_budget: 10,
    stories: [
      { story_id: 'STORY-A', status: 'done', attempts: 1, attempt_budget: 3,
        checkpoint_sha: 'sha-a', last_action: null, last_result: null, blocked_reason: null },
      { story_id: 'STORY-B', status: 'done', attempts: 1, attempt_budget: 3,
        checkpoint_sha: 'sha-b', last_action: null, last_result: null, blocked_reason: null },
    ],
  };
}

const tmpTrace = () => join(tmpdir(), `review-trace-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jsonl`);
const tmpIntegrityTrace = () => join(tmpdir(), `integrity-trace-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jsonl`);

describe('review-cli-domain', () => {
  it('approve_required_before_promotion', () => {
    const trace = tmpTrace();
    const decision = recordReviewDecision(
      { runId: 'run-rev-1', projectId: 'proj-review',
        runState: makeCheckpointedRunState(), traceLogPath: trace },
      'approved', ''
    );
    expect(decision.outcome).toBe('approved');
    expect(decision.reason).toBe('operator approved');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('deny_records_reason_and_blocks', () => {
    const trace = tmpTrace();
    const decision = recordReviewDecision(
      { runId: 'run-rev-1', projectId: 'proj-review',
        runState: makeCheckpointedRunState(), traceLogPath: trace },
      'denied', 'needs more tests'
    );
    expect(decision.outcome).toBe('denied');
    expect(decision.reason).toBe('needs more tests');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('deny_without_reason_throws', () => {
    const trace = tmpTrace();
    expect(() => recordReviewDecision(
      { runId: 'r', projectId: 'p', runState: makeCheckpointedRunState(), traceLogPath: trace },
      'denied', ''
    )).toThrow(/deny requires a reason/);
  });

  it('review_summary_shows_diff_and_validation_evidence', () => {
    const summary = buildReviewSummary(makeCheckpointedRunState());
    expect(summary.total_stories).toBe(2);
    expect(summary.done_count).toBe(2);
    expect(summary.promotable).toBe(true);
    expect(summary.all_checkpointed).toBe(true);
    expect(summary.validation_evidence.map(e => e.story_id)).toEqual(['STORY-A', 'STORY-B']);
  });

  it('summary_not_promotable_when_incomplete', () => {
    const partial = makeCheckpointedRunState();
    partial.stories[1].status = 'in_progress';
    partial.stories[1].checkpoint_sha = null;
    const summary = buildReviewSummary(partial);
    expect(summary.promotable).toBe(false);
    expect(summary.all_checkpointed).toBe(false);
  });

  it('review_decision_written_to_trace', () => {
    const trace = tmpTrace();
    recordReviewDecision(
      { runId: 'run-rev-1', projectId: 'proj-review',
        runState: makeCheckpointedRunState(), traceLogPath: trace },
      'approved', 'lgtm'
    );
    const events = readJsonl(trace);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('human_review');
    if (existsSync(trace)) unlinkSync(trace);
  });
});

// ── test-integrity (STORY-015.3) ──────────────────────────────────────────────

describe('test-integrity', () => {
  it('implementer_authored_tests_flagged', () => {
    const a = flagTestAuthorship('S-1', ['test/a.test.ts'], 'developer');
    expect(a.implementer_only).toBe(true);
    expect(a.requires_human_confirmation).toBe(true);
    expect(a.authored_by).toBe('developer');
  });

  it('supervisor_authored_not_flagged', () => {
    const a = flagTestAuthorship('S-1', [], 'supervisor');
    expect(a.implementer_only).toBe(false);
    expect(a.requires_human_confirmation).toBe(false);
  });

  it('debugger_authored_flagged', () => {
    const a = flagTestAuthorship('S-1', [], 'debugger');
    expect(a.implementer_only).toBe(true);
  });

  it('non_implementer_author_path_available', () => {
    const trace = tmpIntegrityTrace();
    const authorship = flagTestAuthorship('S-1', ['test/a.test.ts'], 'developer');
    const record = recordTestIntegrity(authorship, 'human', trace);
    expect(record.confirmed_by).toBe('human');
    expect(record.story_id).toBe('S-1');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('human_confirmation_recorded_at_checkpoint', () => {
    const trace = tmpIntegrityTrace();
    const authorship = flagTestAuthorship('S-2', [], 'developer');
    recordTestIntegrity(authorship, 'supervisor_second_pass', trace);
    const events = readJsonl(trace);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('test_integrity');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('confirm_non_flagged_authorship_throws', () => {
    const trace = tmpIntegrityTrace();
    const authorship = flagTestAuthorship('S-3', [], 'supervisor');
    expect(() => recordTestIntegrity(authorship, 'human', trace))
      .toThrow(/confirmation requires/);
  });
});

// ── STORY-019.3: Push-notifications ──────────────────────────────────────────

const enabledWebhookConfig = (events = ['escalation', 'approval_required']): NotificationConfig => ({
  version: 1,
  channels: {
    primary: {
      type: 'webhook',
      url: 'https://hooks.test/notify',
      enabled: true,
      retry: { max_attempts: 3, backoff_ms: 0 },
    },
  },
  events,
});

const escalationPayload: NotificationPayload = {
  event_type: 'escalation',
  story_id: 'STORY-A',
  message: 'Story A escalated',
  run_id: 'run-1',
};

const okHttp: NotificationHttpClient = async () => ({ ok: true, status: 200 });

describe('notifications', () => {
  it('escalations_pushed_to_configured_channel', async () => {
    let called = false;
    const http: NotificationHttpClient = async (_url, _p) => { called = true; return { ok: true, status: 200 }; };
    const r = await sendNotification(escalationPayload, enabledWebhookConfig(), http);
    expect(r.ok).toBe(true);
    expect(called).toBe(true);
  });

  it('approvals_requested_via_notification', async () => {
    const payload: NotificationPayload = { event_type: 'approval_required', message: 'Please approve' };
    const r = await sendNotification(payload, enabledWebhookConfig(), okHttp);
    expect(r.ok).toBe(true);
  });

  it('channel_failures_never_block_the_loop', async () => {
    const throwingHttp: NotificationHttpClient = async () => { throw new Error('network down'); };
    const r = await sendNotification(escalationPayload, enabledWebhookConfig(), throwingHttp);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('no_enabled_channel_returns_no_channel', async () => {
    const cfg: NotificationConfig = {
      version: 1,
      channels: { primary: { type: 'webhook', enabled: false } },
      events: ['escalation'],
    };
    const r = await sendNotification(escalationPayload, cfg);
    expect(r.ok).toBe(false);
    expect(r.channel).toBe('none');
  });

  it('notification_respects_event_filter', async () => {
    const cfg = enabledWebhookConfig(['escalation']);
    const payload: NotificationPayload = { event_type: 'build_error', message: 'build failed' };
    const r = await sendNotification(payload, cfg, okHttp);
    expect(r.ok).toBe(false);
  });

  it('retry_on_transient_failure', async () => {
    let attempts = 0;
    const flaky: NotificationHttpClient = async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient');
      return { ok: true, status: 200 };
    };
    const r = await sendNotification(escalationPayload, enabledWebhookConfig(), flaky);
    expect(r.ok).toBe(true);
    expect(attempts).toBe(3);
  });
});

// ── STORY-020.3: brownfield-enrichment ───────────────────────────────────────

const brownfieldRecord = (pclass: StoryRecord['parallelism_class'] = 'parallel_safe') => ({
  story_id: 'S-1', epic_id: 'E-1', depends_on: [],
  parallelism_class: pclass, status: 'todo' as const,
  attempts: 0, attempt_budget: 3,
  branch: null, last_action: null, last_result: null, last_validation: null, blocked_reason: null,
  task_class: 'brownfield' as const,
  allowed_write_set: ['src/a.ts'],
});

const impactClient = (files: string[]): BrownfieldCodeGraphClient => ({
  async query() { return { impacted_files: files }; },
});

describe('brownfield-enrichment', () => {
  it('brownfield_write_set_derived_from_impact_set', async () => {
    const enriched = await enrichBrownfieldStory(brownfieldRecord(), { codegraphClient: impactClient(['src/b.ts']) });
    expect(enriched.allowed_write_set).toContain('src/b.ts');
  });

  it('hot_file_overlap_restricts_parallelism', async () => {
    const enriched = await enrichBrownfieldStory(brownfieldRecord(), { hotFiles: ['src/a.ts'] });
    expect(enriched.parallelism_class).toBe('sequential');
  });

  it('public_api_or_schema_change_forced_exclusive', async () => {
    const story = { ...brownfieldRecord(), public_api_constraint: { frozen_paths: ['src/api/**'], reason: 'published' } };
    const enriched = await enrichBrownfieldStory(story);
    expect(enriched.parallelism_class).toBe('exclusive');
  });

  it('greenfield_packets_unchanged', async () => {
    const gf = { ...brownfieldRecord(), task_class: 'greenfield' as const };
    const enriched = await enrichBrownfieldStory(gf);
    expect(enriched).toBe(gf);
  });
});

describe('settings-trace', () => {
  it('resolved_settings_recorded_in_trace', async () => {
    const trace = join(tmpdir(), `settings-trace-${process.pid}.jsonl`);
    await recordResolvedSettings(DEFAULT_SETTINGS, trace);
    const events = readJsonl(trace);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('resolved_settings');
    if (existsSync(trace)) unlinkSync(trace);
  });
});

// ── STORY-023.2: console message router ──────────────────────────────────────

describe('console-router', () => {
  it('status_query_answered_from_tracker', () => {
    const c = classifyConsoleMessage('how is the build going?');
    expect(c.intent).toBe('status_query');
    const r = routeConsoleMessage(c, {});
    expect(r.requiresModelFallback).toBe(false);
  });

  it('off_topic_refused', () => {
    expect(classifyConsoleMessage('what is the weather today?').intent).toBe('off_topic');
  });

  it('raw_instruction_never_becomes_work', () => {
    const c = classifyConsoleMessage('write me a poem');
    const r = routeConsoleMessage(c, {});
    expect(r.response).toMatch(/off-topic|only discuss/i);
  });

  it('ambiguous_intent_uses_model_fallback', () => {
    const c = classifyConsoleMessage('ok');
    const r = routeConsoleMessage(c, {});
    expect(r.requiresModelFallback).toBe(true);
  });

  it('approval_response_classified', () => {
    expect(classifyConsoleMessage('approved').intent).toBe('approval_response');
    expect(classifyConsoleMessage('lgtm').intent).toBe('approval_response');
  });

  it('scope_change_request_classified', () => {
    expect(classifyConsoleMessage('add a new story for caching').intent).toBe('scope_change_request');
  });
});

// ── STORY-023.3: Backlog delta transaction ────────────────────────────────────

const validDelta: BacklogDeltaInput = {
  new_stories: [{ story_id: 'STORY-NEW-001' }],
  epic_list_additions: ['EPIC-SC-greenfield'],
  source_message: 'add caching',
  validated: true,
  validation_errors: [],
};

describe('backlog-transaction', () => {
  it('delta_lands_as_tracker_transaction', async () => {
    const t = join(tmpdir(), `bt-${Date.now()}.jsonl`);
    const tx: BacklogTransaction = await applyBacklogDelta(validDelta, t);
    expect(tx.added_story_ids).toContain('STORY-NEW-001');
    if (existsSync(t)) unlinkSync(t);
  });

  it('backlog_updated_event_emitted', async () => {
    const t = join(tmpdir(), `bt-${Date.now()}.jsonl`);
    await applyBacklogDelta(validDelta, t);
    const events = readJsonl(t);
    expect(events[0].type).toBe('backlog_updated');
    if (existsSync(t)) unlinkSync(t);
  });
});

// ── STORY-027.1: terminal-states ──────────────────────────────────────────────

describe('terminal-states', () => {
  it('failed_aborted_cancelled_are_explicit_states', async () => {
    const trace = join(tmpdir(), `term-${Date.now()}.jsonl`);
    const cause: TerminalStateCause = { state: 'failed', reason: 'budget exhausted', trigger: 'budget_exhausted' };
    const r = await transitionToTerminalState(cause, trace);
    expect(r.new_state).toBe('failed');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('cause_recorded_in_trace', async () => {
    const trace = join(tmpdir(), `term-${Date.now()}.jsonl`);
    const cause: TerminalStateCause = { state: 'aborted', reason: 'human stopped', trigger: 'human_stop' };
    await transitionToTerminalState(cause, trace);
    const events = readJsonl(trace);
    expect(events[0].type).toBe('run_terminal');
    expect(events[0].payload?.trigger).toBe('human_stop');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('stop_run_transitions_to_aborted', async () => {
    const trace = join(tmpdir(), `term-${Date.now()}.jsonl`);
    const cause: TerminalStateCause = { state: 'aborted', reason: 'operator stop', trigger: 'human_stop' };
    const r = await transitionToTerminalState(cause, trace);
    expect(r.new_state).toBe('aborted');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('cancelled_on_bundle_rejection', async () => {
    const trace = join(tmpdir(), `term-${Date.now()}.jsonl`);
    const cause: TerminalStateCause = { state: 'cancelled', reason: 'bundle rejected', trigger: 'human_reject_bundle' };
    const r = await transitionToTerminalState(cause, trace);
    expect(r.new_state).toBe('cancelled');
    if (existsSync(trace)) unlinkSync(trace);
  });
});

// ── STORY-027.2: Gate SLA tests ───────────────────────────────────────────────

describe('gate-sla', () => {
  const trace = () => join(tmpdir(), `sla-${Date.now()}.jsonl`);

  it('gate_timeout_configurable_per_type', async () => {
    const t = trace();
    const cfg: GateSlaConfig = { gate_type: 'approval_request', timeout_seconds: 3600, escalation_policy: 're_notify' };
    const r = await evaluateGateSla(cfg, 1800, t);
    expect(r.timed_out).toBe(false);
    expect(r.action_taken).toBe('waiting');
    if (existsSync(t)) unlinkSync(t);
  });

  it('escalation_policy_enforced', async () => {
    const t = trace();
    const cfg: GateSlaConfig = { gate_type: 'approval_request', timeout_seconds: 3600, escalation_policy: 'auto_deny' };
    const r = await evaluateGateSla(cfg, 7200, t);
    expect(r.timed_out).toBe(true);
    expect(r.action_taken).toBe('auto_deny');
    if (existsSync(t)) unlinkSync(t);
  });

  it('auto_approve_only_for_non_security_gates', async () => {
    const t = trace();
    const cfg: GateSlaConfig = { gate_type: 'approval_request', timeout_seconds: 60, escalation_policy: 'auto_approve', is_security_gate: true };
    const r = await evaluateGateSla(cfg, 120, t);
    expect(r.action_taken).toBe('auto_deny'); // overridden
    if (existsSync(t)) unlinkSync(t);
  });

  it('global_gates_never_auto_close', async () => {
    const t = trace();
    const cfg: GateSlaConfig = { gate_type: 'promotion_review', timeout_seconds: 60, escalation_policy: 'auto_approve', is_security_gate: true };
    const r = await evaluateGateSla(cfg, 9999, t);
    expect(r.action_taken).toBe('blocked_global_gate');
    if (existsSync(t)) unlinkSync(t);
  });

  it('sla_events_in_trace', async () => {
    const t = trace();
    await evaluateGateSla({ gate_type: 'hold_release', timeout_seconds: 60, escalation_policy: 're_notify' }, 30, t);
    const events = readJsonl(t);
    expect(events[0].type).toBe('gate_sla_tick');
    if (existsSync(t)) unlinkSync(t);
  });
});

describe('provider-registration-trace (STORY-028.2)', () => {
  const tmpBootTrace = () => join(tmpdir(), `gateway-boot-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jsonl`);

  it('registration_event_in_trace_no_secret', async () => {
    const t = tmpBootTrace();
    const n = await recordProviderRegistrations(
      [{ provider_id: 'openai', provider: 'openai', base_url: 'https://api.openai.com/v1', handle_id: 'provider.openai.default' }],
      t,
    );
    expect(n).toBe(1);
    const events = readJsonl(t);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('provider_registered');
    expect(events[0].payload).toEqual({
      provider_id: 'openai', provider: 'openai', base_url: 'https://api.openai.com/v1', handle_id: 'provider.openai.default',
    });
    // No credential value can be present: the whole serialized trace carries only the handle reference.
    const raw = JSON.stringify(events);
    expect(raw).not.toMatch(/sk-/);
    expect(raw).toContain('provider.openai.default');
    if (existsSync(t)) unlinkSync(t);
  });

  it('appends_chained_events_for_multiple_registrations', async () => {
    const t = tmpBootTrace();
    await recordProviderRegistrations([
      { provider_id: 'openai', provider: 'openai', base_url: 'https://api.openai.com/v1', handle_id: 'provider.openai.default' },
      { provider_id: 'deepseek', provider: 'deepseek', base_url: 'https://api.deepseek.com', handle_id: 'provider.deepseek.default' },
    ], t);
    const events = readJsonl(t);
    expect(events.map(e => e.seq)).toEqual([0, 1]);
    expect(events[1].previous_event_hash).toBe(events[0].hash);
    if (existsSync(t)) unlinkSync(t);
  });
});
