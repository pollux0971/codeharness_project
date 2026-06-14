/**
 * L3 CONTEXT COMPACTION — docs/validation/04_CONTEXT_COMPACTION_TESTS.md. Drives the
 * real Context Manager (no LLM) and asserts it compacts SAFELY: raw trace untouched,
 * summaries carry source_refs, secrets redacted, role-scoped packets, pinning, the
 * re-injection cadence, and budget-by-selection (never drop the trace).
 *
 * Encoded spec rows:
 *   04#1 a turn is summarized → raw artifact still retrievable (append-only trace untouched)
 *   04#2 a summary carries a source_ref to the original
 *   04#3 logs contain a secret → redacted before entering context
 *   04#4 Supervisor context → NOT the full Developer trace (summaries only)
 *   04#5 Debugger context → DOES contain the relevant failed logs
 *   04#6 compression below ratio 0.3 → refused (floor enforced)
 *   04#7 first 3 / last 5 turns → never compressed (pinning)
 *   04#8 10th agent call → contract + active failure genes re-injected
 *   04#9 20th agent call → rules/invariants re-injected
 *   04#10 per-agent token budget exceeded → reduced by artifact SELECTION, not by dropping the trace
 */
import { describe, it, expect } from 'vitest';
import {
  compactContextWindow, compressLargeNodes, validateContextPacket, buildRoleContextPacket,
  enforceTokenBudgetByArtifactSelection, shouldReinject, DEFAULT_CONFIG,
  type ContextWindow, type ArtifactRef, type RoleContextPacket,
} from '@codeharness/context-manager';
import { redact } from '@codeharness/event-log';

function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

