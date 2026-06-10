/**
 * @codeharness/supervisor-runtime
 *
 * Deterministic helpers for the Supervisor (brain, not hands). The ROUTING is
 * deterministic (the v0 decision table); an LLM is used only to compose packet prose
 * and judgement, never to decide routing or to execute anything.
 * Spec: codeharness/docs/agents/02_SUPERVISOR_AGENT.md
 */
export type SupervisorAction =
  | 'replan' | 'call_developer' | 'validate' | 'call_debugger' | 'checkpoint'
  | 'abort_attempt' | 'ask_human' | 'rollback' | 'wait';

export interface SupervisorState {
  storyReady: boolean;
  developerResult?: { patchProposal: boolean } | null;
  validationReport?: { status: 'passed' | 'failed'; failureType?: string } | null;
  permissionDenied?: { needsScopeExpansion?: boolean } | null;
  debuggerResult?: { withinScope: boolean; needsScopeExpansion?: boolean } | null;
  humanIssue?: { severity: 'low'|'medium'|'high'|'critical'; klass?: string } | null;
  sameSignatureCount: number;
  attempts: { developer: number; debugger: number };
  budget: { developer: number; debugger: number; sameSignature: number };
}
export interface SupervisorDecision { type: SupervisorAction; reason: string }

/** The v0 decision table (corrected). Ordered; first match wins. Pure function. */
export function decideNextAction(s: SupervisorState): SupervisorDecision {
  if (!s.storyReady) return { type: 'replan', reason: 'story not development-ready' };
  if (s.humanIssue) {
    if (s.humanIssue.severity === 'critical' || s.humanIssue.klass === 'security')
      return { type: 'ask_human', reason: 'security/critical human issue: freeze + gate' };
    return { type: 'call_debugger', reason: 'human issue: investigation only (not yet a bug)' };
  }
  if (s.permissionDenied)
    return s.permissionDenied.needsScopeExpansion
      ? { type: 'ask_human', reason: 'pre-apply denial needs scope expansion' }
      : { type: 'abort_attempt', reason: 'permission denied before apply; discard workspace changes' };
  if (s.validationReport?.status === 'passed') return { type: 'checkpoint', reason: 'validation passed' };
  if (s.validationReport?.status === 'failed') {
    if (s.sameSignatureCount >= s.budget.sameSignature) return { type: 'ask_human', reason: 'repeated failure signature' };
    if (s.attempts.debugger >= s.budget.debugger || s.attempts.developer >= s.budget.developer)
      return { type: 'ask_human', reason: 'attempt budget exhausted' };
    return { type: 'call_debugger', reason: 'validation failed: route to debugger' };
  }
  if (s.debuggerResult) {
    if (s.debuggerResult.needsScopeExpansion) return { type: 'ask_human', reason: 'repair scope exceeds story' };
    if (s.debuggerResult.withinScope) return { type: 'validate', reason: 'validate repair' };
  }
  if (s.developerResult?.patchProposal && !s.validationReport) return { type: 'validate', reason: 'developer result: validate it' };
  if (s.storyReady && !s.developerResult) return { type: 'call_developer', reason: 'story ready: dispatch developer' };
  return { type: 'wait', reason: 'awaiting next artifact' };
}

export interface StoryContractView { objective?: string; allowed_write_set?: string[];
  acceptance_criteria?: string[]; validation_commands?: string[]; rollback_notes?: string; }
/** Returns the missing required fields ([] = ready). Mirrors validator-suite. */
export function validateStoryReady(c: StoryContractView): string[] {
  return ['objective','allowed_write_set','acceptance_criteria','validation_commands','rollback_notes']
    .filter(k => { const v = (c as Record<string, unknown>)[k]; return v === undefined || v === null || (Array.isArray(v) && v.length === 0) || v === ''; });
}

/** Deterministically render a Developer Task Packet from the contract (LLM may enrich prose). */
export function composeDeveloperTaskPacket(_contract: Record<string, unknown>, _contextRefs: string[]): Record<string, unknown> {
  throw new Error('not implemented: composeDeveloperTaskPacket (render task_packet.schema.json from the contract)');
}
export function composeDebuggerTaskPacket(_contract: Record<string, unknown>, _failureContext: Record<string, unknown>, _investigationOnly: boolean): Record<string, unknown> {
  throw new Error('not implemented: composeDebuggerTaskPacket');
}
/** Read-only progress summary from tracker state (Supervisor never writes the tracker). */
export function summarizeProgress(_trackerState: Record<string, unknown>): Record<string, unknown> {
  throw new Error('not implemented: summarizeProgress');
}
