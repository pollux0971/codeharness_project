// Orchestrator — CodeHarness inner-loop state machine engine.
//
// Responsibilities:
//   1. Drive story state transitions (tick)
//   2. Select the next story respecting the dependency DAG (selectNextStory)
//   3. Enforce attempt and run budgets (enforceAttemptBudget, enforceRunBudget)
//   4. Detect human gate triggers deterministically (checkHumanGate)
//   5. Record checkpoints and rollback (checkpoint, rollback)
//
// Nothing here is an LLM. Every decision is deterministic and auditable.

// ── Types ────────────────────────────────────────────────────────────────────

/** UI-facing trace event type for the TraceViewer component. */
export interface TraceEvent {
  event_id: string;
  type: string;
  story_id?: string;
  payload: Record<string, unknown>;
  recorded_at: string;
}

export type StoryStatus =
  | 'todo' | 'in_progress' | 'validating' | 'debugging'
  | 'passed' | 'checkpointed' | 'blocked' | 'escalated' | 'done';

export type HarnessState =
  | 'IDEA_INBOX' | 'PLANNING_BUNDLE' | 'SUPERVISOR_CONTRACT'
  | 'DEVELOPER_PATCH_PROPOSAL' | 'DEVELOPER_PREFLIGHT' | 'SPEC_CONFORMANCE_REVIEW'
  | 'WORKSPACE_APPLY' | 'VALIDATION'
  | 'DEBUG_LOOP' | 'CHECKPOINT' | 'HUMAN_GATE' | 'PROMOTION_REVIEW' | 'DONE';

export type OrchestratorAction =
  | 'run_bootstrap'          // Step 0: capture env snapshot
  | 'select_story'           // pick next story from DAG
  | 'issue_contract'         // Supervisor issues StoryContract
  | 'request_patch'          // Developer turn
  | 'apply_patch'            // Tool Executor applies the proposal to the workspace branch
  | 'run_validation'         // Validator runs validation_commands
  | 'route_debugger'         // hand to Debugger on failure
  | 'retry_develop'          // back to Developer after a repair
  | 'write_checkpoint'       // save state; mark story checkpointed
  | 'escalate_human'         // stop + ask; never continue until human responds
  | 'rollback_workspace'     // revert the workspace branch to the pre-story snapshot
  | 'mark_story_done'        // story is done; update tracker
  | 'stop_run';              // run budget exhausted or stop condition fired

export type HumanGateReason =
  | 'scope_expansion'        // repair requires writing outside allowed_write_set
  | 'attempt_budget_exceeded'// max develop<->debug cycles exhausted
  | 'run_budget_exceeded'    // max stories for this /goal run exhausted
  | 'systemic_failure'       // failure gene consolidated_count >= threshold
  | 'stable_mutation'        // writing to protected/production path
  | 'promotion'              // promoting from workspace to main
  | 'first_enable_provider'  // first use of a new model provider
  | 'policy_change'          // any change to policy.yaml or decision_matrix
  | 'sudo_or_irreversible';  // any sudo / rm -rf / destructive command

// ── Legal transitions ─────────────────────────────────────────────────────────

const TRANSITIONS: Record<HarnessState, HarnessState[]> = {
  IDEA_INBOX:              ['PLANNING_BUNDLE'],
  PLANNING_BUNDLE:         ['SUPERVISOR_CONTRACT'],
  SUPERVISOR_CONTRACT:     ['DEVELOPER_PATCH_PROPOSAL'],
  DEVELOPER_PATCH_PROPOSAL:['DEVELOPER_PREFLIGHT', 'HUMAN_GATE'],          // preflight next, or escalate instead of guessing
  DEVELOPER_PREFLIGHT:     ['SPEC_CONFORMANCE_REVIEW', 'DEVELOPER_PATCH_PROPOSAL', 'HUMAN_GATE'], // advisory: pass→conformance, self-correct (bounded), or escalate
  SPEC_CONFORMANCE_REVIEW: ['WORKSPACE_APPLY', 'DEVELOPER_PATCH_PROPOSAL', 'HUMAN_GATE'],          // HARD gate: pass→apply, fix proposal, or escalate
  WORKSPACE_APPLY:         ['VALIDATION'],
  VALIDATION:              ['DEBUG_LOOP', 'CHECKPOINT', 'HUMAN_GATE'],
  DEBUG_LOOP:              ['DEVELOPER_PATCH_PROPOSAL', 'SUPERVISOR_CONTRACT', 'HUMAN_GATE'],
  CHECKPOINT:              ['PROMOTION_REVIEW', 'SUPERVISOR_CONTRACT'],  // next story or promote
  HUMAN_GATE:              ['SUPERVISOR_CONTRACT', 'CHECKPOINT', 'DONE'],
  PROMOTION_REVIEW:        ['DONE', 'HUMAN_GATE'],
  DONE:                    [],
};

