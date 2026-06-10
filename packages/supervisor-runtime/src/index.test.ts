import { describe, it, expect } from 'vitest';
import { decideNextAction, validateStoryReady, SupervisorState } from './index';

const S = (o: Partial<SupervisorState>): SupervisorState => ({
  storyReady: true, sameSignatureCount: 0, attempts: { developer: 0, debugger: 0 },
  budget: { developer: 2, debugger: 2, sameSignature: 2 }, ...o,
});

describe('supervisor-runtime', () => {
  it('not_ready_story_routes_replan', () => expect(decideNextAction(S({ storyReady: false })).type).toBe('replan'));
  it('ready_story_no_result_calls_developer', () => expect(decideNextAction(S({})).type).toBe('call_developer'));
  it('developer_result_routes_validate', () => expect(decideNextAction(S({ developerResult: { patchProposal: true } })).type).toBe('validate'));
  it('validation_passed_routes_checkpoint', () => expect(decideNextAction(S({ validationReport: { status: 'passed' } })).type).toBe('checkpoint'));
  it('validation_failed_routes_debugger', () => expect(decideNextAction(S({ validationReport: { status: 'failed', failureType: 'test' } })).type).toBe('call_debugger'));
  it('repeated_signature_routes_human', () => expect(decideNextAction(S({ validationReport: { status: 'failed' }, sameSignatureCount: 2 })).type).toBe('ask_human'));
  it('budget_exhausted_routes_human', () => expect(decideNextAction(S({ validationReport: { status: 'failed' }, attempts: { developer: 2, debugger: 2 } })).type).toBe('ask_human'));
  it('permission_denied_routes_abort_attempt', () => expect(decideNextAction(S({ permissionDenied: {} })).type).toBe('abort_attempt'));
  it('permission_denied_scope_routes_human', () => expect(decideNextAction(S({ permissionDenied: { needsScopeExpansion: true } })).type).toBe('ask_human'));
  it('debugger_scope_expansion_routes_human', () => expect(decideNextAction(S({ debuggerResult: { withinScope: false, needsScopeExpansion: true } })).type).toBe('ask_human'));
  it('debugger_within_scope_routes_validate', () => expect(decideNextAction(S({ debuggerResult: { withinScope: true } })).type).toBe('validate'));
  it('security_human_issue_routes_human', () => expect(decideNextAction(S({ humanIssue: { severity: 'high', klass: 'security' } })).type).toBe('ask_human'));
  it('nonsecurity_human_issue_routes_debugger_investigation', () => expect(decideNextAction(S({ humanIssue: { severity: 'medium' } })).type).toBe('call_debugger'));
  it('validate_story_ready_flags_missing_fields', () => expect(validateStoryReady({ objective: 'x' }).length).toBeGreaterThan(0));
  it('validate_story_ready_empty_for_complete_contract', () => expect(validateStoryReady({
    objective: 'x', allowed_write_set: ['a'], acceptance_criteria: ['c'], validation_commands: ['v'], rollback_notes: 'r',
  }).length).toBe(0));
});
