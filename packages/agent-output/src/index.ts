/**
 * @codeharness/agent-output
 *
 * The DISCRIMINATED UNIONS of what Developer/Debugger may return — so an agent that is
 * blocked/uncertain emits a structured escalation instead of guessing (no self-widening
 * scope, no deleting tests, no hallucinating context). Schema: specs/escalation.schema.json.
 */
export type EscalationType =
  | 'needs_clarification' | 'needs_scope_expansion' | 'blocked_by_missing_context'
  | 'blocked_by_policy' | 'repeated_failure';

export interface Escalation {
  type: EscalationType; reason: string; requested_decision: string;
  evidence_refs?: string[]; options?: { option_id: string; tradeoff: string }[];
  raised_by?: 'developer' | 'debugger'; story_id?: string;
}

export type DeveloperOutput =
  | ({ kind: 'patch_proposal' } & Record<string, unknown>)
  | ({ kind: 'clarification_request' } & Escalation)
  | ({ kind: 'scope_expansion_request' } & Escalation)
  | ({ kind: 'blocked_report' } & Escalation);

export type DebuggerOutput =
  | ({ kind: 'repair_proposal' } & Record<string, unknown>)
  | ({ kind: 'no_repro_report' } & Record<string, unknown>)
  | ({ kind: 'scope_expansion_request' } & Escalation)
  | ({ kind: 'rollback_recommendation' } & Record<string, unknown>);

export const DEVELOPER_OUTPUT_KINDS = ['patch_proposal', 'clarification_request', 'scope_expansion_request', 'blocked_report'] as const;
export const DEBUGGER_OUTPUT_KINDS = ['repair_proposal', 'no_repro_report', 'scope_expansion_request', 'rollback_recommendation'] as const;

export interface ValidationResult { ok: boolean; errors: string[] }

export function buildEscalation(e: Escalation): Escalation {
  if (!e.reason?.trim()) throw new Error('escalation.reason required');
  if (!e.requested_decision?.trim()) throw new Error('escalation.requested_decision required');
  return { evidence_refs: [], options: [], ...e };
}

export function validateEscalation(e: Partial<Escalation>): ValidationResult {
  const errors: string[] = [];
  const types: EscalationType[] = ['needs_clarification', 'needs_scope_expansion', 'blocked_by_missing_context', 'blocked_by_policy', 'repeated_failure'];
  if (!e.type || !types.includes(e.type)) errors.push(`bad escalation type: ${e.type}`);
  if (!(e.reason || '').trim()) errors.push('missing reason');
  if (!(e.requested_decision || '').trim()) errors.push('missing requested_decision');
  for (const o of e.options ?? [])
    if (!o.option_id || !o.tradeoff) errors.push('each option needs option_id + tradeoff');
  return { ok: errors.length === 0, errors };
}

/** A Developer response must be one of the allowed kinds; escalation kinds must validate. */
/** Shallow proposal gate at agent-output level. The DEEP gate (write-set, acceptance,
 *  rollback) lives in validator-suite.specConformanceGate; this just blocks an agent from
 *  emitting a bare `{ kind: 'patch_proposal' }` with no payload. */
function shallowProposalErrors(o: Record<string, unknown>): string[] {
  const e: string[] = [];
  if (!o.proposal_id) e.push('proposal missing proposal_id');
  if (!o.story_id) e.push('proposal missing story_id');
  if (!Array.isArray(o.changed_files) || (o.changed_files as unknown[]).length === 0)
    e.push('proposal needs non-empty changed_files');
  return e;
}

export function validateDeveloperResponse(o: { kind?: string } & Record<string, unknown>): ValidationResult {
  if (!o.kind || !(DEVELOPER_OUTPUT_KINDS as readonly string[]).includes(o.kind))
    return { ok: false, errors: [`developer output kind must be one of ${DEVELOPER_OUTPUT_KINDS.join('|')}`] };
  if (o.kind === 'patch_proposal') { const e = shallowProposalErrors(o); return { ok: e.length === 0, errors: e }; }
  return validateEscalation(o as Partial<Escalation>);
}

export function validateDebuggerResponse(o: { kind?: string } & Record<string, unknown>): ValidationResult {
  if (!o.kind || !(DEBUGGER_OUTPUT_KINDS as readonly string[]).includes(o.kind))
    return { ok: false, errors: [`debugger output kind must be one of ${DEBUGGER_OUTPUT_KINDS.join('|')}`] };
  if (o.kind === 'repair_proposal') { const e = shallowProposalErrors(o); return { ok: e.length === 0, errors: e }; }
  if (o.kind === 'scope_expansion_request') return validateEscalation(o as Partial<Escalation>);
  if (o.kind === 'no_repro_report') {
    const e: string[] = [];
    if (!((o.reason as string) || '').trim()) e.push('no_repro_report needs reason');
    if (!Array.isArray(o.evidence_refs) || (o.evidence_refs as unknown[]).length === 0) e.push('no_repro_report needs evidence_refs');
    return { ok: e.length === 0, errors: e };
  }
  if (o.kind === 'rollback_recommendation') {
    const e: string[] = [];
    if (!((o.reason as string) || '').trim()) e.push('rollback_recommendation needs reason');
    return { ok: e.length === 0, errors: e };
  }
  return { ok: true, errors: [] };
}
