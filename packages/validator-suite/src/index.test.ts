import { describe, it, expect } from 'vitest';
import {
  validateStoryContract, validateAcceptanceCriteria, validateForbiddenActions,
  validateWriteSet, validatePromotionGate, validateNoSecretLeak, validateDocumentedStubsHaveStory, specConformanceGate,
  validatePlanningBundle, requiredPlanningBundleFiles, planningBundleValidationGate,
  runQualityBar, validateQualityBar, DEFAULT_QUALITY_BAR,
  runIntegrationValidation,
  validateTaskClassBundle,
  captureBaseline, validateBrownfieldChange,
  qualityBarConfigFromSettings,
  validateDiagnosisReport,
  type QualityBarConfig, type QualityBarRunner, type TestResult, type BaselineRunner,
  type DiagnosisReport,
} from './index';
import { DEFAULT_SETTINGS } from '@codeharness/settings';

const goodContract = {
  objective: 'do x', allowed_write_set: ['pkg/src/**'], validation_commands: ['pnpm test'],
  acceptance_criteria: { behaviors_must_pass: ['a_returns_b'] },
  rollback_notes: 'revert the package change',
  forbidden_actions: ['no secret reads', 'no sudo', 'no real api'],
};
const gate = { validationPassed: true, rollbackPlanPresent: true, tracePresent: true, secretHygienePassed: true, promotionAllowed: true, humanApproved: true };

describe('validator-suite', () => {
  it('valid_story_contract_passes', () => expect(validateStoryContract(goodContract).ok).toBe(true));
  it('story_contract_missing_objective_fails', () => expect(validateStoryContract({ ...goodContract, objective: '' }).ok).toBe(false));
  it('story_contract_empty_write_set_fails', () => expect(validateStoryContract({ ...goodContract, allowed_write_set: [] }).ok).toBe(false));
  it('prose_acceptance_criteria_fails', () => expect(validateAcceptanceCriteria(['tests pass']).ok).toBe(false));
  it('machine_checkable_acceptance_criteria_passes', () => expect(validateAcceptanceCriteria({ commands_must_pass: ['pnpm test'] }).ok).toBe(true));
  it('forbidden_actions_without_guards_fails', () => expect(validateForbiddenActions(['be nice']).ok).toBe(false));
  it('forbidden_actions_with_guards_passes', () => expect(validateForbiddenActions(['no secret', 'no sudo', 'no api']).ok).toBe(true));
  it('write_set_subset_passes', () => expect(validateWriteSet(['pkg/src/a.ts'], ['pkg/src/**']).ok).toBe(true));
  it('write_set_violation_fails', () => expect(validateWriteSet(['other/x.ts'], ['pkg/src/**']).ok).toBe(false));
  it('promotion_gate_passes_when_all_met', () => expect(validatePromotionGate(gate).ok).toBe(true));
  it('promotion_gate_blocks_when_rollback_missing', () => expect(validatePromotionGate({ ...gate, rollbackPlanPresent: false }).ok).toBe(false));
  it('promotion_gate_blocks_without_human_approval', () => expect(validatePromotionGate({ ...gate, humanApproved: false }).ok).toBe(false));
  it('secret_leak_detected', () => expect(validateNoSecretLeak('key sk-ABCDEFGH1234567890').ok).toBe(false));
  it('documented_stub_unregistered_fails', () => {
    const r = validateDocumentedStubsHaveStory([{ symbol: 'foo', file: 'a.ts' }], [], new Set());
    expect(r.ok).toBe(false);
  });
  it('documented_stub_registered_with_known_owner_passes', () => {
    const r = validateDocumentedStubsHaveStory(
      [{ symbol: 'foo', file: 'a.ts' }], [{ symbol: 'foo', file: 'a.ts', owner: 'STORY-1' }], new Set(['STORY-1']));
    expect(r.ok).toBe(true);
  });
});

