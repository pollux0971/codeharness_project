/**
 * @codeharness/debugger-runtime
 *
 * Deterministic helpers for failure triage + the failure-gene contract. Classification
 * and signature-building are deterministic; root-cause/repair generation is a later phase.
 * Spec: codeharness/docs/agents/04_DEBUGGER_AGENT.md, codeharness/docs/contracts/FAILURE_GENE.md
 */
export type FailureType = 'test' | 'typecheck' | 'lint' | 'runtime' | 'schema' | 'integration';

/** Classify a failure from the failed command + log text. */
export function classifyFailure(failedCommand: string, log: string): FailureType {
  const t = `${failedCommand}\n${log}`.toLowerCase();
  if (/tsc|type error|ts\d{3,}/.test(t)) return 'typecheck';
  if (/eslint|lint/.test(t)) return 'lint';
  if (/schema|invalid json|does not match/.test(t)) return 'schema';
  if (/integration|e2e/.test(t)) return 'integration';
  if (/test|expect|assert|jest|vitest|pytest/.test(t)) return 'test';
  return 'runtime';
}

/** Build a compact, pipe-delimited matching_signal (the dedup/retrieval key). */
export function buildFailureSignature(failureType: FailureType, log: string): string {
  const tokens = (log.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? [])
    .map(s => s.toLowerCase())
    .filter(s => !['error','failed','expected','received','test','the','and'].includes(s));
  const top = Array.from(new Set(tokens)).slice(0, 6);
  return [failureType, ...top].join('|');
}

export type RepairRoute = 'debugger' | 'developer' | 'human';
/** Where a still-failing attempt goes next (see DEBUG_LOOP §). */
export function decideRepairRoute(opts: {
  sameRootCause: boolean; sameSignatureCount: number; debuggerAttempts: number;
  budget: { debugger: number; sameSignature: number };
}): RepairRoute {
  if (opts.sameSignatureCount >= opts.budget.sameSignature || opts.debuggerAttempts >= opts.budget.debugger) return 'human';
  return opts.sameRootCause ? 'debugger' : 'developer';
}

export interface FailureGene {
  id: string; matching_signal: string; summary: string; strategy: string;
  avoid: string; failure_type: FailureType; repair_operator?: string;
  story_id?: string; severity: 'low'|'medium'|'high'; version: number;
  created_at: string; consolidated_count: number; status: 'active'|'resolved'|'quarantined';
}
/** Build a failure gene. `avoid` MUST be ≤40 words (the only injected field). */
export function emitFailureGene(args: {
  matching_signal: string; summary: string; strategy: string; avoid: string;
  failure_type: FailureType; repair_operator?: string; story_id?: string;
  severity?: 'low'|'medium'|'high';
}): FailureGene {
  const words = args.avoid.trim().split(/\s+/);
  if (words.length > 40) throw new Error('failure_gene.avoid must be <= 40 words');
  return {
    id: `fg_${Date.now()}`, matching_signal: args.matching_signal, summary: args.summary,
    strategy: args.strategy, avoid: args.avoid, failure_type: args.failure_type,
    repair_operator: args.repair_operator, story_id: args.story_id,
    severity: args.severity ?? 'medium', version: 1,
    created_at: new Date().toISOString(), consolidated_count: 1, status: 'active'
  };
}

// ── STORY-008.4: Debug Loop Wiring ──────────────────────────────────────────
// Wire VALIDATION(fail) → DEBUG_LOOP → VALIDATION.
// All I/O is injected for determinism and testability; no real LLM, no external API.

/** Bank gene shape structurally compatible with @codeharness/failure-bank FailureGene. */
export interface BankGene {
  id: string; matching_signal: string; summary: string; strategy: string;
  avoid: string; failure_type: string; repair_operator: string;
  story_id: string; skill_id: string | null; severity: string;
  version: number; created_at: string; consolidated_count: number;
  resolved_at: string | null; status: string;
}

/** Injected failure-bank operations. Production caller wires @codeharness/failure-bank. */
export interface FailureBankOps {
  bankGene(gene: BankGene): void;
  injectRelevant(context: string, maxK?: number): BankGene[];
  isSystemic(gene: BankGene): boolean;
}

/** Context packet handed to the scripted repair provider. */
export interface DebugContext {
  storyId: string; signature: string; failureType: FailureType;
  failedCommand: string; failedOutput: string;
  relevantWarnings: BankGene[]; allowedWriteSet: string[];
}

/** Minimal shape of an accepted repair proposal output. */
export interface RepairProposalLike {
  kind: 'repair_proposal'; proposal_id: string; story_id: string;
  changed_files: string[]; rollback_notes: string;
  [key: string]: unknown;
}

export interface DebugLoopInput {
  storyId: string;
  /** A verdict that already has `passed: false`. */
  failingVerdict: { passed: false; results: Array<{ command: string; ok: boolean; output: string }> };
  allowedWriteSet: string[];
  maxAttempts: number;
  bankOps: FailureBankOps;
  /** Injected from @codeharness/agent-output validateDebuggerResponse in production. */
  validateDebuggerOutput(o: Record<string, unknown>): { ok: boolean; errors: string[] };
  /** Injected from @codeharness/validator-suite validateWriteSet in production. */
  validateWriteSet(files: string[], writeSet: string[]): { ok: boolean; errors: string[] };
  /** Scripted/fixture repair provider — MUST NOT call a real LLM or external API. */
  repairProvider(ctx: DebugContext): { kind: string; [key: string]: unknown } | null;
  /** Apply a repair proposal and re-run validation; returns whether it passed. */
  applyAndValidate(proposal: RepairProposalLike): { applied: boolean; passed: boolean; error?: string };
  /** Deterministic clock (injected in tests). Falls back to new Date().toISOString(). */
  clock?(): string;
  /** Deterministic ID generator (injected in tests). Falls back to a derived id. */
  idGen?(): string;
}

