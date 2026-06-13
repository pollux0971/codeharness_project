// Failure Gene Bank.
// The Debugger writes genes; the Context Manager reads them.
// Key invariants from GEP/Evolver:
//   - selective, not additive: dedupe by matching_signal, don't stack entries
//   - inject AVOID only, not full diagnostic history
//   - consolidated_count >= 2 means systemic — escalate earlier
import fs from 'node:fs';
import path from 'node:path';

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
  resolved_direction?: {
    direction_type: string;
    rationale_summary: string;
    resolved_in_story: string;
  } | null;
  proven_remedy?: string | null;  // compact ≤200 char summary of what worked; injected as hint
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
 * Consolidate the bank: merge active genes that share any matching_signal token,
 * and remove resolved/superseded genes. Output order is deterministic (sorted by id).
 * Does not call Date.now() or Math.random().
 */
export function consolidate(bank: WarningBank): { merged: number; archived: number } {
  let mergedCount = 0;
  // Archive non-active genes
  const archived = bank.bank.filter(g => g.status !== 'active').length;
  let active = bank.bank.filter(g => g.status === 'active');

  // Sort by id for deterministic merge order
  active = active.slice().sort((a, b) => a.id.localeCompare(b.id));

  const used = new Set<number>();
  const result: FailureGene[] = [];

  for (let i = 0; i < active.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const base = { ...active[i] };
    const tokensI = base.matching_signal.split('|').map(t => t.trim());

    for (let j = i + 1; j < active.length; j++) {
      if (used.has(j)) continue;
      const tokensJ = active[j].matching_signal.split('|').map(t => t.trim());
      if (tokensI.some(t => tokensJ.includes(t))) {
        base.consolidated_count += active[j].consolidated_count;
        base.version += 1;
        if (active[j].avoid.length > base.avoid.length) base.avoid = active[j].avoid;
        used.add(j);
        mergedCount++;
      }
    }

    result.push(base);
  }

  bank.bank = result;
  return { merged: mergedCount, archived };
}

/** Check whether `gene.consolidated_count` marks a recurring/systemic pattern. */
export function isSystemic(gene: FailureGene, cfg: BankConfig = DEFAULT_CONFIG): boolean {
  return gene.consolidated_count >= cfg.recurringThreshold;
}

/**
 * Pure function: returns a copy of `gene` paired with the given resolved direction.
 * Sets `status` to 'resolved', `resolved_at` to now, and `proven_remedy` to the
 * first 200 chars of the direction rationale. Does not mutate the original.
 */
export function pairResolvedDirection(
  gene: FailureGene,
  direction: { direction_type: string; rationale: string },
  resolvedInStory: string,
): FailureGene {
  return {
    ...gene,
    resolved_direction: {
      direction_type: direction.direction_type,
      rationale_summary: direction.rationale.slice(0, 200),
      resolved_in_story: resolvedInStory,
    },
    proven_remedy: direction.rationale.slice(0, 200),
    status: 'resolved',
    resolved_at: new Date().toISOString(),
  };
}

/**
 * Return up to `maxRemedies` resolved genes whose signal matches `context`,
 * sorted descending by consolidated_count (most recurring resolved first).
 */
export function preloadProvenRemedies(
  bank: WarningBank,
  context: string,
  maxRemedies: number = 3,
): { gene: FailureGene; proven_remedy: string }[] {
  return bank.bank
    .filter(g => g.status === 'resolved' && g.proven_remedy != null && g.proven_remedy !== '' && signalMatches(g, context))
    .sort((a, b) => b.consolidated_count - a.consolidated_count)
    .slice(0, maxRemedies)
    .map(g => ({ gene: g, proven_remedy: g.proven_remedy! }));
}

// ── Validation ─────────────────────────────────────────────────────────────

export interface ValidationResult { ok: boolean; errors: string[] }

const VALID_FAILURE_TYPES = new Set<string>([
  'test_failure','build_error','type_error','runtime_error','validation_fail',
  'regression','timeout','scope_error','skill_failure','unknown',
]);
const VALID_SEVERITIES = new Set<string>(['fatal','recoverable','warning']);
const VALID_STATUSES   = new Set<string>(['active','resolved','superseded']);
const REQUIRED_FIELDS  = ['id','matching_signal','summary','strategy','avoid','failure_type','severity','story_id','version','created_at','status'];

/** Validate a candidate FailureGene. Returns machine-readable errors. */
export function validateFailureGene(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['not an object'] };
  const g = input as Record<string, unknown>;
  for (const f of REQUIRED_FIELDS) {
    if (g[f] === undefined || g[f] === null) errors.push(`missing required field: ${f}`);
  }
  if (typeof g['avoid'] === 'string' && g['avoid'].trim().split(/\s+/).length > 40)
    errors.push('avoid exceeds 40 words');
  if (typeof g['failure_type'] === 'string' && !VALID_FAILURE_TYPES.has(g['failure_type']))
    errors.push(`invalid failure_type: ${g['failure_type']}`);
  if (typeof g['severity'] === 'string' && !VALID_SEVERITIES.has(g['severity']))
    errors.push(`invalid severity: ${g['severity']}`);
  if (typeof g['status'] === 'string' && !VALID_STATUSES.has(g['status']))
    errors.push(`invalid status: ${g['status']}`);
  return { ok: errors.length === 0, errors };
}

// ── Persistence boundary ───────────────────────────────────────────────────

const UNSAFE_PREFIXES = ['/etc', '/proc', '/sys', '/root', '/dev'];

function assertSafePath(p: string): void {
  const resolved = path.resolve(p);
  if (UNSAFE_PREFIXES.some(d => resolved === d || resolved.startsWith(d + '/')))
    throw new Error(`unsafe bank path rejected: ${resolved}`);
  if (path.basename(resolved) === '.env')
    throw new Error(`unsafe bank path rejected: ${resolved}`);
}

/** Load the warning bank from a JSON file. Returns an empty bank if the file does not exist.
 *  Silently drops malformed genes. */
export async function loadBank(bankPath: string): Promise<WarningBank> {
  assertSafePath(bankPath);
  if (!fs.existsSync(bankPath)) {
    return { schema_version: 'failure_bank/v1', updated_at: '', bank: [] };
  }
  const raw = fs.readFileSync(bankPath, 'utf8');
  const parsed = JSON.parse(raw) as WarningBank;
  parsed.bank = parsed.bank.filter(g => validateFailureGene(g).ok);
  return parsed;
}

/** Persist the warning bank to a JSON file. Creates parent directories as needed. */
export async function saveBank(bank: WarningBank, bankPath: string): Promise<void> {
  assertSafePath(bankPath);
  const dir = path.dirname(bankPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2) + '\n', 'utf8');
}
