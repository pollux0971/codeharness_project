/**
 * @codeharness/reviewer-runtime
 * Reviewer agent runtime — read-only advisory leaf.
 *
 * INVARIANTS (enforced here, not by prompt politeness):
 *   1. Reviewer holds no write-set — `write_set` / `allowed_write_set` are stripped.
 *   2. Reviewer cannot change goal or acceptance_criteria — stripped if injected.
 *   3. Reviewer cannot dispatch agents — output is a diagnosis report only.
 *   4. Report is appended to trace; Supervisor reads and decides.
 *
 * Owner: STORY-022.2
 */
import { validateDiagnosisReport } from '@codeharness/validator-suite';
import type { DiagnosisReport } from '@codeharness/validator-suite';
import { appendNextEvent } from '@codeharness/event-log';
import type { FailureGene } from '@codeharness/failure-bank';

export type { DiagnosisReport } from '@codeharness/validator-suite';

// ── Input / Options / Result types ───────────────────────────────────────────

export interface ReviewerInput {
  story_id: string;
  failing_test_output: string;
  acceptance_criteria: string;
  diff_under_review: string;
  matching_genes: FailureGene[];
}

export interface ReviewStrategy {
  review(input: ReviewerInput): Promise<DiagnosisReport>;
}

export interface ReviewerOptions {
  strategy: ReviewStrategy;
  traceLogPath: string;
  /** Model name recorded in the trace event. Default: 'scripted-reviewer-v1' */
  reviewerModel?: string;
}

export interface ReviewerResult {
  report: DiagnosisReport;
  valid: boolean;
  validationErrors: string[];
}

// ── Forbidden field lists (enforced deterministically) ────────────────────────

/** Fields that grant or imply write authority — must never appear on a diagnosis report. */
const WRITE_SET_FIELDS = ['write_set', 'allowed_write_set'] as const;

/** Fields that would alter story scope — Reviewer may read but never override. */
const GOAL_FIELDS = ['acceptance_criteria', 'story_goal', 'objective'] as const;

// ── Core function ─────────────────────────────────────────────────────────────

/**
 * Run the Reviewer — read-only advisory leaf.
 *
 * Steps:
 *   1. Delegate to the injected ReviewStrategy (LLM or scripted fixture).
 *   2. Strip any write-set fields (invariant 1).
 *   3. Strip any goal/acceptance_criteria overrides (invariant 2).
 *   4. Validate the resulting report with validateDiagnosisReport.
 *   5. Append a `reviewer_diagnosis` event to the trace.
 *   6. Return { report, valid, validationErrors }.
 */
export async function runReviewer(
  input: ReviewerInput,
  opts: ReviewerOptions,
): Promise<ReviewerResult> {
  const rawReport = await opts.strategy.review(input);

  // Cast to a mutable record so we can enforce structural invariants.
  const report = { ...rawReport } as Record<string, unknown>;

  // Invariant 1: Reviewer holds no write-set.
  for (const field of WRITE_SET_FIELDS) {
    delete report[field];
  }

  // Invariant 2: Reviewer cannot change story goal or acceptance_criteria.
  for (const field of GOAL_FIELDS) {
    delete report[field];
  }

  const cleanReport = report as DiagnosisReport;

  // Validate schema conformance.
  const validation = validateDiagnosisReport(cleanReport);

  // Append to trace (append-only; harness decides what Supervisor reads).
  appendNextEvent(opts.traceLogPath, {
    run_id: input.story_id,
    type: 'reviewer_diagnosis',
    agent_role: 'reviewer',
    payload: {
      report: cleanReport,
      validationErrors: validation.errors,
    },
  });

  return {
    report: cleanReport,
    valid: validation.ok,
    validationErrors: validation.errors,
  };
}
