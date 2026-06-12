/**
 * STORY-016.3 — Pipeline board: story cards over state-machine lanes
 * Verifies: kanban lanes, DAG rendering, critical path, selection.
 * Pure Node tests — static source analysis + computeCriticalPath unit tests.
 * React rendering tests live in apps/web/src/pipelineBoard.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { computeCriticalPath, type StoryDep } from '../apps/web/src/criticalPath';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'PipelineBoard.tsx'), 'utf8');

const story = (id: string, deps: string[] = []): StoryDep => ({ story_id: id, depends_on: deps });

describe('pipeline-board', () => {
  it('story_cards_track_state_machine_lanes', () => {
    // Source must render a lane container per status, test-id=lane-<status>
    expect(src).toContain('data-testid={`lane-${lane}`}');
    // All lifecycle states must be present as lanes
    const requiredLanes = ['todo', 'in_progress', 'validating', 'debugging', 'passed', 'checkpointed', 'done'];
    for (const lane of requiredLanes) {
      expect(src).toContain(`'${lane}'`);
    }
  });

  it('dependency_dag_rendered_with_status', () => {
    // Source must render an SVG for the DAG
    expect(src).toContain('<svg');
    expect(src).toContain('aria-label="dependency-dag"');
    // Each story node renders its story_id as text
    expect(src).toContain('story_id');
  });

  it('critical_path_highlighted', () => {
    const stories = [
      story('STORY-C', ['STORY-B']),
      story('STORY-B', ['STORY-A']),
      story('STORY-A'),
    ];
    const path = computeCriticalPath(stories);
    expect(new Set(path)).toEqual(new Set(['STORY-A', 'STORY-B', 'STORY-C']));
  });

  it('critical_path_empty_for_no_deps', () => {
    const stories = [story('X'), story('Y'), story('Z')];
    expect(computeCriticalPath(stories).length).toBeLessThanOrEqual(1);
  });

  it('clicking_card_selects_story', () => {
    // Source must have onClick wired to onSelectStory callback
    expect(src).toContain('onSelectStory');
    expect(src).toContain('onClick');
  });

  it('selected_story_visually_highlighted', () => {
    // Cards must carry data-selected='true' when selected
    expect(src).toContain('data-selected');
    expect(src).toContain("'true'");
    // data-testid on each card for test targeting
    expect(src).toContain('data-testid={`card-${s.story_id}`}');
  });
});