export function canTransition(from: HarnessState, to: HarnessState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Story record (mirrors tracker_state.json.stories[n]) ─────────────────────

export interface StoryRecord {
  story_id: string;
  epic_id: string;
  depends_on: string[];
  parallelism_class: 'parallel_safe' | 'parallel_with_barrier' | 'sequential' | 'exclusive';
  status: StoryStatus;
  attempts: number;
  attempt_budget: number;
  branch: string | null;
  last_action: string | null;
  last_result: string | null;
  last_validation: string | null;
  blocked_reason: string | null;
}

export interface RunBudget {
  run_iteration_budget: number;
  iterations_used: number;
}

// ── Story selection (DAG-aware) ───────────────────────────────────────────────

/**
 * Return the story_id that should run next, or null if nothing is runnable.
 * Rules:
 *  1. All depends_on stories must be 'done'.
 *  2. Status must be 'todo' (or 'blocked' being retried after a human clears it).
 *  3. Among candidates, prefer lower epic_id then lower story_id (stable ordering).
 *  4. 'exclusive' stories block all parallel work; wait until they are done.
 */
export function selectNextStory(stories: StoryRecord[]): string | null {
  const done = new Set(stories.filter(s => s.status === 'done').map(s => s.story_id));
  const hasExclusiveRunning = stories.some(
    s => s.parallelism_class === 'exclusive' && s.status === 'in_progress'
  );
  if (hasExclusiveRunning) return null;

  const candidates = stories.filter(s =>
    (s.status === 'todo') &&
    s.depends_on.every(dep => done.has(dep))
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.epic_id.localeCompare(b.epic_id) || a.story_id.localeCompare(b.story_id));
  return candidates[0].story_id;
}

// ── Budget enforcement ────────────────────────────────────────────────────────

export function enforceAttemptBudget(
  story: StoryRecord
): 'ok' | 'escalate' {
  return story.attempts < story.attempt_budget ? 'ok' : 'escalate';
}

export function enforceRunBudget(budget: RunBudget): 'ok' | 'stop' {
  return budget.iterations_used < budget.run_iteration_budget ? 'ok' : 'stop';
}

// ── Human gate detection (deterministic — never trusts agent self-report) ─────

/** Returns the gate reason if the proposed action requires human approval, or null. */
export function checkHumanGate(
  action: OrchestratorAction,
  story: StoryRecord,
  context: { changedFiles?: string[]; allowedWriteSet?: string[]; isPromotion?: boolean }
): HumanGateReason | null {
  if (action === 'escalate_human') return 'attempt_budget_exceeded'; // already decided upstream
  if (context.isPromotion) return 'promotion';
  if (action === 'apply_patch' && context.changedFiles && context.allowedWriteSet) {
    const outside = context.changedFiles.filter(f =>
      !context.allowedWriteSet!.some(pattern => matchesGlob(f, pattern))
    );
    if (outside.length > 0) return 'scope_expansion';
  }
  if (story.blocked_reason?.startsWith('systemic_failure')) return 'systemic_failure';
  return null;
}

// ── Core tick ────────────────────────────────────────────────────────────────

export interface TickInput {
  state: HarnessState;
  story: StoryRecord;
  runBudget: RunBudget;
  lastValidationPassed: boolean | null;
  humanGateCleared: boolean;
}

/**
 * Single-step the orchestrator: given the current state and story, return
 * the next action. Pure function — no side effects.
 */
export function tick(input: TickInput): OrchestratorAction {
  const { state, story, runBudget, lastValidationPassed, humanGateCleared } = input;

  if (enforceRunBudget(runBudget) === 'stop') return 'stop_run';

  switch (state) {
    case 'SUPERVISOR_CONTRACT':    return 'issue_contract';
    case 'DEVELOPER_PATCH_PROPOSAL': return 'request_patch';
    case 'WORKSPACE_APPLY':        return 'apply_patch';

    case 'VALIDATION':
      if (lastValidationPassed === true)  return 'write_checkpoint';
      if (lastValidationPassed === false) {
        return enforceAttemptBudget(story) === 'ok' ? 'route_debugger' : 'escalate_human';
      }
      return 'run_validation';

    case 'DEBUG_LOOP':
      return enforceAttemptBudget(story) === 'ok' ? 'retry_develop' : 'escalate_human';

    case 'CHECKPOINT':
      return 'mark_story_done';

    case 'HUMAN_GATE':
      return humanGateCleared ? 'select_story' : 'stop_run';

    case 'PROMOTION_REVIEW':
      return 'escalate_human';   // promotion always requires human approval

    default:
      return 'stop_run';
  }
}

// ── Checkpoint + rollback primitives (stubs) ──────────────────────────────────

// ── Test authorship / integrity (STORY-015.3) ─────────────────────────────────

export type TestAuthorRole = 'developer' | 'debugger' | 'supervisor' | 'human' | 'unknown';

export interface TestAuthorshipRecord {
  story_id: string;
  test_files: string[];
  authored_by: TestAuthorRole;
  /** True when the implementer (developer/debugger) is the sole test author. */
  implementer_only: boolean;
  /** If implementer_only, a human or supervisor must confirm before CHECKPOINT. */
  requires_human_confirmation: boolean;
  recorded_at: string;
}

export interface TestIntegrityRecord {
  story_id: string;
  authorship: TestAuthorshipRecord;
  confirmed_by: 'human' | 'supervisor_second_pass';
  confirmed_at: string;
  trace_event_id: string;
}

export function flagTestAuthorship(
  storyId: string,
  testFiles: string[],
  implementerRole: TestAuthorRole
): TestAuthorshipRecord {
  const implementer_only = implementerRole === 'developer' || implementerRole === 'debugger';
  return {
    story_id: storyId,
    test_files: testFiles,
    authored_by: implementerRole,
    implementer_only,
    requires_human_confirmation: implementer_only,
    recorded_at: new Date().toISOString(),
  };
}

export function recordTestIntegrity(
  authorship: TestAuthorshipRecord,
  confirmedBy: 'human' | 'supervisor_second_pass',
  traceLogPath: string
): TestIntegrityRecord {
  if (!authorship.requires_human_confirmation) {
    throw new Error('test integrity confirmation requires human or supervisor_second_pass');
  }
  const existing = readJsonl(traceLogPath);
  const last = existing[existing.length - 1];
  const traceEvent = createTraceEvent({
    run_id: authorship.story_id,
    seq: last ? last.seq + 1 : 0,
    previous_event_hash: last ? (last.hash ?? null) : null,
    type: 'test_integrity',
    payload: { story_id: authorship.story_id, confirmed_by: confirmedBy, authored_by: authorship.authored_by },
  });
  appendJsonl(traceLogPath, traceEvent);
  return {
    story_id: authorship.story_id,
    authorship,
    confirmed_by: confirmedBy,
    confirmed_at: new Date().toISOString(),
    trace_event_id: traceEvent.event_id,
  };
}

export interface CheckpointRecord {
  story_id: string;
  branch: string;
  commit_sha: string;
  checkpointed_at: string;
  test_integrity?: TestIntegrityRecord;   // present when tests required confirmation
}

export async function writeCheckpoint(story: StoryRecord): Promise<CheckpointRecord> {
  const { execSync } = await import('child_process');
  const branch = `checkpoint/${story.story_id}`;
  try {
    execSync(`git add -A && git commit -m "checkpoint: ${story.story_id}" --allow-empty`, { stdio: 'pipe' });
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    return { story_id: story.story_id, branch, commit_sha: sha, checkpointed_at: new Date().toISOString() };
  } catch {
    return { story_id: story.story_id, branch, commit_sha: 'stub-no-git', checkpointed_at: new Date().toISOString() };
  }
}

export async function rollbackWorkspace(_story: StoryRecord): Promise<void> {
  throw new Error('not implemented: git checkout to pre-story branch, clean workspace');
}

// ── Project-level run state (per-target-project resume) ──────────────────────

export interface ProjectStoryEntry {
  story_id: string;
  status: StoryStatus;
  attempts: number;
  attempt_budget: number;
  checkpoint_sha: string | null;
  last_action: string | null;
  last_result: string | null;
  blocked_reason: string | null;
}

export interface ProjectRunState {
  schema_version: number;
  project_id: string;
  run_id: string;
  created_at: string;
  updated_at: string;
  current_story: string | null;
  last_decision: string | null;
  iterations_used: number;
  run_iteration_budget: number;
  stories: ProjectStoryEntry[];
}

export function loadOrInitProjectRunState(
  filePath: string,
  projectId: string,
  storyIds: string[],
  runIterationBudget: number
): ProjectRunState {
  const { readFileSync, existsSync } = require('fs') as typeof import('fs');
  if (existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as ProjectRunState;
    if (parsed.schema_version !== 1) {
      throw new Error(`ProjectRunState schema_version must be 1, got ${parsed.schema_version}`);
    }
    return parsed;
  }
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    project_id: projectId,
    run_id: now,
    created_at: now,
    updated_at: now,
    current_story: null,
    last_decision: null,
    iterations_used: 0,
    run_iteration_budget: runIterationBudget,
    stories: storyIds.map(id => ({
      story_id: id,
      status: 'todo',
      attempts: 0,
      attempt_budget: 3,
      checkpoint_sha: null,
      last_action: null,
      last_result: null,
      blocked_reason: null,
    })),
  };
}

