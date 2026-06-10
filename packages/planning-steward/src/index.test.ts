import { describe, it, expect } from 'vitest';
import {
  classifyIdea, detectParallelismConflict, selectableStories, validatePlanningBundle,
  createPlanningBundle, requiredPlanningFiles, StoryNode,
} from './index';

describe('planning-steward', () => {
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
  it('create_planning_bundle_is_not_implemented', () => expect(() => createPlanningBundle({ title: 'x', description: 'y' })).toThrow(/not implemented/));
});