describe('validator-suite write-set glob coverage', () => {
  it('glob_exact_file_path_matches', () => expect(validateWriteSet(['pkg/src/index.ts'], ['pkg/src/index.ts']).ok).toBe(true));
  it('glob_exact_file_path_rejects_other', () => expect(validateWriteSet(['pkg/src/other.ts'], ['pkg/src/index.ts']).ok).toBe(false));
  it('glob_single_star_matches_one_segment', () => expect(validateWriteSet(['a.ts'], ['*.ts']).ok).toBe(true));
  it('glob_single_star_does_not_cross_slash', () => expect(validateWriteSet(['a/b.ts'], ['*.ts']).ok).toBe(false));
  it('glob_double_star_matches_nested', () => expect(validateWriteSet(['docs/a/b/c.md'], ['docs/**']).ok).toBe(true));
  it('glob_pkg_src_recursive_matches', () => expect(validateWriteSet(['packages/foo/src/deep/x.ts'], ['packages/foo/src/**']).ok).toBe(true));
  it('glob_pkg_src_recursive_rejects_outside', () => expect(validateWriteSet(['packages/bar/src/x.ts'], ['packages/foo/src/**']).ok).toBe(false));
});

describe('STORY-000.3 planning bundle validator', () => {
  it('STORY-000.3 planning_bundle_complete_validates_ok', () =>
    expect(validatePlanningBundle(requiredPlanningBundleFiles()).ok).toBe(true));

  it('STORY-000.3 planning_bundle_missing_files_reports_all_errors', () => {
    const r = validatePlanningBundle([]);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(requiredPlanningBundleFiles().length);
    for (const f of requiredPlanningBundleFiles()) {
      expect(r.errors.some(e => e.includes(f))).toBe(true);
    }
  });

  it('STORY-000.3 planning_bundle_partial_reports_only_missing', () => {
    const present = requiredPlanningBundleFiles().slice(0, 5);
    const r = validatePlanningBundle(present);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(requiredPlanningBundleFiles().length - 5);
  });

  it('STORY-000.3 story_contract_reports_all_errors_not_just_first', () => {
    const r = validateStoryContract({ objective: '', allowed_write_set: [], validation_commands: [] });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(1);
  });

  it('STORY-000.3 validation_report_ordering_is_deterministic', () => {
    const input = ['03_epic_story_graph.md', '00_idea_record.md'];
    const r1 = validatePlanningBundle(input);
    const r2 = validatePlanningBundle(input);
    expect(r1.errors).toEqual(r2.errors);
  });
});

describe('validator-suite spec-conformance gate', () => {
  const contract = { allowed_write_set: ['pkg/src/**'], acceptance_criteria: { behaviors_must_pass: ['a_b'] } };
  const goodProposal = { proposal_id: 'p', story_id: 's', contract_id: 'c', change_type: 'ADD', changed_files: ['pkg/src/x.ts'], rollback_notes: 'revert it' };
  it('spec_conformance_gate_passes_for_good_proposal', () => expect(specConformanceGate({ proposal: goodProposal, contract }).ok).toBe(true));
  it('spec_conformance_gate_blocks_out_of_write_set', () => expect(specConformanceGate({ proposal: { ...goodProposal, changed_files: ['other/x.ts'] }, contract }).ok).toBe(false));
  it('spec_conformance_gate_blocks_missing_rollback', () => { const { rollback_notes, ...p } = goodProposal; expect(specConformanceGate({ proposal: p, contract }).ok).toBe(false); });
  it('spec_conformance_gate_blocks_prose_acceptance', () => expect(specConformanceGate({ proposal: goodProposal, contract: { ...contract, acceptance_criteria: ['works'] } }).ok).toBe(false));
});

// ── STORY-009.3: planningBundleValidationGate ────────────────────────────────

const VALID_BUNDLE = {
  bundle_id: 'bundle-test-feature',
  idea_id: 'test-feature',
  prd: {
    title: 'Test Feature',
    problem_statement: 'We need a test feature.',
    users: ['developers'],
    goals: ['make testing easy'],
    non_goals: ['replace production code'],
  },
  architecture: {
    summary: 'Minimal standalone module.',
    components: ['core-module', 'test-harness'],
    constraints: [],
    risks: [],
  },
  open_decisions: [],
  source_refs: [],
};

