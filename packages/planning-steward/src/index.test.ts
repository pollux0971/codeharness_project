import { describe, it, expect } from 'vitest';
import {
  classifyIdea, detectParallelismConflict, selectableStories, validatePlanningBundle,
  createPlanningBundle, requiredPlanningFiles, StoryNode, IdeaInput,
} from './index';

describe('planning-steward (existing)', () => {
  it('classify_greenfield', () => expect(classifyIdea({ title: 'New widget', description: 'build a brand new widget' })).toBe('greenfield'));
  it('classify_brownfield', () => expect(classifyIdea({ title: 'x', description: 'integrate with the existing system' })).toBe('brownfield'));
  it('classify_patch_from_bug_report', () => expect(classifyIdea({ title: 'x', description: 'y', source: 'bug_report' })).toBe('patch'));
  it('classify_research_spike_from_github', () => expect(classifyIdea({ title: 'x', description: 'study github.com/foo/bar' })).toBe('research_spike'));
  it('detect_parallelism_conflict_overlapping_write_set', () => {
    const a: StoryNode = { story_id: 'a', depends_on: [], allowed_write_set: ['pkg/src/**'] };
    const b: StoryNode = { story_id: 'b', depends_on: [], allowed_write_set: ['pkg/src/foo.ts'] };
    expect(detectParallelismConflict(a, b)).toBe(true);
  });
  it('no_conflict_disjoint_write_set', () => {
    const a: StoryNode = { story_id: 'a', depends_on: [], allowed_write_set: ['pkg/a/**'] };
    const b: StoryNode = { story_id: 'b', depends_on: [], allowed_write_set: ['pkg/b/**'] };
    expect(detectParallelismConflict(a, b)).toBe(false);
  });
  it('selectable_stories_respects_dependencies', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: [], allowed_write_set: [] },
      { story_id: 's2', depends_on: ['s1'], allowed_write_set: [] },
    ];
    expect(selectableStories(stories, new Set()).map(s => s.story_id)).toEqual(['s1']);
    expect(selectableStories(stories, new Set(['s1'])).map(s => s.story_id)).toEqual(['s1', 's2']);
  });
  it('validate_planning_bundle_detects_missing_file', () => expect(validatePlanningBundle(['00_idea_record.md']).ok).toBe(false));
  it('validate_planning_bundle_passes_when_complete', () => expect(validatePlanningBundle(requiredPlanningFiles()).ok).toBe(true));
});

// ── STORY-009.1: createPlanningBundle ────────────────────────────────────────

const FULL_IDEA: IdeaInput = {
  idea_id: 'test-idea-1',
  title: 'Build a logging system',
  description: 'We need a structured logging system for tracing agent execution.',
  goals: ['capture all agent events', 'support replay'],
  non_goals: ['real-time alerting'],
  constraints: ['no external dependencies'],
  target_users: ['developers', 'operators'],
  source_refs: ['docs/architecture/02_RUNTIME_STATE_MACHINE.md'],
};

