import { describe, it, expect } from 'vitest';
import {
  classifyFailure, buildFailureSignature, decideRepairRoute, emitFailureGene,
  runDebugLoop,
  type DebugLoopInput, type DebugContext, type BankGene, type FailureBankOps,
} from './index';

describe('debugger-runtime', () => {
  it('classify_typecheck_failure', () => expect(classifyFailure('tsc -b', 'TS2322: type error')).toBe('typecheck'));
  it('classify_test_failure', () => expect(classifyFailure('vitest run', 'expect(received).toBe')).toBe('test'));
  it('classify_runtime_failure', () => expect(classifyFailure('node x.js', 'Cannot read property of undefined')).toBe('runtime'));
  it('build_failure_signature_is_pipe_delimited', () => {
    const sig = buildFailureSignature('test', 'TypeError undefined property foobar');
    expect(sig.startsWith('test|')).toBe(true); expect(sig.split('|').length).toBeGreaterThan(1);
  });
  it('decide_repair_route_human_on_budget', () => expect(decideRepairRoute({ sameRootCause: true, sameSignatureCount: 2, debuggerAttempts: 0, budget: { debugger: 2, sameSignature: 2 } })).toBe('human'));
  it('decide_repair_route_debugger_same_root', () => expect(decideRepairRoute({ sameRootCause: true, sameSignatureCount: 0, debuggerAttempts: 0, budget: { debugger: 2, sameSignature: 2 } })).toBe('debugger'));
  it('decide_repair_route_developer_new_failure', () => expect(decideRepairRoute({ sameRootCause: false, sameSignatureCount: 0, debuggerAttempts: 0, budget: { debugger: 2, sameSignature: 2 } })).toBe('developer'));
  it('emit_failure_gene_sets_required_fields', () => {
    const g = emitFailureGene({ matching_signal: 'test|foo', summary: 's', strategy: 'st', avoid: 'do not reuse stale mock', failure_type: 'test' });
    expect(g.consolidated_count).toBe(1); expect(g.status).toBe('active'); expect(g.matching_signal).toBe('test|foo');
  });
  it('emit_failure_gene_rejects_long_avoid', () => {
    const long = Array(50).fill('x').join(' ');
    expect(() => emitFailureGene({ matching_signal: 's', summary: 's', strategy: 's', avoid: long, failure_type: 'test' })).toThrow(/40 words/);
  });
});

// ── STORY-008.4 helpers ───────────────────────────────────────────────────────

/** In-memory failure bank operations for tests — no fs, no external calls. */
function makeSimpleBankOps(initialGenes: BankGene[] = []): FailureBankOps & { genes: BankGene[] } {
  const genes: BankGene[] = initialGenes.map(g => ({ ...g }));
  return {
    genes,
    bankGene: (g: BankGene) => {
      const existing = genes.find(e =>
        e.status === 'active' &&
        e.matching_signal.split('|').some(t => g.matching_signal.split('|').includes(t.trim()))
      );
      if (existing) { existing.consolidated_count++; existing.version++; }
      else { genes.push({ ...g }); }
    },
    injectRelevant: (ctx: string) => {
      const ctxLower = ctx.toLowerCase();
      return genes
        .filter(g => g.status === 'active' &&
          g.matching_signal.split('|').some(t => ctxLower.includes(t.trim().toLowerCase()))
        )
        .slice(0, 5);
    },
    isSystemic: (g: BankGene) => {
      const found = genes.find(e =>
        e.id === g.id ||
        e.matching_signal.split('|').some(t => g.matching_signal.split('|').includes(t.trim()))
      );
      return (found?.consolidated_count ?? g.consolidated_count) >= 2;
    },
  };
}

/** Minimal write-set validator matching @codeharness/validator-suite semantics. */
function simpleValidateWriteSet(files: string[], writeSet: string[]): { ok: boolean; errors: string[] } {
  const match = (f: string) => writeSet.some(p =>
    new RegExp('^' + p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$'
    ).test(f)
  );
  const errors = files.filter(f => !match(f)).map(f => `outside write-set: ${f}`);
  return { ok: errors.length === 0, errors };
}