describe('STORY-009.3: planningBundleValidationGate', () => {
  it('STORY-009.3 valid planning bundle passes gate', () =>
    expect(planningBundleValidationGate(VALID_BUNDLE).ok).toBe(true));

  it('STORY-009.3 gate result has ok and errors fields', () => {
    const r = planningBundleValidationGate(VALID_BUNDLE);
    expect(typeof r.ok).toBe('boolean');
    expect(Array.isArray(r.errors)).toBe(true);
  });

  // malformed_bundle_rejected
  it('STORY-009.3 malformed bundle — null rejected', () =>
    expect(planningBundleValidationGate(null).ok).toBe(false));

  it('STORY-009.3 malformed bundle — string rejected', () =>
    expect(planningBundleValidationGate('not a bundle').ok).toBe(false));

  it('STORY-009.3 malformed bundle — array rejected', () =>
    expect(planningBundleValidationGate([]).ok).toBe(false));

  it('STORY-009.3 malformed bundle — missing bundle_id fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, bundle_id: '' }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — whitespace-only bundle_id fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, bundle_id: '   ' }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — missing idea_id fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, idea_id: '' }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — missing prd fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: null }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — prd missing title fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, title: '' } }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — prd missing problem_statement fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, problem_statement: '' } }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — missing architecture fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, architecture: null }).ok).toBe(false));

  it('STORY-009.3 malformed bundle — empty components array fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, architecture: { ...VALID_BUNDLE.architecture, components: [] } }).ok).toBe(false));

  // prose_acceptance_rejected (same rule as STORY-006.1)
  it('STORY-009.3 prose_acceptance_rejected — prd with no goals and no non_goals fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, goals: [], non_goals: [] } }).ok).toBe(false));

  it('STORY-009.3 prose_acceptance_rejected — prd with goals passes', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, goals: ['one goal'], non_goals: [] } }).ok).toBe(true));

  it('STORY-009.3 prose_acceptance_rejected — prd with non_goals only passes', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, goals: [], non_goals: ['one non-goal'] } }).ok).toBe(true));

  it('STORY-009.3 prose_acceptance_rejected — error message references machine-checkable criteria', () => {
    const r = planningBundleValidationGate({ ...VALID_BUNDLE, prd: { ...VALID_BUNDLE.prd, goals: [], non_goals: [] } });
    expect(r.errors.some(e => e.includes('machine-checkable'))).toBe(true);
  });

  // ambiguity_blocks_until_answered
  it('STORY-009.3 ambiguity_blocks_until_answered — bundle with open_decisions fails', () =>
    expect(planningBundleValidationGate({
      ...VALID_BUNDLE,
      open_decisions: [{ id: 'od-1', question: 'What are the goals?', options: [{ option_id: 'defer', tradeoff: 'defer' }] }],
    }).ok).toBe(false));

  it('STORY-009.3 ambiguity_blocks_until_answered — error message references unresolved decisions', () => {
    const r = planningBundleValidationGate({
      ...VALID_BUNDLE,
      open_decisions: [{ id: 'od-1', question: 'Goals?', options: [] }],
    });
    expect(r.errors.some(e => e.includes('open decision') || e.includes('unresolved'))).toBe(true);
  });

  it('STORY-009.3 ambiguity_blocks_until_answered — empty open_decisions passes', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, open_decisions: [] }).ok).toBe(true));

  it('STORY-009.3 ambiguity_blocks_until_answered — open_decisions not an array fails', () =>
    expect(planningBundleValidationGate({ ...VALID_BUNDLE, open_decisions: 'pending' }).ok).toBe(false));

  // Issue ordering and determinism
  it('STORY-009.3 issue ordering deterministic — same invalid input produces same errors', () => {
    const bad = { ...VALID_BUNDLE, bundle_id: '', idea_id: '', open_decisions: [{ id: 'od-1', question: 'q', options: [] }] };
    const r1 = planningBundleValidationGate(bad);
    const r2 = planningBundleValidationGate(bad);
    expect(r1.errors).toEqual(r2.errors);
  });

  it('STORY-009.3 same valid bundle produces same gate result', () => {
    const r1 = planningBundleValidationGate(VALID_BUNDLE);
    const r2 = planningBundleValidationGate(VALID_BUNDLE);
    expect(r1.ok).toBe(r2.ok);
    expect(r1.errors).toEqual(r2.errors);
  });

  it('STORY-009.3 malformed bundle reports ALL errors, not just first', () => {
    const bad = { ...VALID_BUNDLE, bundle_id: '', idea_id: '', prd: { ...VALID_BUNDLE.prd, title: '' }, open_decisions: [{ id: 'od-1', question: 'q', options: [] }] };
    const r = planningBundleValidationGate(bad);
    expect(r.errors.length).toBeGreaterThan(1);
  });

  // Safety constraints
  it('STORY-009.3 no tracker mutation — gate is a pure function with no side effects', () => {
    const input = JSON.stringify(VALID_BUNDLE);
    planningBundleValidationGate(VALID_BUNDLE);
    expect(JSON.stringify(VALID_BUNDLE)).toBe(input);
  });

  it('STORY-009.3 no LLM call — gate is purely synchronous and deterministic', () => {
    const results = [planningBundleValidationGate(VALID_BUNDLE), planningBundleValidationGate(VALID_BUNDLE), planningBundleValidationGate(VALID_BUNDLE)];
    const serialized = results.map(r => JSON.stringify(r));
    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[1]).toBe(serialized[2]);
  });
});

