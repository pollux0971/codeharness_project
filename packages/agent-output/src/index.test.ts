import { describe, it, expect } from 'vitest';
import { buildEscalation, validateEscalation, validateDeveloperResponse, validateDebuggerResponse } from './index';

describe('agent-output', () => {
  it('build_escalation_requires_reason', () => expect(() => buildEscalation({ type: 'needs_clarification', reason: '', requested_decision: 'x' } as any)).toThrow());
  it('valid_escalation_passes', () => expect(validateEscalation({ type: 'needs_scope_expansion', reason: 'need more files', requested_decision: 'widen write-set?' }).ok).toBe(true));
  it('bad_escalation_type_fails', () => expect(validateEscalation({ type: 'whatever' as any, reason: 'r', requested_decision: 'd' }).ok).toBe(false));
  it('escalation_option_requires_tradeoff', () => expect(validateEscalation({ type: 'needs_clarification', reason: 'r', requested_decision: 'd', options: [{ option_id: 'a' } as any] }).ok).toBe(false));
  it('developer_patch_proposal_kind_ok', () => expect(validateDeveloperResponse({ kind: 'patch_proposal', proposal_id: 'p', story_id: 's', changed_files: ['a.ts'] }).ok).toBe(true));
  it('developer_bare_patch_proposal_rejected', () => expect(validateDeveloperResponse({ kind: 'patch_proposal' }).ok).toBe(false));
  it('developer_unknown_kind_rejected', () => expect(validateDeveloperResponse({ kind: 'nonsense' }).ok).toBe(false));
  it('developer_clarification_validates_as_escalation', () => expect(validateDeveloperResponse({ kind: 'clarification_request', type: 'needs_clarification', reason: 'r', requested_decision: 'd' }).ok).toBe(true));
  it('debugger_rollback_recommendation_kind_ok', () => expect(validateDebuggerResponse({ kind: 'rollback_recommendation', reason: 'workspace unsafe' }).ok).toBe(true));
  it('debugger_bare_repair_proposal_rejected', () => expect(validateDebuggerResponse({ kind: 'repair_proposal' }).ok).toBe(false));
  it('debugger_unknown_kind_rejected', () => expect(validateDebuggerResponse({ kind: 'patch_proposal' }).ok).toBe(false));
});
