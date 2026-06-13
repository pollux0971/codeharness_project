/**
 * @codeharness/validator-suite
 * Deterministic structural validators + promotion/secret/stub-registry checks.
 * The Test Runner (separate) executes a story's validation_commands for runtime PASS/FAIL.
 * Owner: STORY-000.3.
 */
import { execFileSync } from 'node:child_process';
import type { HarnessSettings } from '@codeharness/settings';

export interface ValidationResult { ok: boolean; errors: string[] }
const isNonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

export function requiredPlanningBundleFiles(): string[] {
  return ['00_idea_record.md','01_classification.md','02_required_documents.md','03_epic_story_graph.md',
    '04_parallelism_plan.md','05_integration_plan.md','06_rollback_plan.md','07_context_compaction_plan.md',
    '08_supervisor_contract_draft.md','09_acceptance_checklist.md'];
}

/** Check that a planning bundle contains every required file; reports ALL missing files, not just first. */
export function validatePlanningBundle(presentFiles: string[]): ValidationResult {
  const missing = requiredPlanningBundleFiles()
    .filter(f => !presentFiles.includes(f))
    .map(f => `missing bundle file: ${f}`);
  return { ok: missing.length === 0, errors: missing };
}

/** A contract is development-ready only with these — and arrays must be NON-EMPTY,
 *  rollback_notes non-trivial, and acceptance_criteria machine-checkable (Codex #6). */
export function validateStoryContract(c: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];
  if (!c.objective) errors.push('missing: objective');
  if (!isNonEmptyArray(c.allowed_write_set)) errors.push('allowed_write_set must be a non-empty array');
  if (!isNonEmptyArray(c.validation_commands)) errors.push('validation_commands must be a non-empty array');
  if (!validateAcceptanceCriteria(c.acceptance_criteria).ok) errors.push('acceptance_criteria not machine-checkable');
  if (typeof c.rollback_notes !== 'string' || (c.rollback_notes as string).trim().length < 8) errors.push('rollback_notes too vague');
  if (!validateForbiddenActions((c.forbidden_actions as string[]) ?? []).ok) errors.push('forbidden_actions missing required guards');
  return { ok: errors.length === 0, errors };
}

/** Machine-checkable acceptance criteria must carry at least one concrete check list. */
export function validateAcceptanceCriteria(ac: unknown): ValidationResult {
  const o = ac as Record<string, unknown> | undefined;
  const hasList = !!o && (isNonEmptyArray(o.files_must_exist) || isNonEmptyArray(o.behaviors_must_pass) || isNonEmptyArray(o.commands_must_pass));
  return hasList ? { ok: true, errors: [] } : { ok: false, errors: ['acceptance_criteria needs files_must_exist / behaviors_must_pass / commands_must_pass'] };
}

const REQUIRED_GUARDS = ['secret', 'sudo', 'api'];
/** forbidden_actions must forbid reading secrets, sudo, and real API calls. */
export function validateForbiddenActions(forbidden: string[]): ValidationResult {
  const joined = forbidden.join(' ').toLowerCase();
  const missing = REQUIRED_GUARDS.filter(g => !joined.includes(g)).map(g => `missing guard: no ${g}`);
  return { ok: missing.length === 0, errors: missing };
}

const need = (o: Record<string, unknown>, keys: string[]): string[] =>
  keys.filter(k => o[k] === undefined || o[k] === null || o[k] === '').map(k => `missing: ${k}`);
