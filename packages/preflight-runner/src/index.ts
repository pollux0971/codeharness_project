/**
 * @codeharness/preflight-runner
 *
 * Developer's ADVISORY self-check before submitting a proposal: apply in a disposable
 * workspace → typecheck → affected tests → self-correct (bounded) → submit. The
 * Validator alone gives the real verdict; preflight only reduces low-level errors and
 * bounds self-correction (repeated signature ⇒ escalate, never loop). Schema:
 * specs/preflight_report.schema.json. Execution owner: ROADMAP:phase-2.
 */
export interface PreflightPolicy { maxSelfCorrectionAttempts: number; allowedCommands: string[]; forbidden: string[] }
export const DEFAULT_PREFLIGHT_POLICY: PreflightPolicy = {
  maxSelfCorrectionAttempts: 2,
  allowedCommands: ['pnpm typecheck', 'pnpm test --filter affected', 'pnpm test'],
  forbidden: ['full repo mutation outside write-set', 'deleting tests', 'changing policy to pass tests', 'marking failed preflight as passed'],
};
export interface PreflightReport {
  advisory: true; passed: boolean; commands_run: string[]; failures: string[];
  self_correction_attempts: number; last_failure_signature?: string;
  verdict: PreflightDecision; story_id?: string;
}
export type PreflightDecision = 'submit' | 'self_correct' | 'escalate';

/** Pure: decide the next preflight action. Bounds self-correction; repeated signature ⇒ escalate. */
export function decidePreflightNext(o: {
  passed: boolean; attempts: number; sameSignatureCount: number;
  policy?: PreflightPolicy; sameSignatureLimit?: number;
}): PreflightDecision {
  const max = (o.policy ?? DEFAULT_PREFLIGHT_POLICY).maxSelfCorrectionAttempts;
  const sigLimit = o.sameSignatureLimit ?? 2;
  if (o.passed) return 'submit';
  if (o.sameSignatureCount >= sigLimit) return 'escalate';
  if (o.attempts >= max) return 'escalate';
  return 'self_correct';
}

/** A preflight command is allowed only if it is on the allow-list (prefix) and not forbidden. */
export function isCommandAllowed(cmd: string, policy: PreflightPolicy = DEFAULT_PREFLIGHT_POLICY): boolean {
  const c = cmd.trim().toLowerCase();
  if (/rm\s+-rf|sudo|delete.*test|>\s*policy|chmod|curl|wget/.test(c)) return false;
  return policy.allowedCommands.some(a => c.startsWith(a.toLowerCase().split(' ')[0]) && c.startsWith(a.toLowerCase().slice(0, 8)));
}

/** Apply the proposal in a disposable workspace and run the allowed checks. Later phase
 *  (needs workspace-manager + a test runner). */
export async function runPreflight(_proposal: Record<string, unknown>, _workspace: unknown, _policy?: PreflightPolicy): Promise<PreflightReport> {
  throw new Error('not implemented: runPreflight (apply in workspace + typecheck + affected tests)');
}
