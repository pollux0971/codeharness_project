// Failure Gene Bank (skeleton).
// The Debugger writes genes; the Context Manager reads them.
// Key invariants from GEP/Evolver:
//   - selective, not additive: dedupe by matching_signal, don't stack entries
//   - inject AVOID only, not full diagnostic history
//   - consolidated_count >= 2 means systemic — escalate earlier

export type FailureType =
  | 'test_failure' | 'build_error' | 'type_error' | 'runtime_error'
  | 'validation_fail' | 'regression' | 'timeout' | 'scope_error'
  | 'skill_failure' | 'unknown';

export type RepairOperator = 'REBIND' | 'INSERT_PREREQ' | 'SUBSTITUTE' | 'REWIRE' | 'BYPASS' | 'none';
export type Severity = 'fatal' | 'recoverable' | 'warning';
export type GeneStatus = 'active' | 'resolved' | 'superseded';

export interface FailureGene {
  id: string;
  matching_signal: string;     // pipe-separated key:value tokens; any-token match
  summary: string;             // ≤1 sentence, ≤200 chars
  strategy: string;            // ≤1 sentence, ≤300 chars
  avoid: string;               // THE operative field — injected; ≤40 words, imperative
  failure_type: FailureType;
  repair_operator: RepairOperator;
  story_id: string;
  skill_id: string | null;
  severity: Severity;
  version: number;
  created_at: string;
  consolidated_count: number;  // 1 = first occurrence; ≥2 = recurring/systemic
  resolved_at: string | null;
  status: GeneStatus;
}

export interface WarningBank {
  schema_version: string;
  updated_at: string;
  bank: FailureGene[];
}

export interface BankConfig {
  maxActiveGenes: number;       // default 50
  maxGenesPerTurn: number;      // injected per developer turn, default 5
  recurringThreshold: number;   // consolidated_count >= this → systemic, default 2
}

export const DEFAULT_CONFIG: BankConfig = {
  maxActiveGenes: 50, maxGenesPerTurn: 5, recurringThreshold: 2,
};

// ── Core operations ────────────────────────────────────────────────────────

/**
 * Check whether the signal tokens of `gene` intersect with the context string.
 * Matching logic: split matching_signal on '|', trim; any token `key:value`
 * is a hit if the context contains the value substring.
 */
export function signalMatches(gene: FailureGene, context: string): boolean {
  const ctx = context.toLowerCase();
  return gene.matching_signal.split('|').some(token => {
    const value = token.trim().split(':').slice(1).join(':').trim().toLowerCase();
    return value.length > 0 && ctx.includes(value);
  });
}

/**
 * Add a gene to the bank, or merge with an existing gene if matching_signal
 * overlaps. "Selective, not additive" — never add a duplicate.
 * Returns 'added' | 'merged' | 'bank_full' (caller should consolidate first).
 */
export function bankGene(
  bank: WarningBank, gene: FailureGene, cfg: BankConfig = DEFAULT_CONFIG,
): 'added' | 'merged' | 'bank_full' {
  const active = bank.bank.filter(g => g.status === 'active');
  // look for an existing gene whose signal overlaps (any token match)
  const existing = active.find(g =>
    g.matching_signal.split('|').some(t => gene.matching_signal.includes(t.trim()))
  );
  if (existing) {
    existing.consolidated_count += 1;
    existing.version += 1;
    // Optionally strengthen avoid: if new gene's avoid is longer/different, keep it
    if (gene.avoid.length > existing.avoid.length) existing.avoid = gene.avoid;
    bank.updated_at = new Date().toISOString();
    return 'merged';
  }
  if (active.length >= cfg.maxActiveGenes) return 'bank_full';
  bank.bank.push({ ...gene, consolidated_count: 1 });
  bank.updated_at = new Date().toISOString();
  return 'added';
}

/**
 * Return at most `maxK` active genes that match the given context string,
 * sorted by severity (fatal > recoverable > warning), then by consolidated_count
 * descending (more recurring = more important to see).
 */
export function injectRelevant(
  bank: WarningBank, context: string, maxK: number = DEFAULT_CONFIG.maxGenesPerTurn,
): FailureGene[] {
  const order: Record<Severity, number> = { fatal: 0, recoverable: 1, warning: 2 };
  return bank.bank
    .filter(g => g.status === 'active' && signalMatches(g, context))
    .sort((a, b) =>
      order[a.severity] - order[b.severity] || b.consolidated_count - a.consolidated_count
    )
    .slice(0, maxK);
}

/**
 * Format the selected genes as the compact AVOID-only block injected into the
 * Developer's context (the model sees this, so keep it minimal).
 *
 * Output format:
 *   ## Known failure patterns for this context
 *   [fg-001] AVOID: Do NOT add barrel exports without verifying no cycles.
 *   [fg-003] AVOID: NEVER mutate shared config objects; clone first.
 */
export function formatForInjection(genes: FailureGene[]): string {
  if (genes.length === 0) return '';
  const lines = genes.map(g => `[${g.id}] AVOID: ${g.avoid}`);
  return `## Known failure patterns for this context\n${lines.join('\n')}`;
}

/**
 * Consolidate the bank when it exceeds maxActiveGenes.
 * Strategy: merge genes that share matching_signal tokens into one, keeping the
 * strongest AVOID and highest consolidated_count. Archive genes that are resolved
 * or have not been matched in > 30 days (stub — real cutoff from config).
 */
export function consolidate(bank: WarningBank): { merged: number; archived: number } {
  // Full implementation: cluster genes by signal-token overlap, merge each cluster,
  // move resolved/superseded to a separate archive structure.
  throw new Error('not implemented: bank consolidation (merge by signal overlap, archive stale)');
}

/** Check whether `gene.consolidated_count` marks a recurring/systemic pattern. */
export function isSystemic(gene: FailureGene, cfg: BankConfig = DEFAULT_CONFIG): boolean {
  return gene.consolidated_count >= cfg.recurringThreshold;
}

// ── Persistence boundary (delegate to the harness file layer) ──────────────

export async function loadBank(_bankPath: string): Promise<WarningBank> {
  throw new Error('not implemented: read docs/failure_bank/warning_bank.json');
}
export async function saveBank(_bank: WarningBank, _bankPath: string): Promise<void> {
  throw new Error('not implemented: write docs/failure_bank/warning_bank.json');
}