export function validateTaskPacket(p: Record<string, unknown>): ValidationResult {
  const e = need(p, ['packet_id','story_id','story_contract_ref','target_agent','context_packet','output_required']);
  return { ok: e.length === 0, errors: e };
}
export function validatePatchProposal(p: Record<string, unknown>): ValidationResult {
  const e = need(p, ['proposal_id','story_id','contract_id','change_type','changed_files']);
  return { ok: e.length === 0, errors: e };
}
export function validateWriteSet(changedFiles: string[], allowedWriteSet: string[]): ValidationResult {
  const match = (p: string) => allowedWriteSet.some(g => new RegExp('^' +
    g.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*/g,'§').replace(/\*/g,'[^/]*').replace(/§/g,'.*') + '$').test(p));
  const e = changedFiles.filter(f => !match(f)).map(f => `outside write-set: ${f}`);
  return { ok: e.length === 0, errors: e };
}
export function validateTraceSchema(e: Record<string, unknown>): ValidationResult {
  const m = need(e, ['event_id','run_id','type','timestamp']); return { ok: m.length === 0, errors: m };
}
const SECRET = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|password\s*[:=])/i;
export function validateNoSecretLeak(text: string): ValidationResult {
  return SECRET.test(text) ? { ok: false, errors: ['possible secret in artifact'] } : { ok: true, errors: [] };
}
export function validatePromotionGate(g: {
  validationPassed: boolean; rollbackPlanPresent: boolean; tracePresent: boolean;
  secretHygienePassed: boolean; promotionAllowed: boolean; humanApproved: boolean;
}): ValidationResult {
  const e: string[] = [];
  if (!g.validationPassed) e.push('validation not passed');
  if (!g.rollbackPlanPresent) e.push('rollback plan missing');
  if (!g.tracePresent) e.push('raw trace missing');
  if (!g.secretHygienePassed) e.push('secret hygiene failed');
  if (!g.promotionAllowed) e.push('promotion_allowed is false');
  if (!g.humanApproved) e.push('human approval required');
  return { ok: e.length === 0, errors: e };
}

// ── STORY-013.3: Quality Bar ─────────────────────────────────────────────────

export type QualityBarCheck = 'build' | 'test' | 'typecheck' | 'coverage';

export interface QualityBarConfig {
  required_checks: QualityBarCheck[];
  coverage_threshold?: number;
}

export const DEFAULT_QUALITY_BAR: QualityBarConfig = {
  required_checks: ['build', 'test', 'typecheck'],
};

// ── STORY-021.3: Settings-derived quality-bar configuration ──────────────

export function qualityBarConfigFromSettings(settings: HarnessSettings): QualityBarConfig {
  const checks = settings.quality_bar?.greenfield ?? DEFAULT_QUALITY_BAR.required_checks;
  return { required_checks: checks };
}

export interface QualityBarCheckResult {
  check: QualityBarCheck;
  passed: boolean;
  output: string;
}

export interface QualityBarResult {
  ok: boolean;
  config: QualityBarConfig;
  results: QualityBarCheckResult[];
  errors: string[];
}

export interface QualityBarRunner {
  build(): Promise<{ passed: boolean; output: string }>;
  test(): Promise<{ passed: boolean; output: string }>;
  typecheck(): Promise<{ passed: boolean; output: string }>;
  coverage?(): Promise<{ passed: boolean; output: string; percent?: number }>;
}

export async function runQualityBar(
  config: QualityBarConfig,
  runner: QualityBarRunner
): Promise<QualityBarResult> {
  const checkResults = await Promise.all(
    config.required_checks.map(async (check): Promise<QualityBarCheckResult> => {
      try {
        if (check === 'coverage') {
          const raw = await runner.coverage!();
          let { passed, output } = raw;
          if (config.coverage_threshold !== undefined && config.coverage_threshold !== null) {
            if (raw.percent !== undefined && raw.percent < config.coverage_threshold) {
              passed = false;
              output = `${output} coverage below threshold: ${raw.percent}% < ${config.coverage_threshold}%`;
            }
          }
          return { check, passed, output };
        }
        const raw = await runner[check]();
        return { check, passed: raw.passed, output: raw.output };
      } catch (err) {
        return { check, passed: false, output: err instanceof Error ? err.message : String(err) };
      }
    })
  );

  const ok = checkResults.every(r => r.passed);
  const errors = checkResults.filter(r => !r.passed).map(r => `${r.check}: ${r.output}`);
  return { ok, config, results: checkResults, errors };
}

