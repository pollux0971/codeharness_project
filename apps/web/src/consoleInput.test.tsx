import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConsoleInput } from './ConsoleInput';

describe('console-input', () => {
  it('owner_badge_shows_supervisor_by_default', () => {
    render(<ConsoleInput currentOwner="supervisor" onSubmit={vi.fn()} />);
    expect(screen.getByText(/supervisor/i)).toBeTruthy();
    expect(document.querySelector('[data-owner="supervisor"]')).toBeTruthy();
  });

  it('scope_change_triggers_visual_takeover', () => {
    render(<ConsoleInput currentOwner="planning_steward" onSubmit={vi.fn()} />);
    expect(screen.getByText(/planning.steward/i)).toBeTruthy();
    expect(document.querySelector('[data-owner="planning_steward"]')).toBeTruthy();
  });

  it('ambiguity_questions_render_in_pane', () => {
    render(<ConsoleInput
      currentOwner="planning_steward"
      ambiguityQuestions={['What is the target stack?', 'Is this a new module?']}
      onSubmit={vi.fn()}
    />);
    expect(screen.getByText(/What is the target stack/)).toBeTruthy();
    expect(screen.getByText(/Is this a new module/)).toBeTruthy();
  });

  it('handback_shows_new_story_cards', () => {
    render(<ConsoleInput
      currentOwner="supervisor"
      newStories={[{ story_id: 'STORY-NEW-001', title: 'Add caching layer' }]}
      onSubmit={vi.fn()}
    />);
    expect(screen.getByText(/STORY-NEW-001/)).toBeTruthy();
    expect(screen.getByText(/Add caching layer/)).toBeTruthy();
  });

  it('submit_calls_onSubmit_with_owner', () => {
    const onSubmit = vi.fn();
    render(<ConsoleInput currentOwner="supervisor" onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'status update' } });
    fireEvent.click(screen.getByRole('button', { name: /send|submit/i }));
    expect(onSubmit).toHaveBeenCalledWith('status update', 'supervisor');
  });
});
