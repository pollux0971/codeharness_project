/**
 * @codeharness/preflight-runner
 *
 * Developer's ADVISORY self-check before submitting a proposal: apply in a disposable
 * workspace → typecheck → affected tests → self-correct (bounded) → submit. The
 * Validator alone gives the real verdict; preflight only reduces low-level errors and
 * bounds self-correction (repeated signature ⇒ escalate, never loop). Schema:
 * specs/preflight_report.schema.json.
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

/**
 * Advisory self-check: validate that requested commands are allowed, simulate their
 * outcomes from proposal.validation_results (no real shell), and decide the next action.
 *
 * Proposal fields (all optional):
 *   story_id                — propagated into the report
 *   commands                — commands to check; defaults to first two policy.allowedCommands
 *   validation_results      — map of cmd→boolean; undefined entry ⇒ optimistic pass
 *   self_correction_attempts — how many attempts have been made so far (default 0)
 *   same_signature_count    — repeated-signature counter (default 0)
 *
 * Returns a PreflightReport. advisory:true signals this is NEVER the story verdict.
 */
export async function runPreflight(
  proposal: Record<string, unknown>,
  _workspace: unknown,
  policy: PreflightPolicy = DEFAULT_PREFLIGHT_POLICY,
): Promise<PreflightReport> {
  const storyId = typeof proposal.story_id === 'string' ? proposal.story_id : undefined;
  const selfCorrectionAttempts = typeof proposal.self_correction_attempts === 'number'
    ? proposal.self_correction_attempts : 0;
  const sameSignatureCount = typeof proposal.same_signature_count === 'number'
    ? proposal.same_signature_count : 0;

  // Default to typecheck + affected-tests when caller supplies no command list.
  const requestedCommands: string[] = Array.isArray(proposal.commands)
    ? (proposal.commands as string[])
    : [policy.allowedCommands[0], policy.allowedCommands[1]].filter(Boolean);

  // Blocked commands ⇒ immediate escalate; forbidden commands must not run.
  const blockedCommands = requestedCommands.filter(cmd => !isCommandAllowed(cmd, policy));
  if (blockedCommands.length > 0) {
    const sig = `blocked:${blockedCommands.join(',')}`;
    return {
      advisory: true,
      passed: false,
      commands_run: [],
      failures: blockedCommands.map(c => `blocked: ${c}`),
      self_correction_attempts: selfCorrectionAttempts,
      last_failure_signature: sig,
      verdict: 'escalate',
      ...(storyId !== undefined ? { story_id: storyId } : {}),
    };
  }

  // Advisory "run": consult proposal.validation_results to determine pass/fail per command.
  // If not provided, commands are assumed to pass (optimistic — real results come from the workspace).
  const validationResults: Record<string, boolean> =
    typeof proposal.validation_results === 'object' && proposal.validation_results !== null
      ? (proposal.validation_results as Record<string, boolean>)
      : {};

  const commandsRun: string[] = [];
  const failures: string[] = [];
  for (const cmd of requestedCommands) {
    commandsRun.push(cmd);
    if (validationResults[cmd] === false) failures.push(cmd);
  }

  const passed = failures.length === 0;
  const currentSig = failures.length > 0 ? failures.join(';') : undefined;

  const verdict = decidePreflightNext({
    passed,
    attempts: selfCorrectionAttempts,
    sameSignatureCount,
    policy,
  });

  return {
    advisory: true,
    passed,
    commands_run: commandsRun,
    failures,
    self_correction_attempts: selfCorrectionAttempts,
    verdict,
    ...(currentSig !== undefined ? { last_failure_signature: currentSig } : {}),
    ...(storyId !== undefined ? { story_id: storyId } : {}),
  };
}