export function validateQualityBar(result: QualityBarResult): ValidationResult {
  const errors = result.results
    .filter(r => !r.passed)
    .map(r => `quality bar check failed: ${r.check} — ${r.output}`);
  return { ok: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface StubRef { symbol: string; file: string }
export interface StubRegistryEntry { symbol: string; file: string; owner: string }
/** Every documented `not implemented` stub MUST be registered with an owner that is a
 *  known builder story or roadmap id (Codex: no stub without a story). */
export function validateDocumentedStubsHaveStory(
  found: StubRef[], registry: StubRegistryEntry[], knownOwners: Set<string>
): ValidationResult {
  const errors: string[] = [];
  for (const s of found) {
    const entry = registry.find(r => r.symbol === s.symbol && r.file === s.file);
    if (!entry) { errors.push(`unregistered stub: ${s.symbol} (${s.file})`); continue; }
    if (!knownOwners.has(entry.owner)) errors.push(`stub ${s.symbol} owner not found: ${entry.owner}`);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * HARD gate the Developer must pass BEFORE submitting a proposal to the Validator:
 * proposal schema + changed_files ⊆ write-set + contract acceptance machine-checkable +
 * rollback present. If it fails, the Developer fixes the proposal or escalates — it must
 * NOT reach the Validator malformed.
 */
export function specConformanceGate(input: {
  proposal: Record<string, unknown>;
  contract: { allowed_write_set?: string[]; acceptance_criteria?: unknown };
}): ValidationResult {
  const errors: string[] = [];
  errors.push(...validatePatchProposal(input.proposal).errors.map(e => `proposal: ${e}`));
  const changed = (input.proposal.changed_files as string[]) ?? [];
  errors.push(...validateWriteSet(changed, input.contract.allowed_write_set ?? []).errors.map(e => `write-set: ${e}`));
  errors.push(...validateAcceptanceCriteria(input.contract.acceptance_criteria).errors.map(e => `acceptance: ${e}`));
  if (!input.proposal.rollback_notes) errors.push('proposal: missing rollback_notes');
  return { ok: errors.length === 0, errors };
}

// ── STORY-017.2: Integration validation runner ───────────────────────────────

export interface IntegrationValidationResult {
  ok: boolean;
  errors: string[];
  command_run: string;
}

export async function runIntegrationValidation(
  command: string,
  cwd: string,
  runner?: (cmd: string, cwd: string) => Promise<{ ok: boolean; output: string }>,
): Promise<IntegrationValidationResult> {
  if (runner) {
    const result = await runner(command, cwd);
    return { ok: result.ok, errors: result.ok ? [] : [result.output], command_run: command };
  }
  try {
    const parts = command.split(' ');
    execFileSync(parts[0], parts.slice(1), { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { ok: true, errors: [], command_run: command };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, errors: [msg], command_run: command };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// ── STORY-020.2: Task-class bundle validation ────────────────────────────────

export interface TaskClassValidationResult {
  ok: boolean;
  errors: string[];
}

interface BrownfieldDeltaLike { file: string; affected_symbols: string[]; change_intent: string }
interface PublicApiConstraintLike { frozen_paths: string[]; reason: string }
interface TaskClassBundleInput {
  story_id: string;
  depends_on: string[];
  allowed_write_set: string[];
  parallelism_class?: string;
  task_class?: string;
  brownfield_deltas?: BrownfieldDeltaLike[];
  public_api_constraint?: PublicApiConstraintLike;
}

function normGlob(g: string): string {
  return g.replace(/\*.*$/, '').replace(/\/$/, '');
}

function globsOverlap(a: string, b: string): boolean {
  const na = normGlob(a), nb = normGlob(b);
  return na.startsWith(nb) || nb.startsWith(na) || na === nb;
}

export function validateTaskClassBundle(story: TaskClassBundleInput): TaskClassValidationResult {
  const errors: string[] = [];
  if (story.task_class === 'brownfield') {
    const deltas = story.brownfield_deltas ?? [];
    if (deltas.length === 0) {
      errors.push('brownfield story must declare at least one delta');
    }
  }
  if (story.public_api_constraint) {
    const { frozen_paths } = story.public_api_constraint;
    for (const writePath of story.allowed_write_set) {
      for (const frozenGlob of frozen_paths) {
        if (globsOverlap(writePath, frozenGlob)) {
          errors.push(`write-set violates public_api_constraint: ${writePath}`);
          break;
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// ── STORY-020.4: Brownfield validator — baseline-relative quality bar ─────────

export interface TestResult {
  name: string;
  passed: boolean;
  output?: string;
}

export interface TestBaseline {
  captured_at: string;
  passing: string[];
  failing: string[];
  total: number;
}

export interface BaselineRunner {
  runTests(): Promise<TestResult[]>;
}

export interface BrownfieldValidationResult {
  ok: boolean;
  new_failures: string[];
  flaky_candidates: string[];
  baseline_failures: string[];
  errors: string[];
}

export async function captureBaseline(runner: BaselineRunner): Promise<TestBaseline> {
  const results = await runner.runTests();
  const passing = results.filter(r => r.passed).map(r => r.name);
  const failing = results.filter(r => !r.passed).map(r => r.name);
  return { captured_at: new Date().toISOString(), passing, failing, total: results.length };
}

export async function validateBrownfieldChange(
  baseline: TestBaseline,
  runner: BaselineRunner
): Promise<BrownfieldValidationResult> {
  const post = await captureBaseline(runner);
  const new_failures = post.failing.filter(t => baseline.passing.includes(t));
  const flaky_candidates = post.passing.filter(t => baseline.failing.includes(t));
  return {
    ok: new_failures.length === 0,
    new_failures,
    flaky_candidates,
    baseline_failures: baseline.failing,
    errors: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────

// ── STORY-022.1: Diagnosis report schema and validator gate ──────────────────

export type FailureClassification =
  | 'test_assertion_mismatch' | 'type_error' | 'build_error'
  | 'runtime_exception' | 'spec_conformance_failure' | 'scope_error'
  | 'flaky_test' | 'environment_issue' | 'unknown';

export type DirectionType =
  | 'change_implementation' | 'tighten_test' | 'widen_write_set'
  | 'clarify_spec' | 'add_prereq_check';

export interface RootCauseHypothesis {
  hypothesis: string;
  confidence: number;
  evidence_lines: string[];
}

export interface ImprovementDirection {
  direction_type: DirectionType;
  rationale: string;
  affected_files: string[];
}

export interface DiagnosisReport {
  report_id: string;
  story_id: string;
  failure_classification: FailureClassification;
  root_cause_hypotheses: RootCauseHypothesis[];
  improvement_directions: ImprovementDirection[];
  do_not_touch: string[];
  referenced_gene_signals: string[];
  reviewer_model: string;
  reviewed_at: string;
}

const FAILURE_CLASSIFICATIONS: FailureClassification[] = [
  'test_assertion_mismatch', 'type_error', 'build_error',
  'runtime_exception', 'spec_conformance_failure', 'scope_error',
  'flaky_test', 'environment_issue', 'unknown',
];

const DIRECTION_TYPES: DirectionType[] = [
  'change_implementation', 'tighten_test', 'widen_write_set',
  'clarify_spec', 'add_prereq_check',
];

export function validateDiagnosisReport(report: unknown): ValidationResult {
  const errors: string[] = [];

  if (report === null || report === undefined || typeof report !== 'object' || Array.isArray(report)) {
    return { ok: false, errors: ['report must be a non-null object'] };
  }
  const r = report as Record<string, unknown>;

  if (typeof r.report_id !== 'string' || !r.report_id.trim()) errors.push('missing: report_id');
  if (typeof r.story_id !== 'string' || !r.story_id.trim()) errors.push('missing: story_id');
  if (!FAILURE_CLASSIFICATIONS.includes(r.failure_classification as FailureClassification)) {
    errors.push('failure_classification is invalid or missing');
  }
  if (typeof r.reviewer_model !== 'string' || !r.reviewer_model.trim()) errors.push('missing: reviewer_model');
  if (typeof r.reviewed_at !== 'string' || !r.reviewed_at.trim()) errors.push('missing: reviewed_at');
  if (!Array.isArray(r.do_not_touch)) errors.push('do_not_touch must be an array');
  if (!Array.isArray(r.referenced_gene_signals)) errors.push('referenced_gene_signals must be an array');

  if (!Array.isArray(r.root_cause_hypotheses) || r.root_cause_hypotheses.length === 0) {
    errors.push('root_cause_hypotheses must be a non-empty array');
  } else {
    (r.root_cause_hypotheses as unknown[]).forEach((item, i) => {
      const h = item as Record<string, unknown>;
      if (typeof h.hypothesis !== 'string' || h.hypothesis.length < 10) {
        errors.push(`root_cause_hypotheses[${i}].hypothesis must be at least 10 characters`);
      }
      if (typeof h.confidence !== 'number' || h.confidence < 0 || h.confidence > 1) {
        errors.push(`root_cause_hypotheses[${i}].confidence must be a number in [0, 1]`);
      }
      if (!Array.isArray(h.evidence_lines)) {
        errors.push(`root_cause_hypotheses[${i}].evidence_lines must be an array`);
      }
    });
  }

  if (!Array.isArray(r.improvement_directions) || r.improvement_directions.length === 0) {
    errors.push('improvement_directions must be a non-empty array');
  } else {
    (r.improvement_directions as unknown[]).forEach((item, i) => {
      const d = item as Record<string, unknown>;
      if (!DIRECTION_TYPES.includes(d.direction_type as DirectionType)) {
        errors.push(`improvement_directions[${i}].direction_type is invalid or missing`);
      }
      if (typeof d.rationale !== 'string' || d.rationale.length < 10) {
        errors.push(`improvement_directions[${i}].rationale must be at least 10 characters`);
      }
      if (!Array.isArray(d.affected_files)) {
        errors.push(`improvement_directions[${i}].affected_files must be an array`);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * STORY-009.3: Gate that validates a PlanningBundle object before backlog emission.
 * Deterministically rejects:
 *   - malformed bundles (missing required fields or invalid structure)
 *   - prose-only acceptance criteria (prd must have goals or non_goals, same rule as STORY-006.1)
 *   - bundles with unresolved open decisions (ambiguity blocks backlog emission)
 * No LLM, no external API, no side effects. Error ordering is deterministic.
 */
export function planningBundleValidationGate(bundle: unknown): ValidationResult {
  const errors: string[] = [];

  // malformed_bundle_rejected: top-level type check
  if (bundle === null || bundle === undefined || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return { ok: false, errors: ['bundle must be a non-null object'] };
  }
  const b = bundle as Record<string, unknown>;

  if (typeof b.bundle_id !== 'string' || !(b.bundle_id as string).trim()) errors.push('bundle: missing or empty bundle_id');
  if (typeof b.idea_id !== 'string' || !(b.idea_id as string).trim()) errors.push('bundle: missing or empty idea_id');

  // malformed_bundle_rejected + prose_acceptance_rejected: prd must be structured and machine-checkable
  const prd = b.prd;
  if (!prd || typeof prd !== 'object' || Array.isArray(prd)) {
    errors.push('bundle: missing prd');
  } else {
    const p = prd as Record<string, unknown>;
    if (typeof p.title !== 'string' || !(p.title as string).trim()) errors.push('bundle.prd: missing title');
    if (typeof p.problem_statement !== 'string' || !(p.problem_statement as string).trim()) errors.push('bundle.prd: missing problem_statement');
    // prose_acceptance_rejected: same rule as STORY-006.1 — at least one structured criterion required
    if (!isNonEmptyArray(p.goals) && !isNonEmptyArray(p.non_goals)) {
      errors.push('bundle.prd: acceptance criteria not machine-checkable — goals or non_goals required');
    }
  }

  // malformed_bundle_rejected: architecture must exist with at least one component
  const arch = b.architecture;
  if (!arch || typeof arch !== 'object' || Array.isArray(arch)) {
    errors.push('bundle: missing architecture');
  } else {
    const a = arch as Record<string, unknown>;
    if (!isNonEmptyArray(a.components)) errors.push('bundle.architecture: components must be a non-empty array');
  }

  // ambiguity_blocks_until_answered: open decisions must all be resolved before emission
  if (!Array.isArray(b.open_decisions)) {
    errors.push('bundle: open_decisions must be an array');
  } else if ((b.open_decisions as unknown[]).length > 0) {
    const count = (b.open_decisions as unknown[]).length;
    errors.push(`bundle: ${count} unresolved open decision(s) — resolve all before backlog emission`);
  }

  return { ok: errors.length === 0, errors };
}