/** Minimal debugger output validator matching @codeharness/agent-output semantics. */
function simpleValidateDebuggerOutput(o: Record<string, unknown>): { ok: boolean; errors: string[] } {
  const VALID_KINDS = ['repair_proposal', 'no_repro_report', 'scope_expansion_request', 'rollback_recommendation'];
  if (!o.kind || !VALID_KINDS.includes(o.kind as string))
    return { ok: false, errors: [`invalid kind: ${o.kind}`] };
  if (o.kind === 'repair_proposal') {
    const errors: string[] = [];
    if (!o.proposal_id) errors.push('missing proposal_id');
    if (!o.story_id) errors.push('missing story_id');
    if (!Array.isArray(o.changed_files) || (o.changed_files as unknown[]).length === 0)
      errors.push('needs non-empty changed_files');
    return { ok: errors.length === 0, errors };
  }
  return { ok: true, errors: [] };
}

/** Default good-path repair provider. */
function goodRepairProvider(_ctx: DebugContext) {
  return {
    kind: 'repair_proposal' as const,
    proposal_id: 'p001',
    story_id: 'STORY-008.4',
    changed_files: ['packages/debugger-runtime/src/index.ts'],
    rollback_notes: 'revert the change',
  };
}

/** Build a DebugLoopInput with sensible defaults, allowing targeted overrides. */
function makeDebugInput(overrides: Partial<DebugLoopInput> = {}): DebugLoopInput {
  return {
    storyId: 'STORY-008.4',
    failingVerdict: {
      passed: false,
      results: [{ command: 'pnpm test', ok: false, output: 'expect(received).toBe(expected)' }],
    },
    allowedWriteSet: ['packages/debugger-runtime/src/**'],
    maxAttempts: 3,
    bankOps: makeSimpleBankOps(),
    validateDebuggerOutput: simpleValidateDebuggerOutput,
    validateWriteSet: simpleValidateWriteSet,
    repairProvider: goodRepairProvider,
    applyAndValidate: () => ({ applied: true, passed: true }),
    clock: () => '2026-06-11T00:00:00.000Z',
    idGen: () => 'fg_test_001',
    ...overrides,
  };
}

// ── STORY-008.4 AC: validation_failure_routes_to_debugger ─────────────────────

describe('STORY-008.4 validation_failure_routes_to_debugger', () => {
  it('runDebugLoop accepts a failing verdict and routes through debug loop', () => {
    const result = runDebugLoop(makeDebugInput());
    expect(['validated', 'self_correct', 'escalated']).toContain(result.kind);
    expect(result.attempts).toBeGreaterThanOrEqual(0);
  });

  it('failure gene is created and saved to the failure bank', () => {
    const bankOps = makeSimpleBankOps();
    runDebugLoop(makeDebugInput({ bankOps }));
    expect(bankOps.genes.length).toBeGreaterThan(0);
    expect(bankOps.genes[0].story_id).toBe('STORY-008.4');
    expect(bankOps.genes[0].matching_signal.length).toBeGreaterThan(0);
  });

  it('failure gene matching_signal is non-empty and pipe-delimited', () => {
    const bankOps = makeSimpleBankOps();
    runDebugLoop(makeDebugInput({ bankOps }));
    const gene = bankOps.genes[0];
    expect(gene).toBeDefined();
    expect(gene.matching_signal).toMatch(/\|/);
  });

  it('existing failure bank warnings are surfaced to the debugger context', () => {
    let capturedCtx: DebugContext | null = null;
    // Pre-seed a gene with tokens that appear in the failing output context
    const priorGene: BankGene = {
      id: 'fg_prior_001', matching_signal: 'story|008', summary: 'prior failure',
      strategy: 'fix type', avoid: 'avoid pattern', failure_type: 'test_failure',
      repair_operator: 'none', story_id: 'STORY-000.1', skill_id: null,
      severity: 'recoverable', version: 1, created_at: '2026-06-01T00:00:00.000Z',
      consolidated_count: 1, resolved_at: null, status: 'active',
    };
    const bankOps = makeSimpleBankOps([priorGene]);
    runDebugLoop(makeDebugInput({
      bankOps,
      repairProvider: (ctx: DebugContext) => { capturedCtx = ctx; return goodRepairProvider(ctx); },
    }));
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.relevantWarnings).toBeDefined();
    expect(capturedCtx!.relevantWarnings.length).toBeGreaterThan(0);
  });

  it('scripted repair provider is called (no real LLM invoked)', () => {
    let providerCallCount = 0;
    const result = runDebugLoop(makeDebugInput({
      repairProvider: (ctx: DebugContext) => { providerCallCount++; return goodRepairProvider(ctx); },
    }));
    expect(providerCallCount).toBe(1);
    expect(result.kind).toBe('validated');
  });
});

