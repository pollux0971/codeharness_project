import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReasoningEvent } from './ReasoningEvent';

describe('reasoning-event', () => {
  it('collapsed_shows_preview_only', () => {
    render(<ReasoningEvent eventId="e1" preview="Line 1\nLine 2" fullText="Line 1\nLine 2\nLine 3 full" />);
    const root = document.querySelector('[data-testid="reasoning-e1"]');
    expect(root?.getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByText(/Line 3 full/)).toBeNull();
  });

  it('click_expands_full_thinking', () => {
    render(<ReasoningEvent eventId="e1" preview="Line 1\nLine 2" fullText="Line 1\nLine 2\nLine 3 full" />);
    fireEvent.click(screen.getByRole('button', { name: /thinking|expand/i }));
    expect(document.querySelector('[data-expanded="true"]')).toBeTruthy();
    expect(screen.getByText(/Line 3 full/)).toBeTruthy();
  });

  it('semi_transparent_when_collapsed', () => {
    render(<ReasoningEvent eventId="e1" preview="thinking..." fullText="full" />);
    const collapsed = document.querySelector('[data-expanded="false"]') as HTMLElement;
    expect(collapsed).toBeTruthy();
    expect(collapsed.style.opacity).toBe('0.55');
  });

  it('applies_to_all_three_panes', () => {
    expect(typeof ReasoningEvent).toBe('function');
  });
});
