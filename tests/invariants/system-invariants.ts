/**
 * System invariants — the 8 properties from docs/validation/01_RUNTIME_INVARIANTS.md
 * encoded ONCE as reusable assertions. Every L3 coordination test and L4 scenario
 * test calls assertAllInvariants(trace) at the end of its run. A violated invariant
 * fails the test regardless of the scenario verdict ("a violated invariant halts the run").
 *
 * These operate over an InvariantTrace that a coordination run accumulates as it drives
 * the orchestrator. The trace is the single source of truth the assertions read — keep
 * the harness writing to it rather than re-deriving facts in each test.
 */
import { canTransition, type HarnessState } from '@codeharness/harness-core';

/** Everything a coordination run records so invariants can be checked after the fact. */
export interface InvariantTrace {
  /** Ordered list of states the orchestrator passed through. */
  states: HarnessState[];
  /** Every apply event the tool-executor performed. */
  applies: Array<{ changedFiles: string[]; precededByAllow: boolean; workspaceConfirmed: boolean }>;
  /** Every permission decision the gateway emitted. */
  permissionEvents: Array<{ action: string; decision: 'allow' | 'deny' | 'ask' }>;
  /** The contract's write-set for the story under test. */
  allowedWriteSet: string[];
  /** Whether a PASS validation_report exists for the story. */
  hasPassingValidation: boolean;
  /** Whether the run reached a checkpoint. */
  reachedCheckpoint: boolean;
  /** Actor for every completion/write-set/permission-change event. */
  privilegedEvents: Array<{ kind: 'write_set_change' | 'completion' | 'permission_change'; actor: 'human' | 'harness' | 'agent' }>;
  /** Append-only event log: monotonic seq + hash chain. */
  eventLog: Array<{ seq: number; previous_event_hash: string | null; hash: string }>;
  /** Any text that entered context/logs/trace — scanned for secret patterns. */
  contextDump: string;
  /** Counters the harness maintained for this run. */
  budgets: { attempts: number; attemptBudget: number };
  /** One failure gene per DEBUG_LOOP turn (invariant for the develop↔debug loop). */
  debugTurns: number;
  failureGenesEmitted: number;
  /** Did promotion happen, and was it human-approved? */
  promotionOccurred: boolean;
  promotionHumanApproved: boolean;
}

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,                       // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,     // PEM private key
  /sk-[A-Za-z0-9]{20,}/,                     // generic provider secret key
  /(?:password|passwd|secret|token)\s*[:=]\s*\S+/i,
];

/** True if `file` is matched by any glob in the write-set (minimatch-lite: ** and *). */
function inWriteSet(file: string, writeSet: string[]): boolean {
  return writeSet.some((glob) => {
    const rx = new RegExp(
      '^' +
        glob
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '\u0000')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0000/g, '.*') +
        '$',
    );
    return rx.test(file);
  });
}

// --- the 8 invariants, each a single assertion ----------------------------------

/** I3 (workflow #4) Permission-before-apply: no apply without a preceding allow. */
export function assertPermissionBeforeApply(t: InvariantTrace): void {
  for (const a of t.applies) {
    if (!a.precededByAllow) throw new Error(`INVARIANT I3 violated: apply of ${JSON.stringify(a.changedFiles)} had no preceding permission allow`);
  }
}

/** Propose-not-apply + write-set: every applied file is inside the write-set. */
export function assertWritesInWriteSet(t: InvariantTrace): void {
  for (const a of t.applies) {
    for (const f of a.changedFiles) {
      if (!inWriteSet(f, t.allowedWriteSet)) throw new Error(`INVARIANT (write-set) violated: applied ${f} outside ${JSON.stringify(t.allowedWriteSet)}`);
    }
  }
}

/** I2 Workspace-first: applied diffs target a registry-confirmed workspace. */
export function assertWorkspaceFirst(t: InvariantTrace): void {
  for (const a of t.applies) {
    if (!a.workspaceConfirmed) throw new Error('INVARIANT I2 violated: apply targeted a non-registry-confirmed workspace');
  }
}

/** I4 Validation-before-completion: checkpoint ⇒ a passing validation exists. */
export function assertValidationBeforeCompletion(t: InvariantTrace): void {
  if (t.reachedCheckpoint && !t.hasPassingValidation) throw new Error('INVARIANT I4 violated: checkpoint reached without a passing validation report');
}

/** I5 No self-grant / no self-complete: privileged events come from human/harness, never an agent. */
export function assertNoSelfGrant(t: InvariantTrace): void {
  for (const e of t.privilegedEvents) {
    if (e.actor === 'agent') throw new Error(`INVARIANT I5 violated: ${e.kind} originated from an agent`);
  }
}

/** I6 Raw-trace-preserved: event log is append-only — monotonic seq + intact hash chain. */
export function assertAppendOnlyLog(t: InvariantTrace): void {
  for (let i = 0; i < t.eventLog.length; i++) {
    const e = t.eventLog[i];
    if (i > 0) {
      if (e.seq <= t.eventLog[i - 1].seq) throw new Error(`INVARIANT I6 violated: non-monotonic seq at index ${i}`);
      if (e.previous_event_hash !== t.eventLog[i - 1].hash) throw new Error(`INVARIANT I6 violated: hash chain broken at index ${i}`);
    }
  }
}

/** I7 Secret-hygiene: no secret value appears in context/logs/trace. */
export function assertSecretHygiene(t: InvariantTrace): void {
  for (const rx of SECRET_PATTERNS) {
    if (rx.test(t.contextDump)) throw new Error(`INVARIANT I7 violated: secret-like value matched ${rx} in context/log/trace`);
  }
}

/** I8 Budget-bounded: attempts never exceed the budget. */
export function assertBudgetBounded(t: InvariantTrace): void {
  if (t.budgets.attempts > t.budgets.attemptBudget) throw new Error(`INVARIANT I8 violated: attempts ${t.budgets.attempts} exceeded budget ${t.budgets.attemptBudget}`);
}

/** Failure-gene-per-turn: every DEBUG_LOOP turn emits exactly one failure gene. */
export function assertFailureGenePerDebugTurn(t: InvariantTrace): void {
  if (t.failureGenesEmitted !== t.debugTurns) throw new Error(`INVARIANT (failure-gene) violated: ${t.debugTurns} debug turns but ${t.failureGenesEmitted} genes emitted`);
}

/** Every recorded state transition is legal per the harness-core table. */
export function assertLegalTransitions(t: InvariantTrace): void {
  for (let i = 1; i < t.states.length; i++) {
    const from = t.states[i - 1];
    const to = t.states[i];
    if (from === to) continue; // self-dwell is not a transition
    if (!canTransition(from, to)) throw new Error(`INVARIANT (state-machine) violated: illegal transition ${from} → ${to}`);
  }
}

/** Promotion only with human approval. */
export function assertPromotionHumanGated(t: InvariantTrace): void {
  if (t.promotionOccurred && !t.promotionHumanApproved) throw new Error('INVARIANT (promotion) violated: promotion without human approval');
}

/** Run every invariant. Call at the end of every coordination/scenario test. */
export function assertAllInvariants(t: InvariantTrace): void {
  assertPermissionBeforeApply(t);
  assertWritesInWriteSet(t);
  assertWorkspaceFirst(t);
  assertValidationBeforeCompletion(t);
  assertNoSelfGrant(t);
  assertAppendOnlyLog(t);
  assertSecretHygiene(t);
  assertBudgetBounded(t);
  assertFailureGenePerDebugTurn(t);
  assertLegalTransitions(t);
  assertPromotionHumanGated(t);
}