describe('STORY-009.1: createPlanningBundle', () => {
  it('STORY-009.1: valid idea creates planning bundle', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle).toBeDefined();
    expect(bundle.bundle_id).toBe('bundle-test-idea-1');
    expect(bundle.idea_id).toBe('test-idea-1');
  });

  it('STORY-009.1: prd_generated_from_idea_fixture — bundle contains PRD section', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle.prd).toBeDefined();
    expect(bundle.prd.title).toBe('Build a logging system');
    expect(bundle.prd.problem_statement).toContain('logging');
    expect(Array.isArray(bundle.prd.users)).toBe(true);
    expect(Array.isArray(bundle.prd.goals)).toBe(true);
    expect(Array.isArray(bundle.prd.non_goals)).toBe(true);
  });

  it('STORY-009.1: architecture_sketch_generated — bundle contains architecture section', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle.architecture).toBeDefined();
    expect(typeof bundle.architecture.summary).toBe('string');
    expect(bundle.architecture.summary.length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.architecture.components)).toBe(true);
    expect(bundle.architecture.components.length).toBeGreaterThan(0);
    expect(Array.isArray(bundle.architecture.risks)).toBe(true);
    expect(bundle.architecture.risks.length).toBeGreaterThan(0);
  });

  it('STORY-009.1: bundle contains goals, non_goals, constraints', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle.prd.goals).toEqual(['capture all agent events', 'support replay']);
    expect(bundle.prd.non_goals).toEqual(['real-time alerting']);
    expect(bundle.architecture.constraints).toEqual(['no external dependencies']);
  });

  it('STORY-009.1: ambiguities_emitted_as_structured_questions — open_decisions for missing fields', () => {
    const minimal: IdeaInput = { title: 'Minimal idea', description: 'A minimal description.' };
    const bundle = createPlanningBundle(minimal);
    expect(Array.isArray(bundle.open_decisions)).toBe(true);
    expect(bundle.open_decisions.length).toBeGreaterThan(0);
    const od = bundle.open_decisions[0];
    expect(od).toHaveProperty('id');
    expect(od).toHaveProperty('question');
    expect(od).toHaveProperty('options');
  });

  it('STORY-009.1: open_decisions options use escalation-schema option_id+tradeoff structure', () => {
    const minimal: IdeaInput = { title: 'Minimal', description: 'A description.' };
    const bundle = createPlanningBundle(minimal);
    for (const od of bundle.open_decisions) {
      expect(Array.isArray(od.options)).toBe(true);
      for (const opt of od.options) {
        expect(opt).toHaveProperty('option_id');
        expect(opt).toHaveProperty('tradeoff');
        expect(typeof opt.option_id).toBe('string');
        expect(typeof opt.tradeoff).toBe('string');
      }
    }
  });

  it('STORY-009.1: no open_decisions when all fields provided', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle.open_decisions).toEqual([]);
  });

  it('STORY-009.1: source refs preserved', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    expect(bundle.source_refs).toEqual(['docs/architecture/02_RUNTIME_STATE_MACHINE.md']);
  });

  it('STORY-009.1: bundle_is_deterministic_with_scripted_provider — output ordering deterministic', () => {
    const idea: IdeaInput = {
      idea_id: 'det-1',
      title: 'Test',
      description: 'desc',
      goals: ['b-goal', 'a-goal'],
      target_users: ['z-user', 'a-user'],
      constraints: ['z-constraint', 'a-constraint'],
      source_refs: ['z-ref', 'a-ref'],
    };
    const bundle = createPlanningBundle(idea);
    expect(bundle.prd.goals).toEqual(['a-goal', 'b-goal']);
    expect(bundle.prd.users).toEqual(['a-user', 'z-user']);
    expect(bundle.architecture.constraints).toEqual(['a-constraint', 'z-constraint']);
    expect(bundle.source_refs).toEqual(['a-ref', 'z-ref']);
  });

  it('STORY-009.1: same input produces same bundle', () => {
    const b1 = createPlanningBundle(FULL_IDEA);
    const b2 = createPlanningBundle(FULL_IDEA);
    expect(JSON.stringify(b1)).toBe(JSON.stringify(b2));
  });

  it('STORY-009.1: missing title rejected', () => {
    expect(() => createPlanningBundle({ title: '', description: 'desc' })).toThrow(/title/);
  });

  it('STORY-009.1: missing description rejected', () => {
    expect(() => createPlanningBundle({ title: 'test', description: '' })).toThrow(/description/);
  });

  it('STORY-009.1: malformed idea rejected — whitespace-only title', () => {
    expect(() => createPlanningBundle({ title: '   ', description: 'desc' })).toThrow(/title/);
  });

  it('STORY-009.1: malformed idea rejected — whitespace-only description', () => {
    expect(() => createPlanningBundle({ title: 'title', description: '   ' })).toThrow(/description/);
  });

  it('STORY-009.1: secret-like content in description rejected', () => {
    expect(() => createPlanningBundle({ title: 'x', description: 'api_key: abc123' })).toThrow(/secret/);
  });

  it('STORY-009.1: secret-like content in goals rejected', () => {
    expect(() => createPlanningBundle({ title: 'x', description: 'desc', goals: ['password: hunter2'] })).toThrow(/secret/);
  });

  it('STORY-009.1: idea_id derived from title when not provided', () => {
    const bundle = createPlanningBundle({ title: 'My New Feature', description: 'desc' });
    expect(bundle.idea_id).toBe('my-new-feature');
    expect(bundle.bundle_id).toBe('bundle-my-new-feature');
  });

  it('STORY-009.1: no LLM call — purely deterministic synchronous function', () => {
    // A network-dependent function would throw in test environment or return inconsistently.
    // Calling three times with identical input must yield identical structured output.
    const idea: IdeaInput = { idea_id: 'pure-test', title: 'Pure test', description: 'deterministic check' };
    const results = [createPlanningBundle(idea), createPlanningBundle(idea), createPlanningBundle(idea)];
    const serialized = results.map(r => JSON.stringify(r));
    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[1]).toBe(serialized[2]);
  });

  it('STORY-009.1: does not generate formal story files', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toMatch(/STORY-\d+\.\d+\.md/);
    expect(bundle).not.toHaveProperty('stories');
    expect(bundle).not.toHaveProperty('epics');
    expect(bundle).not.toHaveProperty('story_graph');
  });

  it('STORY-009.1: bundle top-level fields are idea_id, bundle_id, prd, architecture, open_decisions, source_refs', () => {
    const bundle = createPlanningBundle(FULL_IDEA);
    const keys = Object.keys(bundle).sort();
    expect(keys).toEqual(['architecture', 'bundle_id', 'idea_id', 'open_decisions', 'prd', 'source_refs']);
  });
});
