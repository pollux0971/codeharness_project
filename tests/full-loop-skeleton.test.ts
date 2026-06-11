/**
 * STORY-008.5: Full-loop walking skeleton to checkpoint (scripted provider)
 * Acceptance criteria: full_loop_reaches_checkpoint · injected_failure_recovers_via_debug_loop · no_real_provider_called
 */
import { describe, it, expect } from 'vitest';
import { runFullLoopSkeleton } from '../scripts/full-loop-skeleton.ts';
import { runWalkingSkeleton } from '../scripts/walking-skeleton.ts';

// Integration tests run real git, Node.js subprocesses, and all harness packages.
const TIMEOUT = 60_000;

describe('STORY-008.5: full-loop walking skeleton', () => {
  // AC: full_loop_reaches_checkpoint
  it('STORY-008.5: full loop reaches checkpoint', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.reached_checkpoint).toBe(true);
    expect(result.checkpoint).not.toBeNull();
    expect(result.checkpoint!.final_checkpoint_marker).toBe('CHECKPOINT REACHED ✓');
    expect(result.output).toContain('CHECKPOINT REACHED ✓');
  }, TIMEOUT);

  // AC: injected_failure_recovers_via_debug_loop
  it('STORY-008.5: injected failure recovers via debug loop', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint).not.toBeNull();
    expect(result.checkpoint!.debug_loop_status).toBe('validated');
    expect(result.output).toContain('[debug-loop] result: kind=validated');
    expect(result.output).toContain('[validation-1] FAIL');
  }, TIMEOUT);

  // AC: no_real_provider_called
  it('STORY-008.5: provider is scripted — no real LLM or external API called', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint).not.toBeNull();
    expect(result.checkpoint!.provider_kind).toBe('scripted');
    expect(result.output).toContain('provider_kind=scripted');
  }, TIMEOUT);

  // Provider output validated before apply
  it('STORY-008.5: developer output validated by agent-output gate before apply', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.output).toContain('[agent-output] developer output validation: PASS');
    expect(result.output).toContain('[apply] gateway+apply: APPLIED');
  }, TIMEOUT);

  // Preflight advisory result included in checkpoint
  it('STORY-008.5: preflight advisory result included in checkpoint evidence', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint).not.toBeNull();
    expect(result.checkpoint!.preflight_decision).toBeDefined();
    expect(['submit', 'self_correct', 'escalate']).toContain(result.checkpoint!.preflight_decision);
    expect(result.output).toContain('[preflight] advisory:');
    expect(result.output).toContain('advisory only — not the story verdict');
  }, TIMEOUT);

  // Failure gene banked — failure bank updated
  it('STORY-008.5: failure gene saved to failure bank during debug loop', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint).not.toBeNull();
    expect(result.checkpoint!.failure_bank_status).toMatch(/gene_banked|gene_merged/);
    expect(result.output).toContain('[failure-bank] gene status after debug loop:');
    expect(result.output).toContain('bank size: 1 active gene');
  }, TIMEOUT);

  // Role-scoped context and phase detection participates
  it('STORY-008.5: role-scoped context packets and lifecycle phase detection participate', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.output).toContain('[context-mgr] developer lifecycle phase: developing');
    expect(result.output).toContain('[context-mgr] debugger lifecycle phase: debugging');
    expect(result.output).toContain('[context-mgr] checkpoint lifecycle phase: checkpointing');
    expect(result.output).toContain('[context-mgr] developer context packet: valid');
    expect(result.output).toContain('[context-mgr] debugger context packet: valid');
  }, TIMEOUT);

  // Repair proposal gated before apply (write-set + output validation)
  it('STORY-008.5: repair proposal passes write-set and debugger output gate before apply', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.output).toContain('[debug-loop] result: kind=validated');
    // The debug loop applied the repair — if write-set gate failed, kind would be 'escalated'
    expect(result.checkpoint!.debug_loop_status).toBe('validated');
  }, TIMEOUT);

  // Re-validation success reaches checkpoint
  it('STORY-008.5: re-validation after repair succeeds and reaches checkpoint', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.reached_checkpoint).toBe(true);
    expect(result.checkpoint!.validation_status).toBe('passed');
  }, TIMEOUT);

  // Checkpoint is machine-readable with all required fields
  it('STORY-008.5: checkpoint is machine-readable and contains all required evidence fields', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    const cp = result.checkpoint!;
    expect(typeof cp.story_id).toBe('string');
    expect(typeof cp.provider_kind).toBe('string');
    expect(typeof cp.preflight_decision).toBe('string');
    expect(cp.validation_status === 'passed' || cp.validation_status === 'failed').toBe(true);
    expect(typeof cp.debug_loop_status).toBe('string');
    expect(typeof cp.failure_bank_status).toBe('string');
    expect(typeof cp.final_checkpoint_marker).toBe('string');
  }, TIMEOUT);

  // Checkpoint story_id matches story
  it('STORY-008.5: checkpoint story_id matches the skeleton story', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint!.story_id).toBe('STORY-LOOP-FULL');
  }, TIMEOUT);

  // Determinism: same input → same checkpoint result
  it('STORY-008.5: same input produces same checkpoint result (determinism)', async () => {
    const r1 = await runFullLoopSkeleton({ print: false });
    const r2 = await runFullLoopSkeleton({ print: false });
    expect(r1.checkpoint).toEqual(r2.checkpoint);
  }, TIMEOUT);

  // No EPIC-009 planning generated
  it('STORY-008.5: no EPIC-009 planning pipeline invoked', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.output).not.toContain('createPlanningBundle');
    expect(result.output).not.toContain('planning_bundle');
    expect(result.output).not.toContain('EPIC-009');
  }, TIMEOUT);

  // No EPIC-011 remote provider enabled
  it('STORY-008.5: no EPIC-011 real/remote provider enabled', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.checkpoint!.provider_kind).not.toBe('llm_remote');
    expect(result.output).not.toContain('llm_remote');
  }, TIMEOUT);

  // No workspace applied without permission gateway
  it('STORY-008.5: workspace apply only occurs in disposable workspace via permission gateway', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    // The APPLIED decision comes from the permission gateway; BLOCKED would mean gate rejected
    expect(result.output).toContain('decision=allow');
  }, TIMEOUT);

  // Spec-conformance gate participated
  it('STORY-008.5: spec-conformance gate (HARD gate) validates proposal before apply', async () => {
    const result = await runFullLoopSkeleton({ print: false });
    expect(result.output).toContain('[spec-gate] spec conformance: PASS');
  }, TIMEOUT);

  // Existing walk still passes (regression guard)
  it('STORY-008.5: existing npm run walk (runWalkingSkeleton) still passes — no regression', async () => {
    const result = await runWalkingSkeleton({ print: false });
    expect(result.validated).toBe(true);
    expect(result.output).toContain('STORY VALIDATED ✓');
  }, TIMEOUT);
});
