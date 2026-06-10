/**
 * @codeharness/developer-runtime
 *
 * v0 is schema-level only (no LLM): define the Developer output contract and validate
 * a returned patch proposal. Actual code generation is wired in a later phase.
 * Spec: codeharness/docs/agents/03_DEVELOPER_AGENT.md
 */
export interface ValidationResult { ok: boolean; errors: string[] }

/** Every Developer turn must return exactly these artifacts. */
export const DEVELOPER_OUTPUT_CONTRACT = [
  'implementation_plan','patch_proposal','changed_files','test_plan','risk_notes','rollback_notes'
] as const;

export function validateDeveloperOutput(out: Record<string, unknown>): ValidationResult {
  const errors = DEVELOPER_OUTPUT_CONTRACT.filter(k => out[k] === undefined || out[k] === null)
    .map(k => `missing developer output: ${k}`);
  return { ok: errors.length === 0, errors };
}

/** changed_files must be ⊆ allowed_write_set (glob). Pre-apply check mirror. */
export function changedFilesWithinWriteSet(changedFiles: string[], allowedWriteSet: string[]): ValidationResult {
  const match = (p: string) => allowedWriteSet.some(g => new RegExp('^' +
    g.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'§').replace(/\*/g,'[^/]*').replace(/§/g,'.*') + '$').test(p));
  const errors = changedFiles.filter(f => !match(f)).map(f => `outside write-set: ${f}`);
  return { ok: errors.length === 0, errors };
}

/** Produce a patch proposal for a task packet. Later phase (needs the model + workspace). */
export function producePatchProposal(_taskPacket: Record<string, unknown>): Record<string, unknown> {
  throw new Error('not implemented: producePatchProposal (additive, minimal, reversible)');
}
