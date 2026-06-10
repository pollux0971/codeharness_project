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
