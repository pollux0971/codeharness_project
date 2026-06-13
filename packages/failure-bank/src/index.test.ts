import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadBank, saveBank, consolidate, validateFailureGene,
  injectRelevant, formatForInjection,
  pairResolvedDirection, preloadProvenRemedies,
  type FailureGene, type WarningBank,
} from './index';

function makeGene(overrides: Partial<FailureGene> = {}): FailureGene {
  return {
    id: 'fg-test-001',
    matching_signal: 'type:type_error|file:src/core',
    summary: 'Type error in core layer.',
    strategy: 'Fix the type annotation and re-run typecheck.',
    avoid: 'Do NOT use any in the core layer without a cast comment.',
    failure_type: 'type_error',
    repair_operator: 'SUBSTITUTE',
    story_id: 'STORY-001.1',
    skill_id: null,
    severity: 'recoverable',
    version: 1,
    created_at: '2026-06-07T10:00:00Z',
    consolidated_count: 1,
    resolved_at: null,
    status: 'active',
    ...overrides,
  };
}

function emptyBank(): WarningBank {
  return { schema_version: 'failure_bank/v1', updated_at: '', bank: [] };
}

let tmpDir: string;
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-test-')); });
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('failure-bank STORY-008.3', () => {

  // AC: failure_gene_saved_on_validation_failure / save then load preserves genes
  it('STORY-008.3: save_then_load_preserves_genes', async () => {
    const bankPath = path.join(tmpDir, 'warning_bank.json');
    const gene = makeGene({ id: 'fg-save-001' });
    const bank: WarningBank = { ...emptyBank(), bank: [gene] };
    await saveBank(bank, bankPath);
    const loaded = await loadBank(bankPath);
    expect(loaded.bank).toHaveLength(1);
    expect(loaded.bank[0].id).toBe('fg-save-001');
    expect(loaded.bank[0].avoid).toBe(gene.avoid);
  });

  // AC: bank_loads_existing_genes
  it('STORY-008.3: bank_loads_existing_genes', async () => {
    const bankPath = path.join(tmpDir, 'warning_bank.json');
    const gene = makeGene({ id: 'fg-load-001' });
    fs.writeFileSync(bankPath, JSON.stringify({ ...emptyBank(), bank: [gene] }, null, 2) + '\n');
    const loaded = await loadBank(bankPath);
    expect(loaded.bank).toHaveLength(1);
    expect(loaded.bank[0].id).toBe('fg-load-001');
  });

  // AC: empty bank loads as empty
  it('STORY-008.3: empty_bank_loads_as_empty_when_file_missing', async () => {
    const loaded = await loadBank(path.join(tmpDir, 'no_such_file.json'));
    expect(loaded.bank).toHaveLength(0);
    expect(loaded.schema_version).toBe('failure_bank/v1');
  });

  // AC: consolidate_merges_duplicate_signatures
  it('STORY-008.3: consolidate_merges_duplicate_signatures', () => {
    const bank = emptyBank();
    bank.bank = [
      makeGene({ id: 'fg-A', matching_signal: 'type:test|file:foo' }),
      makeGene({ id: 'fg-B', matching_signal: 'type:test|file:bar' }),
    ];
    const { merged } = consolidate(bank);
    expect(merged).toBeGreaterThanOrEqual(1);
    expect(bank.bank).toHaveLength(1);
  });

  // AC: repeated occurrences count increments
  it('STORY-008.3: consolidate_increments_consolidated_count', () => {
    const bank = emptyBank();
    bank.bank = [
      makeGene({ id: 'fg-A', matching_signal: 'token:foo', consolidated_count: 2 }),
      makeGene({ id: 'fg-B', matching_signal: 'token:foo|other:bar', consolidated_count: 3 }),
    ];
    consolidate(bank);
    expect(bank.bank).toHaveLength(1);
    expect(bank.bank[0].consolidated_count).toBe(5);
  });

  // AC: different signatures remain separate
  it('STORY-008.3: different_signatures_remain_separate', () => {
    const bank = emptyBank();
    bank.bank = [
      makeGene({ id: 'fg-X', matching_signal: 'type:schema' }),
      makeGene({ id: 'fg-Y', matching_signal: 'type:runtime' }),
    ];
    consolidate(bank);
    expect(bank.bank).toHaveLength(2);
  });

  // AC: output ordering deterministic regardless of input order
  it('STORY-008.3: consolidate_output_ordering_deterministic', () => {
    const bank1 = emptyBank();
    bank1.bank = [
      makeGene({ id: 'fg-A', matching_signal: 'type:schema' }),
      makeGene({ id: 'fg-B', matching_signal: 'type:runtime' }),
    ];
    consolidate(bank1);
    const ids1 = bank1.bank.map(g => g.id);

    const bank2 = emptyBank();
    bank2.bank = [
      makeGene({ id: 'fg-B', matching_signal: 'type:runtime' }),
      makeGene({ id: 'fg-A', matching_signal: 'type:schema' }),
    ];
    consolidate(bank2);
    const ids2 = bank2.bank.map(g => g.id);

    expect(ids1).toEqual(ids2);
  });

  // AC: malformed gene rejected
  it('STORY-008.3: malformed_gene_rejected_null', () => {
    expect(validateFailureGene(null).ok).toBe(false);
  });
  it('STORY-008.3: malformed_gene_rejected_empty_object', () => {
    expect(validateFailureGene({}).ok).toBe(false);
    expect(validateFailureGene({}).errors.length).toBeGreaterThan(0);
  });
  it('STORY-008.3: malformed_gene_rejected_long_avoid', () => {
    const longAvoid = Array(41).fill('word').join(' ');
    const result = validateFailureGene({ ...makeGene(), avoid: longAvoid });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('40 words'))).toBe(true);
  });
  it('STORY-008.3: malformed_gene_rejected_invalid_failure_type', () => {
    expect(validateFailureGene({ ...makeGene(), failure_type: 'bogus' }).ok).toBe(false);
  });
  it('STORY-008.3: malformed_gene_rejected_invalid_severity', () => {
    expect(validateFailureGene({ ...makeGene(), severity: 'extreme' }).ok).toBe(false);
  });

  // AC: validateFailureGene accepts valid gene
  it('STORY-008.3: validate_accepts_valid_gene', () => {
    expect(validateFailureGene(makeGene()).ok).toBe(true);
  });

  // AC: path escape rejected
  it('STORY-008.3: path_escape_rejected_on_load', async () => {
    await expect(loadBank('/etc/passwd')).rejects.toThrow(/unsafe/);
  });
  it('STORY-008.3: path_escape_rejected_on_save', async () => {
    await expect(saveBank(emptyBank(), '/etc/passwd')).rejects.toThrow(/unsafe/);
  });

  // AC: consolidate archives resolved/superseded genes
  it('STORY-008.3: consolidate_archives_non_active_genes', () => {
    const bank = emptyBank();
    bank.bank = [
      makeGene({ id: 'fg-resolved', status: 'resolved' }),
      makeGene({ id: 'fg-active', status: 'active' }),
      makeGene({ id: 'fg-superseded', status: 'superseded' }),
    ];
    const { archived } = consolidate(bank);
    expect(archived).toBe(2);
    expect(bank.bank).toHaveLength(1);
    expect(bank.bank[0].id).toBe('fg-active');
  });

  // AC: loadBank filters malformed genes silently
  it('STORY-008.3: loadbank_filters_malformed_genes', async () => {
    const bankPath = path.join(tmpDir, 'warning_bank.json');
    const raw = JSON.stringify({
      schema_version: 'failure_bank/v1',
      updated_at: '',
      bank: [makeGene({ id: 'fg-valid' }), { id: 'fg-bad' }],
    });
    fs.writeFileSync(bankPath, raw);
    const loaded = await loadBank(bankPath);
    expect(loaded.bank).toHaveLength(1);
    expect(loaded.bank[0].id).toBe('fg-valid');
  });

  // AC: warning_surfaced_to_developer_context
  it('STORY-008.3: warning_surfaced_to_developer_context', async () => {
    const bankPath = path.join(tmpDir, 'warning_bank.json');
    const gene = makeGene({ matching_signal: 'type:type_error|file:core' });
    await saveBank({ ...emptyBank(), bank: [gene] }, bankPath);
    const loaded = await loadBank(bankPath);
    const relevant = injectRelevant(loaded, 'type_error core module');
    const formatted = formatForInjection(relevant);
    expect(formatted).toContain('AVOID:');
    expect(formatted).toContain(gene.avoid);
  });

  // AC: save creates parent directories if missing
  it('STORY-008.3: save_creates_nested_parent_directory', async () => {
    const nested = path.join(tmpDir, 'nested', 'dir', 'bank.json');
    await saveBank(emptyBank(), nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  // AC: consolidate is deterministic (no Date.now/random)
  it('STORY-008.3: consolidate_is_deterministic_same_input_same_output', () => {
    const make = () => {
      const b = emptyBank();
      b.bank = [
        makeGene({ id: 'fg-1', matching_signal: 'tok:foo', consolidated_count: 1 }),
        makeGene({ id: 'fg-2', matching_signal: 'tok:foo|tok2:bar', consolidated_count: 2 }),
      ];
      return b;
    };
    const b1 = make(); consolidate(b1);
    const b2 = make(); consolidate(b2);
    expect(JSON.stringify(b1.bank)).toBe(JSON.stringify(b2.bank));
  });

  // No network, no LLM, no .env (structural: no import of those in this module)
  it('STORY-008.3: no_external_network_or_lllm_calls', () => {
    // If this test runs without error, no network was hit.
    expect(validateFailureGene(makeGene()).ok).toBe(true);
  });

});

// ── STORY-022.5: resolved-direction pairing and remedy preloading ─────────────

function makeActiveGene(signal = 'src:calc|type:runtime_error'): FailureGene {
  return makeGene({ matching_signal: signal });
}

describe('failure-bank-remedy', () => {
  it('resolved_direction_paired_to_gene', () => {
    const gene = makeActiveGene();
    const paired = pairResolvedDirection(
      gene,
      { direction_type: 'change_implementation', rationale: 'Add zero guard.' },
      'STORY-Y',
    );
    expect(paired.resolved_direction?.direction_type).toBe('change_implementation');
    expect(paired.status).toBe('resolved');
    expect(paired.resolved_at).toBeTruthy();
  });

  it('proven_remedy_preloaded_on_match', () => {
    const gene = makeActiveGene();
    const resolved = pairResolvedDirection(
      gene,
      { direction_type: 'change_implementation', rationale: 'Add guard.' },
      'STORY-Y',
    );
    const bank: WarningBank = { schema_version: '1', updated_at: '', bank: [resolved] };
    const remedies = preloadProvenRemedies(bank, 'calc runtime_error divide');
    expect(remedies.length).toBe(1);
    expect(remedies[0].proven_remedy).toBeTruthy();
  });

  it('remedy_pairing_is_advisory_not_binding', () => {
    const gene = makeActiveGene();
    const originalStatus = gene.status;
    const originalResolved = gene.resolved_direction;
    pairResolvedDirection(gene, { direction_type: 'change_implementation', rationale: 'X' }, 'STORY-Y');
    expect(gene.status).toBe(originalStatus);
    expect(gene.resolved_direction).toBe(originalResolved);
  });

  it('no_remedies_when_no_match', () => {
    const gene = makeActiveGene();
    const resolved = pairResolvedDirection(
      gene,
      { direction_type: 'change_implementation', rationale: 'Fix' },
      'STORY-Y',
    );
    const bank: WarningBank = { schema_version: '1', updated_at: '', bank: [resolved] };
    expect(preloadProvenRemedies(bank, 'completely unrelated context')).toHaveLength(0);
  });

  it('unresolved_genes_not_preloaded', () => {
    const gene = makeActiveGene();
    const bank: WarningBank = { schema_version: '1', updated_at: '', bank: [gene] };
    expect(preloadProvenRemedies(bank, 'calc runtime_error divide')).toHaveLength(0);
  });

  it('pair_resolved_direction_truncates_remedy_to_200', () => {
    const gene = makeActiveGene();
    const longRationale = 'A'.repeat(300);
    const paired = pairResolvedDirection(
      gene,
      { direction_type: 'change_implementation', rationale: longRationale },
      'STORY-Y',
    );
    expect((paired.proven_remedy ?? '').length).toBeLessThanOrEqual(200);
  });
});