// ── STORY-013.3: quality-bar ──────────────────────────────────────────────────

const pass = async () => ({ passed: true, output: 'ok' });
const fail = async () => ({ passed: false, output: 'error: failed' });
const throws = async (): Promise<{ passed: boolean; output: string }> => { throw new Error('runner crashed'); };

function makeRunner(overrides: Partial<QualityBarRunner> = {}): QualityBarRunner {
  return { build: pass, test: pass, typecheck: pass, ...overrides };
}

describe('quality-bar', () => {
  it('default_bar_build_test_typecheck', () => {
    expect(DEFAULT_QUALITY_BAR.required_checks).toEqual(['build', 'test', 'typecheck']);
  });

  it('quality_bar_configurable', async () => {
    const called: string[] = [];
    const runner: QualityBarRunner = {
      build:     async () => { called.push('build');     return { passed: true, output: '' }; },
      test:      async () => { called.push('test');      return { passed: true, output: '' }; },
      typecheck: async () => { called.push('typecheck'); return { passed: true, output: '' }; },
    };
    const cfg: QualityBarConfig = { required_checks: ['test'] };
    const result = await runQualityBar(cfg, runner);
    expect(result.ok).toBe(true);
    expect(called).toEqual(['test']);
  });

  it('bar_failures_block_promotion_all_pass', async () => {
    const result = await runQualityBar(DEFAULT_QUALITY_BAR, makeRunner());
    expect(result.ok).toBe(true);
    expect(validateQualityBar(result).ok).toBe(true);
  });

  it('bar_failures_block_promotion_one_fails', async () => {
    const result = await runQualityBar(DEFAULT_QUALITY_BAR, makeRunner({ typecheck: fail }));
    expect(result.ok).toBe(false);
    const v = validateQualityBar(result);
    expect(v.ok).toBe(false);
    expect(v.errors.join(' ')).toMatch(/typecheck/);
  });

  it('coverage_threshold_blocks_when_below', async () => {
    const cfg: QualityBarConfig = { required_checks: ['coverage'], coverage_threshold: 80 };
    const runner: QualityBarRunner = {
      build: pass, test: pass, typecheck: pass,
      coverage: async () => ({ passed: true, output: '70%', percent: 70 }),
    };
    const result = await runQualityBar(cfg, runner);
    expect(result.ok).toBe(false);
    expect(result.results[0].output).toMatch(/below threshold/);
  });

  it('coverage_threshold_passes_when_above', async () => {
    const cfg: QualityBarConfig = { required_checks: ['coverage'], coverage_threshold: 80 };
    const runner: QualityBarRunner = {
      build: pass, test: pass, typecheck: pass,
      coverage: async () => ({ passed: true, output: '85%', percent: 85 }),
    };
    const result = await runQualityBar(cfg, runner);
    expect(result.ok).toBe(true);
  });

  it('failing_runner_treated_as_failed_check', async () => {
    const result = await runQualityBar(DEFAULT_QUALITY_BAR, makeRunner({ build: throws }));
    expect(result.ok).toBe(false);
    const buildResult = result.results.find(r => r.check === 'build')!;
    expect(buildResult.passed).toBe(false);
    expect(buildResult.output).toMatch(/runner crashed/);
  });

  it('only_required_checks_run', async () => {
    const called: string[] = [];
    const runner: QualityBarRunner = {
      build:     async () => { called.push('build');     return { passed: true, output: '' }; },
      test:      async () => { called.push('test');      return { passed: true, output: '' }; },
      typecheck: async () => { called.push('typecheck'); return { passed: true, output: '' }; },
    };
    await runQualityBar({ required_checks: ['build'] }, runner);
    expect(called).toEqual(['build']);
    expect(called).not.toContain('test');
    expect(called).not.toContain('typecheck');
  });
});