export type DebugLoopResult =
  | { kind: 'validated'; attempts: number; summary: string }
  | { kind: 'self_correct'; attempts: number; summary: string }
  | { kind: 'escalated'; attempts: number; reason: string };

/**
 * Deterministic debug loop: receives a failing validation verdict, emits and banks a
 * failure gene, asks the scripted repair provider for a proposal, validates write-set
 * and output schema, applies the repair, and re-validates. Exhausting `maxAttempts`
 * or detecting a systemic pattern escalates instead of silently retrying.
 */
export function runDebugLoop(input: DebugLoopInput): DebugLoopResult {
  const {
    storyId, failingVerdict, allowedWriteSet, maxAttempts,
    bankOps, validateDebuggerOutput, validateWriteSet: doValidateWriteSet,
    repairProvider, applyAndValidate, clock, idGen,
  } = input;

  // Step 1 — classify the failure and build a matching_signal
  const firstFailed = failingVerdict.results.find(r => !r.ok);
  const failedCmd = firstFailed?.command ?? '';
  const failedOutput = firstFailed?.output ?? '';
  const failureType = classifyFailure(failedCmd, failedOutput);
  const signature = buildFailureSignature(failureType, failedOutput);

  // Step 2 — construct a bank-compatible failure gene
  const now = clock?.() ?? new Date().toISOString();
  const safeId = storyId.replace(/[^a-z0-9]/gi, '_');
  const geneId = idGen?.() ?? `fg_${safeId}_${failureType}`;
  const avoidText = `Do not repeat ${failureType} failure in: ${failedCmd}`
    .split(/\s+/).slice(0, 10).join(' ');

  const gene: BankGene = {
    id: geneId, matching_signal: signature,
    summary: `${failureType}: ${failedOutput.slice(0, 100)}`,
    strategy: 'apply repair proposal and re-validate',
    avoid: avoidText, failure_type: failureType, repair_operator: 'none',
    story_id: storyId, skill_id: null, severity: 'recoverable', version: 1,
    created_at: now, consolidated_count: 1, resolved_at: null, status: 'active',
  };

  // Step 3 — bank the gene (may be merged with existing entry)
  bankOps.bankGene(gene);

  // Step 4 — systemic pattern check: if the banked signal is recurring, escalate immediately
  if (bankOps.isSystemic(gene)) {
    return { kind: 'escalated', attempts: 0, reason: `systemic failure pattern: ${signature}` };
  }

  // Step 5 — build debug context with relevant prior warnings
  const relevant = bankOps.injectRelevant(`${storyId} ${failedCmd} ${failedOutput}`);
  const ctx: DebugContext = {
    storyId, signature, failureType, failedCommand: failedCmd, failedOutput,
    relevantWarnings: relevant, allowedWriteSet,
  };

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    // Step 6 — ask the scripted repair provider
    const rawOutput = repairProvider(ctx);
    if (!rawOutput) {
      if (attempts >= maxAttempts) return { kind: 'escalated', attempts, reason: 'no repair proposal from provider' };
      return { kind: 'self_correct', attempts, summary: 'no proposal; retry requested' };
    }

    // Step 7 — validate debugger output schema (agent-output gate)
    const outputVal = validateDebuggerOutput(rawOutput as Record<string, unknown>);
    if (!outputVal.ok) {
      if (attempts >= maxAttempts) return { kind: 'escalated', attempts, reason: `invalid debugger output: ${outputVal.errors.join(', ')}` };
      return { kind: 'self_correct', attempts, summary: `invalid output, retry: ${outputVal.errors.join(', ')}` };
    }

    // Step 8 — only repair_proposal kind is actionable
    if (rawOutput.kind !== 'repair_proposal') {
      return { kind: 'escalated', attempts, reason: `debugger output kind=${rawOutput.kind} is not repair_proposal` };
    }

    const proposal = rawOutput as RepairProposalLike;

    // Step 9 — write-set gate: proposal must stay inside allowedWriteSet
    const wsVal = doValidateWriteSet(proposal.changed_files, allowedWriteSet);
    if (!wsVal.ok) {
      return { kind: 'escalated', attempts, reason: `repair out of write-set: ${wsVal.errors.join(', ')}` };
    }

    // Step 10 — apply repair and re-validate
    const applyResult = applyAndValidate(proposal);
    if (applyResult.passed) {
      return { kind: 'validated', attempts, summary: `repair validated after ${attempts} attempt(s)` };
    }

    // Still failing — bank the retry failure before next attempt
    if (attempts < maxAttempts) {
      bankOps.bankGene({
        ...gene, id: `${geneId}_r${attempts}`, consolidated_count: 1,
        created_at: clock?.() ?? new Date().toISOString(),
      });
    }
  }

  return { kind: 'escalated', attempts, reason: `attempt budget exhausted after ${maxAttempts} attempt(s)` };
}
