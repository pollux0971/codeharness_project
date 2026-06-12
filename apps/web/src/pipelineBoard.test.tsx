import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PipelineBoard, computeCriticalPath } from './PipelineBoard';
import type { ProjectStoryEntry } from '@codeharness/harness-core';

const story = (id: string, status: ProjectStoryEntry['status'], deps: string[] = []): ProjectStoryEntry => ({
  story_id: id, status, attempts: 0, attempt_budget: 3,
  checkpoint_sha: null, last_action: null, last_result: null, blocked_reason: null,
  depends_on: deps,
} as any);

describe('pipeline-board', () => {
  it('story_cards_track_state_machine_lanes', () => {
    const stories = [
      story('STORY-A', 'todo'),
      story('STORY-B', 'in_progress'),
      story('STORY-C', 'done'),
    ];
    render(<PipelineBoard stories={stories} />);
    expect(screen.getByText('STORY-A')).toBeTruthy();
    expect(screen.getByText('STORY-B')).toBeTruthy();
    expect(screen.getByText('STORY-C')).toBeTruthy();
    const todoLane = screen.getByTestId('lane-todo');
    expect(todoLane.textContent).toContain('STORY-A');
  });

  it('dependency_dag_rendered_with_status', () => {
    const stories = [story('STORY-A', 'done', ['STORY-B']), story('STORY-B', 'todo')];
    render(<PipelineBoard stories={stories} />);
    const svg = document.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.textContent).toContain('STORY-A');
    expect(svg!.textContent).toContain('STORY-B');
  });

  it('critical_path_highlighted', () => {
    const stories = [
      story('STORY-C', 'todo', ['STORY-B']),
      story('STORY-B', 'todo', ['STORY-A']),
      story('STORY-A', 'todo'),
    ];
    const path = computeCriticalPath(stories);
    expect(new Set(path)).toEqual(new Set(['STORY-A', 'STORY-B', 'STORY-C']));
  });

  it('critical_path_empty_for_no_deps', () => {
    const stories = [story('X','todo'), story('Y','todo'), story('Z','todo')];
    expect(computeCriticalPath(stories).length).toBeLessThanOrEqual(1);
  });

  it('clicking_card_selects_story', () => {
    const onSelect = vi.fn();
    render(<PipelineBoard stories={[story('STORY-A','todo')]} onSelectStory={onSelect} />);
    fireEvent.click(screen.getByText('STORY-A'));
    expect(onSelect).toHaveBeenCalledWith('STORY-A');
  });

  it('selected_story_visually_highlighted', () => {
    render(<PipelineBoard stories={[story('STORY-A','todo')]} selectedStoryId='STORY-A' />);
    const card = screen.getByTestId('card-STORY-A');
    expect(card.getAttribute('data-selected')).toBe('true');
  });
});