describe('integration-validation', () => {
  it('integration_validation_runner_injectable', async () => {
    const result = await runIntegrationValidation('pnpm test', '/cwd',
      async () => ({ ok: true, output: 'all pass' }));
    expect(result.ok).toBe(true);
    expect(result.command_run).toBe('pnpm test');
  });
});

// ── STORY-020.2: task-class validation ───────────────────────────────────────

describe('task-class-validation', () => {
  it('brownfield_deltas_reference_existing_symbols', () => {
    const story = {
      story_id: 'X', depends_on: [], allowed_write_set: ['src/**'],
      parallelism_class: 'sequential', task_class: 'brownfield',
      brownfield_deltas: [],
    };
    const r = validateTaskClassBundle(story as any);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/delta/);
  });

  it('public_api_frozen_constraint_supported', () => {
    const story = {
      story_id: 'X', depends_on: [], allowed_write_set: ['src/api/'],
      parallelism_class: 'sequential', task_class: 'brownfield',
      brownfield_deltas: [{ file: 'x', affected_symbols: ['s'], change_intent: 'c' }],
      public_api_constraint: { frozen_paths: ['src/api/**'], reason: 'published' },
    };
    const r = validateTaskClassBundle(story as any);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/public_api_constraint/);
  });

  it('greenfield_story_passes_without_deltas', () => {
    const story = {
      story_id: 'X', depends_on: [], allowed_write_set: ['src/**'],
      parallelism_class: 'sequential', task_class: 'greenfield',
    };
    expect(validateTaskClassBundle(story as any).ok).toBe(true);
  });

  it('brownfield_with_deltas_and_no_constraint_passes', () => {
    const story = {
      story_id: 'X', depends_on: [], allowed_write_set: ['src/calc.ts'],
      parallelism_class: 'sequential', task_class: 'brownfield',
      brownfield_deltas: [{ file: 'src/calc.ts', affected_symbols: ['add'], change_intent: 'Fix NaN' }],
    };
    expect(validateTaskClassBundle(story as any).ok).toBe(true);
  });

  it('no_task_class_passes', () => {
    const story = { story_id: 'X', depends_on: [], allowed_write_set: ['src/**'], parallelism_class: 'sequential' };
    expect(validateTaskClassBundle(story as any).ok).toBe(true);
  });
});

// ── STORY-020.4: brownfield-validator ────────────────────────────────────────

function makeBaselineRunner(results: TestResult[]): BaselineRunner {
  return { runTests: async () => results };
}

