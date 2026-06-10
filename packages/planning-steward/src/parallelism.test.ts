import { describe, it, expect } from 'vitest';
import { validateStoryGraph, topologicalSort, detectParallelismConflict, selectableStories } from './parallelism.js';
import type { StoryNode } from './parallelism.js';

describe('STORY-000.4 story graph and parallelism model', () => {
  // ── formal acceptance-criteria behaviors ──────────────────────────────
  it('STORY-000.4 detect_parallelism_conflict_overlapping_write_set', () => {
    const a: StoryNode = { story_id: 'a', depends_on: [], allowed_write_set: ['pkg/src/**'] };
    const b: StoryNode = { story_id: 'b', depends_on: [], allowed_write_set: ['pkg/src/foo.ts'] };
    expect(detectParallelismConflict(a, b)).toBe(true);
  });

  it('STORY-000.4 no_conflict_disjoint_write_set', () => {
    const a: StoryNode = { story_id: 'a', depends_on: [], allowed_write_set: ['pkg/a/**'] };
    const b: StoryNode = { story_id: 'b', depends_on: [], allowed_write_set: ['pkg/b/**'] };
    expect(detectParallelismConflict(a, b)).toBe(false);
  });

  it('STORY-000.4 selectable_stories_respects_dependencies', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: [], allowed_write_set: [] },
      { story_id: 's2', depends_on: ['s1'], allowed_write_set: [] },
    ];
    expect(selectableStories(stories, new Set()).map(s => s.story_id)).toEqual(['s1']);
    expect(selectableStories(stories, new Set(['s1'])).map(s => s.story_id)).toEqual(['s1', 's2']);
  });

  // ── story graph validation ────────────────────────────────────────────
  it('STORY-000.4 valid_graph_passes', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: [], allowed_write_set: [] },
      { story_id: 's2', depends_on: ['s1'], allowed_write_set: [] },
      { story_id: 's3', depends_on: ['s1'], allowed_write_set: [] },
    ];
    const r = validateStoryGraph(stories);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.topologicalOrder).not.toBeNull();
    expect(r.topologicalOrder![0]).toBe('s1');
  });

  it('STORY-000.4 missing_dependency_fails', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: ['ghost'], allowed_write_set: [] },
    ];
    const r = validateStoryGraph(stories);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('ghost'))).toBe(true);
  });

  it('STORY-000.4 self_dependency_fails', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: ['s1'], allowed_write_set: [] },
    ];
    const r = validateStoryGraph(stories);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('self-dependency'))).toBe(true);
  });

  it('STORY-000.4 cycle_dependency_fails', () => {
    const stories: StoryNode[] = [
      { story_id: 'a', depends_on: ['b'], allowed_write_set: [] },
      { story_id: 'b', depends_on: ['c'], allowed_write_set: [] },
      { story_id: 'c', depends_on: ['a'], allowed_write_set: [] },
    ];
    const r = validateStoryGraph(stories);
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => e.includes('cycle'))).toBe(true);
    expect(r.topologicalOrder).toBeNull();
  });

  it('STORY-000.4 topological_order_is_deterministic', () => {
    const stories: StoryNode[] = [
      { story_id: 'z', depends_on: [], allowed_write_set: [] },
      { story_id: 'a', depends_on: [], allowed_write_set: [] },
      { story_id: 'm', depends_on: ['a', 'z'], allowed_write_set: [] },
    ];
    const r1 = topologicalSort(stories);
    const r2 = topologicalSort([...stories].reverse());
    expect(r1).not.toBeNull();
    expect(r1).toEqual(r2);
    expect(r1![0]).toBe('a');
    expect(r1![1]).toBe('z');
    expect(r1![2]).toBe('m');
  });

  it('STORY-000.4 multiple_errors_all_reported_not_just_first', () => {
    const stories: StoryNode[] = [
      { story_id: 's1', depends_on: ['missing1'], allowed_write_set: [] },
      { story_id: 's2', depends_on: ['missing2'], allowed_write_set: [] },
    ];
    const r = validateStoryGraph(stories);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });
});