export async function persistProjectRunState(
  filePath: string,
  state: ProjectRunState
): Promise<void> {
  const { writeFileSync, renameSync } = await import('fs');
  state.updated_at = new Date().toISOString();
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmp, filePath);
}

// ── Human review domain (STORY-012.2) ────────────────────────────────────────

import crypto from 'node:crypto';
import { createTraceEvent, appendJsonl, readJsonl } from '@codeharness/event-log';

export type ReviewOutcome = 'approved' | 'denied';

export interface ReviewDecision {
  decision_id: string;
  run_id: string;
  project_id: string;
  outcome: ReviewOutcome;
  reason: string;
  decided_at: string;
  validation_evidence: { story_id: string; checkpoint_sha: string }[];
  trace_event_id: string;
}

export interface ReviewContext {
  runId: string;
  projectId: string;
  runState: ProjectRunState;
  traceLogPath: string;
}

export interface ReviewSummary {
  project_id: string;
  run_id: string;
  total_stories: number;
  done_count: number;
  all_checkpointed: boolean;
  validation_evidence: { story_id: string; checkpoint_sha: string | null }[];
  promotable: boolean;
}

export function buildReviewSummary(runState: ProjectRunState): ReviewSummary {
  const stories = runState.stories;
  const done_count = stories.filter(s => s.status === 'done').length;
  const all_checkpointed = stories.every(s => s.checkpoint_sha !== null);
  return {
    project_id: runState.project_id,
    run_id: runState.run_id,
    total_stories: stories.length,
    done_count,
    all_checkpointed,
    validation_evidence: stories.map(s => ({ story_id: s.story_id, checkpoint_sha: s.checkpoint_sha })),
    promotable: done_count === stories.length && all_checkpointed,
  };
}

