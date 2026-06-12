import { describe, it, expect } from 'vitest';
import {
  lookupSymbol, computeImpactSet, summarizeForContext, filterToReadScope,
  NULL_CLIENT, type CodeGraphClient, type SymbolLocation,
} from './index';

const fixtureClient = (locs: SymbolLocation[], impacted: string[]): CodeGraphClient => ({
  async query(_q) {
    return { locations: locs, impacted_files: impacted };
  },
});

describe('codegraph-adapter', () => {
  it('symbol_lookup_returns_definitions_and_references', async () => {
    const locs: SymbolLocation[] = [
      { file: 'src/a.ts', line: 10, kind: 'definition' },
      { file: 'src/b.ts', line: 20, kind: 'reference' },
    ];
    const result = await lookupSymbol('MyClass', fixtureClient(locs, []));
    expect(result.locations.length).toBe(2);
    expect(result.summary).toContain('MyClass');
  });

  it('impact_set_computed_for_write_set', async () => {
    const impacted = ['src/b.ts', 'src/c.ts', 'src/d.ts'];
    const result = await computeImpactSet(['src/a.ts'], fixtureClient([], impacted));
    expect(result.impactedFiles.length).toBe(3);
    expect(result.summary).toMatch(/3 dependent/);
  });

  it('localization_results_summarized_into_context', async () => {
    const result = await lookupSymbol('X', NULL_CLIENT);
    const summary = summarizeForContext(result);
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(200);
  });

  it('no_repo_content_leaked_beyond_read_scope', async () => {
    const locs: SymbolLocation[] = [
      { file: 'src/a.ts', line: 1 },
      { file: 'test/a.test.ts', line: 1 },
    ];
    const result = await lookupSymbol('X', fixtureClient(locs, []), ['src/**']);
    expect(result.locations.every(l => l.file.startsWith('src/'))).toBe(true);
    expect(result.locations.length).toBe(1);
  });

  it('filter_to_read_scope_pure', () => {
    const locs: SymbolLocation[] = [
      { file: 'src/a.ts', line: 1 },
      { file: 'src/b.ts', line: 2 },
      { file: 'test/x.ts', line: 3 },
    ];
    const filtered = filterToReadScope(locs, ['src/**']);
    expect(filtered.length).toBe(2);
  });

  it('null_client_returns_empty_result', async () => {
    const result = await lookupSymbol('anything');
    expect(result.locations.length).toBe(0);
    expect(result.summary).toBeTruthy();
  });

  it('impact_set_empty_files_list', async () => {
    const result = await computeImpactSet([]);
    expect(result.impactedFiles.length).toBe(0);
  });
});
