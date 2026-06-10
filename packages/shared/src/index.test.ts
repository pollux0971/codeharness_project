import { describe, it, expect } from 'vitest';
import {
  ok, fail, isValidStoryId, isValidEpicId, validateStoryId, validateEpicId,
  validateStoryContract,
  type StoryContract, type SharedValidationResult, type ValidationIssue,
} from './index.js';

// A complete, valid story contract fixture aligned with story_contract.schema.json
const goodContract: StoryContract = {
  contract_id: 'SC-STORY-001.2-v1',
  contract_version: 1,
  story_id: 'STORY-001.2',
  epic_id: 'EPIC-001',
  task_class: 'greenfield',
  objective: 'Add shared schemas and validation helpers.',
  pre_conditions: ['STORY-001.1 is done'],
  allowed_write_set: ['codeharness/packages/shared/src/'],
  forbidden_actions: ['no secrets', 'no sudo', 'no real api'],
  acceptance_criteria: ['shared_types_match_specs'],
  validation_commands: ['pnpm test shared'],
  attempt_budget: 3,
  rollback_notes: 'Revert shared package changes.',
  contract_issued_at: '2026-06-10T00:00:00.000Z',
};

describe('STORY-001.2 shared schemas and validation helpers', () => {

  // ── behavior: shared_types_match_specs ───────────────────────────────────
  it('STORY-001.2 shared_types_match_specs — StoryContract has all required spec fields', () => {
    const c = goodContract;
    expect(typeof c.contract_id).toBe('string');
    expect(typeof c.contract_version).toBe('number');
    expect(typeof c.story_id).toBe('string');
    expect(typeof c.epic_id).toBe('string');
    expect(['greenfield','brownfield','patch','checkpoint','research_spike']).toContain(c.task_class);
    expect(typeof c.objective).toBe('string');
    expect(Array.isArray(c.pre_conditions)).toBe(true);
    expect(Array.isArray(c.allowed_write_set)).toBe(true);
    expect(Array.isArray(c.forbidden_actions)).toBe(true);
    expect(Array.isArray(c.acceptance_criteria)).toBe(true);
    expect(Array.isArray(c.validation_commands)).toBe(true);
    expect(typeof c.attempt_budget).toBe('number');
    expect(typeof c.rollback_notes).toBe('string');
    expect(typeof c.contract_issued_at).toBe('string');
  });

  it('STORY-001.2 shared_types_match_specs — ValidationIssue has required shape', () => {
    const issue: ValidationIssue = { code: 'MISSING_OBJECTIVE', message: 'objective is missing', path: 'objective' };
    expect(issue.code).toBeDefined();
    expect(issue.message).toBeDefined();
  });

  // ── behavior: basic_validators_accept_known_good_fixtures ────────────────
  it('STORY-001.2 basic_validators_accept_known_good_fixtures — valid story ID passes', () => {
    expect(isValidStoryId('STORY-001.2')).toBe(true);
    expect(isValidStoryId('STORY-000.1')).toBe(true);
    expect(isValidStoryId('STORY-007.1')).toBe(true);
    expect(validateStoryId('STORY-001.2').ok).toBe(true);
  });

  it('STORY-001.2 basic_validators_accept_known_good_fixtures — valid epic ID passes', () => {
    expect(isValidEpicId('EPIC-001')).toBe(true);
    expect(isValidEpicId('EPIC-000')).toBe(true);
    expect(validateEpicId('EPIC-001').ok).toBe(true);
  });

  it('STORY-001.2 basic_validators_accept_known_good_fixtures — ok() helper returns clean result', () => {
    const r = ok();
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('STORY-001.2 basic_validators_accept_known_good_fixtures — valid contract passes', () => {
    expect(validateStoryContract(goodContract).ok).toBe(true);
  });

  // ── behavior: basic_validators_reject_known_bad_fixtures ─────────────────
  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — invalid story ID rejected', () => {
    expect(isValidStoryId('story-001.2')).toBe(false);
    expect(isValidStoryId('STORY-001')).toBe(false);
    expect(isValidStoryId('STORY-A.B')).toBe(false);
    expect(isValidStoryId('')).toBe(false);
    expect(validateStoryId('bad').ok).toBe(false);
  });

  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — invalid epic ID rejected', () => {
    expect(isValidEpicId('EPIC')).toBe(false);
    expect(isValidEpicId('epic-001')).toBe(false);
    expect(isValidEpicId('')).toBe(false);
    expect(validateEpicId('bad').ok).toBe(false);
  });

  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — fail() helper returns issues', () => {
    const issues: ValidationIssue[] = [{ code: 'ERR', message: 'oops' }];
    const r: SharedValidationResult = fail(issues);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBe(1);
  });

  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — missing contract fields all reported', () => {
    const r = validateStoryContract({ objective: '' });
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(3);
  });

  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — bad story_id in contract rejected', () => {
    const r = validateStoryContract({ ...goodContract, story_id: 'bad-id' });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.code === 'INVALID_STORY_ID')).toBe(true);
  });

  it('STORY-001.2 basic_validators_reject_known_bad_fixtures — empty write_set rejected', () => {
    const r = validateStoryContract({ ...goodContract, allowed_write_set: [] });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.code === 'EMPTY_ALLOWED_WRITE_SET')).toBe(true);
  });

  // ── additional guarantees ─────────────────────────────────────────────────
  it('STORY-001.2 validation_result_issue_ordering_is_deterministic', () => {
    const r1 = validateStoryContract({});
    const r2 = validateStoryContract({});
    expect(r1.issues.map(i => i.code)).toEqual(r2.issues.map(i => i.code));
  });

  it('STORY-001.2 fail_sorts_issues_by_code_for_deterministic_ordering', () => {
    const r = fail([
      { code: 'ZZZ', message: 'z' },
      { code: 'AAA', message: 'a' },
    ]);
    expect(r.issues[0].code).toBe('AAA');
    expect(r.issues[1].code).toBe('ZZZ');
  });
});