describe('brownfield-validator', () => {
  it('baseline_captured_before_first_change', async () => {
    const runner = makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: true },
      { name: 'test-C', passed: false },
    ]);
    const baseline = await captureBaseline(runner);
    expect(baseline.passing).toContain('test-A');
    expect(baseline.passing).toContain('test-B');
    expect(baseline.failing).toContain('test-C');
    expect(baseline.total).toBe(3);
  });

  it('post_change_no_new_failures_enforced', async () => {
    const baseline = await captureBaseline(makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: true },
    ]));
    const result = await validateBrownfieldChange(baseline, makeBaselineRunner([
      { name: 'test-A', passed: false },
      { name: 'test-B', passed: true },
    ]));
    expect(result.ok).toBe(false);
    expect(result.new_failures).toContain('test-A');
  });

  it('baseline_relative_quality_bar_for_brownfield', async () => {
    const baseline = await captureBaseline(makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: false },
    ]));
    const result = await validateBrownfieldChange(baseline, makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: false },
    ]));
    expect(result.ok).toBe(true);
    expect(result.baseline_failures).toContain('test-B');
  });

  it('flaky_baseline_failures_flagged_not_masked', async () => {
    const baseline = await captureBaseline(makeBaselineRunner([
      { name: 'test-C', passed: false },
    ]));
    const result = await validateBrownfieldChange(baseline, makeBaselineRunner([
      { name: 'test-C', passed: true },
    ]));
    expect(result.flaky_candidates).toContain('test-C');
  });

  it('all_new_pass_no_new_failures', async () => {
    const baseline = await captureBaseline(makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: true },
    ]));
    const result = await validateBrownfieldChange(baseline, makeBaselineRunner([
      { name: 'test-A', passed: true },
      { name: 'test-B', passed: true },
    ]));
    expect(result.ok).toBe(true);
    expect(result.new_failures).toHaveLength(0);
  });
});

// ── STORY-022.1: diagnosis-report validator ───────────────────────────────────

const validReport: DiagnosisReport = {
  report_id: 'dr-001', story_id: 'STORY-X',
  failure_classification: 'test_assertion_mismatch',
  root_cause_hypotheses: [
    { hypothesis: 'The divide function does not guard against zero.', confidence: 0.9, evidence_lines: ['src/calc.ts:12'] }
  ],
  improvement_directions: [
    { direction_type: 'change_implementation', rationale: 'Add a guard clause before the division.', affected_files: ['src/calc.ts'] }
  ],
  do_not_touch: ['test/calc.test.ts'],
  referenced_gene_signals: ['src:calc|type:runtime_error'],
  reviewer_model: 'scripted-reviewer-v1',
  reviewed_at: '2026-01-01T00:00:00Z',
};

describe('diagnosis-report', () => {
  it('diagnosis_schema_well_formed', () => {
    expect(validateDiagnosisReport(validReport).ok).toBe(true);
  });

  it('malformed_report_rejected', () => {
    const bad = { ...validReport, root_cause_hypotheses: undefined };
    const r = validateDiagnosisReport(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/root_cause_hypotheses/);
  });

  it('prose_only_directions_rejected', () => {
    const bad = { ...validReport, improvement_directions: [
      { rationale: 'Just a prose direction.', affected_files: [] }
    ]};
    expect(validateDiagnosisReport(bad).ok).toBe(false);
  });

  it('confidence_out_of_range_fails', () => {
    const bad = { ...validReport, root_cause_hypotheses: [
      { hypothesis: 'The divide function crashes on zero input.', confidence: 1.5, evidence_lines: [] }
    ]};
    expect(validateDiagnosisReport(bad).ok).toBe(false);
  });

  it('hypothesis_too_short_fails', () => {
    const bad = { ...validReport, root_cause_hypotheses: [
      { hypothesis: 'bug', confidence: 0.9, evidence_lines: [] }
    ]};
    expect(validateDiagnosisReport(bad).ok).toBe(false);
  });

  it('empty_hypotheses_list_fails', () => {
    expect(validateDiagnosisReport({ ...validReport, root_cause_hypotheses: [] }).ok).toBe(false);
  });
});

describe('settings-wiring-validator', () => {
  it('quality_bar_read_from_settings', () => {
    const cfg = qualityBarConfigFromSettings({ quality_bar: { greenfield: ['build', 'test'], brownfield_strictness: 'zero_new_failures' } });
    expect(cfg.required_checks).toEqual(['build', 'test']);
  });

  it('quality_bar_default_unchanged', () => {
    const cfg = qualityBarConfigFromSettings(DEFAULT_SETTINGS);
    expect(cfg.required_checks).toEqual(['build', 'test', 'typecheck']);
  });
});
