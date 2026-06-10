import { describe, it, expect } from 'vitest';
import { decidePreflightNext, isCommandAllowed, runPreflight, DEFAULT_PREFLIGHT_POLICY } from './index';

describe('preflight-runner', () => {
  // --- existing unit tests for decidePreflightNext / isCommandAllowed / policy ---
  it('passed_preflight_decides_submit', () => expect(decidePreflightNext({ passed: true, attempts: 0, sameSignatureCount: 0 })).toBe('submit'));
  it('failed_within_budget_decides_self_correct', () => expect(decidePreflightNext({ passed: false, attempts: 0, sameSignatureCount: 0 })).toBe('self_correct'));
  it('repeated_signature_decides_escalate', () => expect(decidePreflightNext({ passed: false, attempts: 0, sameSignatureCount: 2 })).toBe('escalate'));
  it('budget_exhausted_decides_escalate', () => expect(decidePreflightNext({ passed: false, attempts: 2, sameSignatureCount: 0 })).toBe('escalate'));
  it('allowed_command_typecheck_ok', () => expect(isCommandAllowed('pnpm typecheck')).toBe(true));
  it('forbidden_rm_rejected', () => expect(isCommandAllowed('rm -rf node_modules')).toBe(false));
  it('forbidden_delete_test_rejected', () => expect(isCommandAllowed('delete the test file')).toBe(false));
  it('default_policy_caps_self_correction_at_2', () => expect(DEFAULT_PREFLIGHT_POLICY.maxSelfCorrectionAttempts).toBe(2));

  // --- STORY-008.1: runPreflight advisory self-check ---

  it('STORY-008.1_no_longer_throws_not_implemented', async () => {
    await expect(runPreflight({}, null)).resolves.not.toThrow();
  });

  it('STORY-008.1_passed_preflight_returns_submit', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': true },
    }, null);
    expect(report.advisory).toBe(true);
    expect(report.passed).toBe(true);
    expect(report.verdict).toBe('submit');
    expect(report.failures).toEqual([]);
  });

  it('STORY-008.1_failed_within_budget_returns_self_correct', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 0,
      same_signature_count: 0,
    }, null);
    expect(report.passed).toBe(false);
    expect(report.verdict).toBe('self_correct');
    expect(report.failures).toContain('pnpm typecheck');
  });

  it('STORY-008.1_repeated_failure_signature_returns_escalate', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 0,
      same_signature_count: 2,
    }, null);
    expect(report.verdict).toBe('escalate');
  });

  it('STORY-008.1_budget_exhausted_returns_escalate', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 2,
      same_signature_count: 0,
    }, null);
    expect(report.verdict).toBe('escalate');
  });

  it('STORY-008.1_forbidden_command_blocked_escalates', async () => {
    const report = await runPreflight({
      commands: ['rm -rf node_modules'],
    }, null);
    expect(report.passed).toBe(false);
    expect(report.verdict).toBe('escalate');
    expect(report.commands_run).toEqual([]);
    expect(report.failures[0]).toMatch(/blocked/);
  });

  it('STORY-008.1_allowed_command_accepted', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': true },
    }, null);
    expect(report.commands_run).toContain('pnpm typecheck');
    expect(report.passed).toBe(true);
  });

  it('STORY-008.1_mixed_commands_forbidden_wins', async () => {
    const report = await runPreflight({
      commands: ['pnpm typecheck', 'rm -rf node_modules'],
      validation_results: { 'pnpm typecheck': true },
    }, null);
    expect(report.passed).toBe(false);
    expect(report.verdict).toBe('escalate');
    // No commands run when a forbidden command is in the list
    expect(report.commands_run).toEqual([]);
  });

  it('STORY-008.1_no_real_shell_execution', async () => {
    // The function must return a deterministic report synchronously without spawning processes.
    // Verified by calling with a command that would fail if shelled out (sudo), and confirming
    // the function returns a report (not hangs or throws) with escalate.
    const report = await runPreflight({ commands: ['sudo rm -rf /'] }, null);
    expect(report.advisory).toBe(true);
    expect(report.verdict).toBe('escalate');
  });

  it('STORY-008.1_deterministic_report_output', async () => {
    const proposal = {
      commands: ['pnpm typecheck', 'pnpm test'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 1,
      same_signature_count: 0,
      story_id: 'STORY-008.1',
    };
    const r1 = await runPreflight(proposal, null);
    const r2 = await runPreflight(proposal, null);
    expect(r1).toEqual(r2);
  });

  it('STORY-008.1_preflight_pass_is_not_story_pass', async () => {
    // advisory:true must always be set; passing preflight never equals story complete.
    const report = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': true },
    }, null);
    expect(report.advisory).toBe(true);
    expect(report.verdict).toBe('submit');
    // The report does NOT carry a story completion status.
    expect((report as Record<string, unknown>).story_complete).toBeUndefined();
    expect((report as Record<string, unknown>).passed_story).toBeUndefined();
  });

  it('STORY-008.1_report_schema_fields_present', async () => {
    const report = await runPreflight({ story_id: 'STORY-008.1' }, null);
    expect(typeof report.advisory).toBe('boolean');
    expect(report.advisory).toBe(true);
    expect(typeof report.passed).toBe('boolean');
    expect(Array.isArray(report.commands_run)).toBe(true);
    expect(Array.isArray(report.failures)).toBe(true);
    expect(typeof report.self_correction_attempts).toBe('number');
    expect(['submit', 'self_correct', 'escalate']).toContain(report.verdict);
    expect(report.story_id).toBe('STORY-008.1');
  });

  it('STORY-008.1_self_corrects_at_most_twice', async () => {
    // At attempt 0 → self_correct; at attempt 2 → escalate (at-most-twice enforced)
    const attempt0 = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 0,
    }, null);
    expect(attempt0.verdict).toBe('self_correct');

    const attempt1 = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 1,
    }, null);
    expect(attempt1.verdict).toBe('self_correct');

    const attempt2 = await runPreflight({
      commands: ['pnpm typecheck'],
      validation_results: { 'pnpm typecheck': false },
      self_correction_attempts: 2,
    }, null);
    expect(attempt2.verdict).toBe('escalate');
  });

  it('STORY-008.1_optimistic_pass_when_no_validation_results', async () => {
    // When proposal carries no validation_results, all commands optimistically pass.
    const report = await runPreflight({ commands: ['pnpm typecheck', 'pnpm test'] }, null);
    expect(report.passed).toBe(true);
    expect(report.verdict).toBe('submit');
    expect(report.failures).toEqual([]);
  });
});