export function recordReviewDecision(
  ctx: ReviewContext,
  outcome: ReviewOutcome,
  reason: string
): ReviewDecision {
  if (outcome === 'denied' && !reason) {
    throw new Error('deny requires a reason');
  }
  const resolvedReason = reason || 'operator approved';
  const existing = readJsonl(ctx.traceLogPath);
  const last = existing[existing.length - 1];
  const traceEvent = createTraceEvent({
    run_id: ctx.runId,
    seq: last ? last.seq + 1 : 0,
    previous_event_hash: last ? (last.hash ?? null) : null,
    type: 'human_review',
    payload: { outcome, reason: resolvedReason, run_id: ctx.runId, project_id: ctx.projectId },
  });
  appendJsonl(ctx.traceLogPath, traceEvent);
  const validation_evidence = ctx.runState.stories
    .filter(s => s.checkpoint_sha !== null)
    .map(s => ({ story_id: s.story_id, checkpoint_sha: s.checkpoint_sha as string }));
  return {
    decision_id: crypto.randomUUID(),
    run_id: ctx.runId,
    project_id: ctx.projectId,
    outcome,
    reason: resolvedReason,
    decided_at: new Date().toISOString(),
    validation_evidence,
    trace_event_id: traceEvent.event_id,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Minimal glob matcher (supports ** and * wildcards). */
function matchesGlob(path: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern.replace(/\*\*/g,'___DSTAR___').replace(/\*/g,'[^/]*').replace(/___DSTAR___/g,'.*') + '$');
  return re.test(path);
}

// ── Orchestrator v0 public API (STORY-001) ────────────────────────────────────
// Re-exported so consumers can import from @codeharness/harness-core without
// reaching into internal source paths.

export {
  selectNextRuntimeStory,
  hasBlockedOrEscalatedDependency,
  decideNextAction,
  advanceTrackerState,
  buildResumeSummary,
} from './orchestrator-v0.ts';

export type {
  TrackerState,
  RuntimeStory,
  RuntimeDecision,
  ActionResult,
  OrchestratorV0State,
  OrchestratorV0Action,
  RuntimeStoryStatus,
} from './orchestrator-v0.ts';

// ── STORY-019.3: Push-notifications for escalations and approvals ─────────────

export interface NotificationChannel {
  type: 'webhook' | 'email';
  url?: string;
  address?: string;
  enabled: boolean;
  retry?: { max_attempts: number; backoff_ms: number };
}

export interface NotificationConfig {
  version: number;
  channels: { primary: NotificationChannel; email?: NotificationChannel };
  events: string[];
}

export interface NotificationPayload {
  event_type: string;
  story_id?: string;
  run_id?: string;
  message: string;
  trace_event_id?: string;
}

export type NotificationHttpClient = (
  url: string,
  payload: NotificationPayload
) => Promise<{ ok: boolean; status: number }>;

export interface NotificationResult {
  ok: boolean;
  channel: string;
  error?: string;
}

const defaultHttpClient: NotificationHttpClient = async (url, payload) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status };
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export async function sendNotification(
  payload: NotificationPayload,
  config: NotificationConfig,
  httpClient?: NotificationHttpClient
): Promise<NotificationResult> {
  if (!config.events.includes(payload.event_type)) {
    return { ok: false, channel: 'none', error: 'event type not in configured events' };
  }

  const primary = config.channels.primary;

  if (!primary.enabled) {
    return { ok: false, channel: 'none', error: 'no enabled channel' };
  }

  if (primary.type === 'email') {
    return { ok: false, channel: 'email', error: 'email not implemented' };
  }

  if (primary.type === 'webhook') {
    if (!primary.url) {
      return { ok: false, channel: 'webhook', error: 'webhook url not configured' };
    }
    const http = httpClient ?? defaultHttpClient;
    const maxAttempts = primary.retry?.max_attempts ?? 1;
    const backoffMs = primary.retry?.backoff_ms ?? 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await http(primary.url, payload);
        if (result.ok) return { ok: true, channel: 'webhook' };
        if (attempt < maxAttempts) await sleep(backoffMs);
      } catch (e: unknown) {
        if (attempt < maxAttempts) {
          await sleep(backoffMs);
          continue;
        }
        return { ok: false, channel: 'webhook', error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ok: false, channel: 'webhook', error: 'all retry attempts failed' };
  }

  return { ok: false, channel: 'none', error: 'unknown channel type' };
}