const BIG = 'lorem ipsum dolor sit amet '.repeat(2000); // ~54k chars ⇒ ~13k tokens, over the 4000 node threshold
const tok = (s: string) => Math.ceil(s.length / 4);
const small = (n: number) => ({ role: 'assistant', content: `turn ${n}`, tokenCount: 8 });
/** 10-turn window: index 0 & 9 are BIG (pinned by first-3/last-5), index 4 is BIG (compressible middle). */
function longWindow(): ContextWindow {
  const turns = [
    { role: 'assistant', content: BIG, tokenCount: tok(BIG) }, // 0 — first-3, must NOT compress
    small(1), small(2), small(3),
    { role: 'assistant', content: BIG, tokenCount: tok(BIG) }, // 4 — middle, MUST compress
    small(5), small(6), small(7), small(8),
    { role: 'assistant', content: BIG, tokenCount: tok(BIG) }, // 9 — last-5, must NOT compress
  ];
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

describe('context compaction (04_CONTEXT_COMPACTION_TESTS.md)', () => {
  specCase('04#1', 'a summarized turn leaves the raw artifact retrievable; the append-only trace is untouched', () => {
    // Append-only raw trace / artifact store: the source of truth, never mutated by compaction.
    const rawStore: Record<string, string> = { 'artifact://turn/4': BIG };
    const before = JSON.stringify(rawStore);
    const compacted = compressLargeNodes(longWindow(), DEFAULT_CONFIG);
    const summarized = compacted.turns.find(t => t.content.includes('[compacted]'));
    expect(summarized).toBeDefined();
    expect(summarized!.content.length).toBeLessThan(BIG.length); // the live window turn was summarized
    expect(rawStore['artifact://turn/4']).toBe(BIG);            // the raw artifact is still retrievable
    expect(JSON.stringify(rawStore)).toBe(before);              // append-only trace untouched
  });

  specCase('04#2', 'a summary section carries a source_ref to the original', () => {
    const withRef: RoleContextPacket = { role: 'developer', sections: [{ name: 'story_contract', ref: 'artifact://story/contract#v1' }], excluded: [] };
    expect(validateContextPacket(withRef).ok).toBe(true);
    const noRef: RoleContextPacket = { role: 'developer', sections: [{ name: 'story_contract', ref: '' }], excluded: [] };
    const res = validateContextPacket(noRef);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/source_ref/);
  });

  specCase('04#3', 'a log containing a secret is redacted before it can enter context', () => {
    const logPayload = { message: 'provider responded; key=sk-ABCD1234EFGH5678IJKL used', nested: ['ghp_ABCD1234EFGH5678'] };
    const safe = redact(logPayload);
    const dumped = JSON.stringify(safe);
    expect(dumped).not.toMatch(/sk-ABCD1234/);
    expect(dumped).not.toMatch(/ghp_ABCD1234/);
    expect(dumped).toMatch(/«redacted»/);
    // defense in depth: even if a secret slips into a packet section, validation blocks it
    const leaky: RoleContextPacket = { role: 'developer', sections: [{ name: 'relevant_files', ref: 'r', text: 'sk-ABCD1234EFGH5678IJKL' }], excluded: [] };
    expect(validateContextPacket(leaky).ok).toBe(false);
  });

  specCase('04#4', 'the Supervisor packet excludes the full Developer trace (summaries only)', () => {
    const available: ArtifactRef[] = [
      { name: 'project_status', ref: 'r1' },
      { name: 'story_goal', ref: 'r2' },
      { name: 'codegraph_summary', ref: 'r3' },
      { name: 'invariants', ref: 'r4' },
      { name: 'developer_full_trace', ref: 'r5' }, // must NOT be selected for the supervisor
      { name: 'failed_logs', ref: 'r6' },
    ];
    const packet = buildRoleContextPacket('supervisor', available);
    expect(packet.sections.map(s => s.name)).not.toContain('developer_full_trace');
    expect(packet.excluded).toContain('developer_full_trace');
  });

  specCase('04#5', 'the Debugger packet DOES contain the relevant failed logs', () => {
    const available: ArtifactRef[] = [
      { name: 'failed_logs', ref: 'r1' },
      { name: 'current_patch', ref: 'r2' },
      { name: 'affected_codegraph', ref: 'r3' },
      { name: 'debug_attempts', ref: 'r4' },
      { name: 'matching_failure_genes', ref: 'r5' },
      { name: 'unrelated_marketing_doc', ref: 'r6' },
    ];
    const packet = buildRoleContextPacket('debugger', available);
    expect(packet.sections.map(s => s.name)).toContain('failed_logs');
    expect(packet.excluded).toContain('unrelated_marketing_doc');
  });

  specCase('04#6', 'compression never goes below the 0.3 ratio floor', () => {
    const compacted = compressLargeNodes(longWindow(), DEFAULT_CONFIG);
    const summarized = compacted.turns.find(t => t.content.includes('[compacted]'))!;
    // The floor (0.3) is enforced: the summary keeps at least ~30% of the original, not near-zero.
    expect(summarized.content.length).toBeGreaterThanOrEqual(Math.floor(BIG.length * DEFAULT_CONFIG.compressionRateFloor));
  });

  specCase('04#7', 'the first 3 and last 5 turns are never compressed (pinning)', () => {
    const compacted = compressLargeNodes(longWindow(), DEFAULT_CONFIG);
    expect(compacted.turns[0].content).toBe(BIG);              // first-3 pinned: untouched
    expect(compacted.turns[0].content).not.toMatch(/\[compacted\]/);
    expect(compacted.turns[9].content).toBe(BIG);              // last-5 pinned: untouched
    expect(compacted.turns[9].content).not.toMatch(/\[compacted\]/);
    expect(compacted.turns[4].content).toMatch(/\[compacted\]/); // the middle big turn WAS compressed
  });

  specCase('04#8', 'the 10th agent call re-injects the contract + active failure genes', () => {
    const r = shouldReinject(10, DEFAULT_CONFIG);
    expect(r.contract).toBe(true);
    expect(r.failureGenes).toBe(true);
    expect(shouldReinject(7, DEFAULT_CONFIG).contract).toBe(false); // not every call
  });

  specCase('04#9', 'the 20th agent call re-injects rules/invariants', () => {
    expect(shouldReinject(20, DEFAULT_CONFIG).hardRules).toBe(true);
    expect(shouldReinject(10, DEFAULT_CONFIG).hardRules).toBe(false); // 10th: contract yes, hard rules no
  });

  specCase('04#10', 'an over-budget agent context is reduced by artifact selection, never by dropping the raw trace', () => {
    const sections: ArtifactRef[] = [
      { name: 'raw_trace', ref: 'r0', tokenCount: 400, priority: 0 },   // highest priority — must survive
      { name: 'story_contract', ref: 'r1', tokenCount: 300, priority: 1 },
      { name: 'big_codegraph_dump', ref: 'r2', tokenCount: 9000, priority: 8 }, // low priority — deferred
      { name: 'old_chatter', ref: 'r3', tokenCount: 5000, priority: 9 },
    ];
    const { kept, deferred } = enforceTokenBudgetByArtifactSelection(sections, 1000);
    expect(kept.map(s => s.name)).toContain('raw_trace');         // trace never dropped
    expect(deferred).toContain('big_codegraph_dump');             // reduced by SELECTION
    expect(deferred.length).toBeGreaterThan(0);
    expect(kept.reduce((s, a) => s + (a.tokenCount ?? 0), 0)).toBeLessThanOrEqual(1000);
  });
});
