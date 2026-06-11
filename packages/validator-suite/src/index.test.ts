import { describe, it, expect } from 'vitest';
import {
  validateStoryContract, validateAcceptanceCriteria, validateForbiddenActions,
  validateWriteSet, validatePromotionGate, validateNoSecretLeak, validateDocumentedStubsHaveStory, specConformanceGate,
  validatePlanningBundle, requiredPlanningBundleFiles, planningBundleValidationGate,
} from './index';

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
