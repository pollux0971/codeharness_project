import { describe, it, expect } from 'vitest';
import { classifyFailure, buildFailureSignature, decideRepairRoute, emitFailureGene } from './index';

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