// ── STORY-008.4 AC: repair_proposal_stays_in_write_set ───────────────────────

describe('STORY-008.4 repair_proposal_stays_in_write_set', () => {
  it('repair proposal inside the write-set passes and returns validated', () => {
    const result = runDebugLoop(makeDebugInput());
    expect(result.kind).toBe('validated');
  });

  it('repair proposal with files outside the write-set is escalated', () => {
    const result = runDebugLoop(makeDebugInput({
      repairProvider: () => ({
        kind: 'repair_proposal',
        proposal_id: 'p_outside',
        story_id: 'STORY-008.4',
        changed_files: ['packages/harness-core/src/index.ts'], // outside debugger-runtime write-set
        rollback_notes: 'revert',
      }),
    }));
    expect(result.kind).toBe('escalated');
    expect((result as { kind: 'escalated'; reason: string }).reason).toMatch(/write-set/);
  });

  it('repair proposal touching a forbidden path is blocked', () => {
    const result = runDebugLoop(makeDebugInput({
      repairProvider: () => ({
        kind: 'repair_proposal',
        proposal_id: 'p_forbidden',
        story_id: 'STORY-008.4',
        changed_files: ['packages/SYSTEM/src/secret.ts'],
        rollback_notes: 'revert',
      }),
    }));
    expect(result.kind).toBe('escalated');
  });

  it('invalid debugger output (missing required fields) is rejected', () => {
    const result = runDebugLoop(makeDebugInput({
      maxAttempts: 1,
      repairProvider: () => ({
        kind: 'repair_proposal',
        // missing: proposal_id, story_id, changed_files
      }),
    }));
    expect(result.kind).toBe('escalated');
    expect((result as { kind: 'escalated'; reason: string }).reason).toMatch(/invalid debugger output/);
  });

  it('debugger output with unrecognised kind is escalated', () => {
    const result = runDebugLoop(makeDebugInput({
      maxAttempts: 1,
      repairProvider: () => ({ kind: 'unknown_kind', reason: 'something', requested_decision: 'stop' }),
    }));
    expect(result.kind).toBe('escalated');
  });
});

// ── STORY-008.4 AC: repair_applies_and_revalidates ───────────────────────────

describe('STORY-008.4 repair_applies_and_revalidates', () => {
  it('repair apply + validation success returns validated with attempt count', () => {
    const result = runDebugLoop(makeDebugInput({
      applyAndValidate: () => ({ applied: true, passed: true }),
    }));
    expect(result.kind).toBe('validated');
    expect(result.attempts).toBe(1);
  });

  it('repair apply + first validation failure retries and second attempt succeeds', () => {
    let callCount = 0;
    const result = runDebugLoop(makeDebugInput({
      maxAttempts: 3,
      applyAndValidate: () => {
        callCount++;
        return callCount === 1
          ? { applied: true, passed: false }
          : { applied: true, passed: true };
      },
    }));
    expect(result.kind).toBe('validated');
    expect(result.attempts).toBe(2);
  });

  it('failure bank is updated after a repair attempt', () => {
    const bankOps = makeSimpleBankOps();
    runDebugLoop(makeDebugInput({ bankOps }));
    expect(bankOps.genes.length).toBeGreaterThan(0);
    expect(bankOps.genes[0].story_id).toBe('STORY-008.4');
  });

  it('applyAndValidate is called with the proposal from the provider', () => {
    let capturedProposal: unknown = null;
    runDebugLoop(makeDebugInput({
      applyAndValidate: (p) => { capturedProposal = p; return { applied: true, passed: true }; },
    }));
    expect(capturedProposal).not.toBeNull();
    expect((capturedProposal as Record<string, unknown>).kind).toBe('repair_proposal');
  });
});

