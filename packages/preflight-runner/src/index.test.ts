import { describe, it, expect } from 'vitest';
import { decidePreflightNext, isCommandAllowed, runPreflight, DEFAULT_PREFLIGHT_POLICY } from './index';

describe('preflight-runner', () => {
  it('passed_preflight_decides_submit', () => expect(decidePreflightNext({ passed: true, attempts: 0, sameSignatureCount: 0 })).toBe('submit'));
  it('failed_within_budget_decides_self_correct', () => expect(decidePreflightNext({ passed: false, attempts: 0, sameSignatureCount: 0 })).toBe('self_correct'));
  it('repeated_signature_decides_escalate', () => expect(decidePreflightNext({ passed: false, attempts: 0, sameSignatureCount: 2 })).toBe('escalate'));
  it('budget_exhausted_decides_escalate', () => expect(decidePreflightNext({ passed: false, attempts: 2, sameSignatureCount: 0 })).toBe('escalate'));
  it('allowed_command_typecheck_ok', () => expect(isCommandAllowed('pnpm typecheck')).toBe(true));
  it('forbidden_rm_rejected', () => expect(isCommandAllowed('rm -rf node_modules')).toBe(false));
  it('forbidden_delete_test_rejected', () => expect(isCommandAllowed('delete the test file')).toBe(false));
  it('default_policy_caps_self_correction_at_2', () => expect(DEFAULT_PREFLIGHT_POLICY.maxSelfCorrectionAttempts).toBe(2));
  it('run_preflight_is_not_implemented', async () => { await expect(runPreflight({}, null)).rejects.toThrow(/not implemented/); });
});