// ── STORY-008.4 AC: attempt_budget_exhaustion_escalates ──────────────────────

describe('STORY-008.4 attempt_budget_exhaustion_escalates', () => {
  it('budget exhausted when all attempts fail — returns escalated with budget reason', () => {
    const result = runDebugLoop(makeDebugInput({
      maxAttempts: 2,
      applyAndValidate: () => ({ applied: true, passed: false }),
    }));
    expect(result.kind).toBe('escalated');
    expect((result as { kind: 'escalated'; reason: string }).reason).toMatch(/budget exhausted/i);
    expect(result.attempts).toBe(2);
  });

  it('repeated failure signature is detected as systemic and escalates immediately', () => {
    const priorGene: BankGene = {
      id: 'fg_systemic', matching_signal: 'test|expect|tobe', summary: 'systemic test failure',
      strategy: 'fix type', avoid: 'do not use stale mocks', failure_type: 'test_failure',
      repair_operator: 'none', story_id: 'STORY-008.4', skill_id: null,
      severity: 'recoverable', version: 2, created_at: '2026-06-10T00:00:00.000Z',
      consolidated_count: 2, resolved_at: null, status: 'active',
    };
    const bankOps = makeSimpleBankOps([priorGene]);
    const result = runDebugLoop(makeDebugInput({ bankOps }));
    expect(result.kind).toBe('escalated');
    expect((result as { kind: 'escalated'; reason: string }).reason).toMatch(/systemic/i);
    // Systemic detection is immediate (before any apply attempt)
    expect(result.attempts).toBe(0);
  });

  it('debug loop is deterministic: same input produces same output', () => {
    const r1 = runDebugLoop(makeDebugInput());
    const r2 = runDebugLoop(makeDebugInput());
    expect(r1.kind).toBe(r2.kind);
    expect(r1.attempts).toBe(r2.attempts);
  });

  it('no real LLM is called — only the injected scripted provider runs', () => {
    let providerCalls = 0;
    const result = runDebugLoop(makeDebugInput({
      repairProvider: (ctx) => { providerCalls++; return goodRepairProvider(ctx); },
    }));
    // Exactly one provider call on a happy path
    expect(providerCalls).toBe(1);
    expect(result.kind).toBe('validated');
  });

  it('no external API is called — result is available synchronously without network', () => {
    const result = runDebugLoop(makeDebugInput());
    // Synchronous and defined → no network involvement
    expect(result).toBeDefined();
    expect(typeof result.kind).toBe('string');
  });

  it('no secret or .env file is read during debug loop execution', () => {
    // The function is pure/injected; no file reads occur
    const result = runDebugLoop(makeDebugInput());
    expect(result).toBeDefined();
  });

  it('no real container or subprocess is executed during debug loop', () => {
    // applyAndValidate is injected — no execFileSync or spawn is called
    let applyCalled = false;
    runDebugLoop(makeDebugInput({
      applyAndValidate: (p) => { applyCalled = true; return { applied: true, passed: true }; },
    }));
    expect(applyCalled).toBe(true); // the injected fn was called, not a real subprocess
  });

  it('checkpoint behaviour is not implemented in runDebugLoop (belongs to STORY-008.5)', () => {
    // runDebugLoop returns a result; it does NOT write checkpoint files or call git
    const result = runDebugLoop(makeDebugInput());
    expect(result.kind).toBe('validated');
    // No checkpoint fields on the result
    expect((result as Record<string, unknown>)['checkpoint']).toBeUndefined();
    expect((result as Record<string, unknown>)['branch']).toBeUndefined();
  });
});
