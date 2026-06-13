import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetupWizard } from './SetupWizard';
import { DecisionCardsPage, type DecisionEntry } from './DecisionCards';
import { PlatformPanel, type PlatformFact } from './PlatformPanel';

describe('setup-wizard', () => {
  it('setup_wizard_captures_one_time_choices', () => {
    const onComplete = vi.fn();
    render(<SetupWizard onComplete={onComplete} />);
    fireEvent.change(screen.getByTestId('select-project-type'), { target: { value: 'greenfield' } });
    fireEvent.change(screen.getByTestId('select-stack'),        { target: { value: 'node-ts' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onComplete).toHaveBeenCalledWith({ project_type: 'greenfield', stack: 'node-ts' });
  });

  it('choices_lock_after_first_checkpoint', () => {
    render(<SetupWizard
      locked={true}
      lockedValues={{ project_type: 'brownfield', stack: 'python' }}
      onComplete={vi.fn()}
    />);
    expect(document.querySelector('select')).toBeNull();
    expect(screen.getByText(/brownfield/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /change/i })).toBeTruthy();
  });
});

describe('decision-cards', () => {
  const decisions: DecisionEntry[] = [
    { id: 'd1', option: 'D1 Option', description: 'First decision.', status: 'open' },
    { id: 'd2', option: 'D2 Option', description: 'Second decision.', status: 'resolved', current_value: 'chosen' },
  ];

  it('decision_cards_render_from_decisions_doc', () => {
    render(<DecisionCardsPage decisions={decisions} />);
    expect(screen.getByText('D1 Option')).toBeTruthy();
    expect(screen.getByText('D2 Option')).toBeTruthy();
    expect(screen.getByText('open')).toBeTruthy();
    expect(screen.getByText('resolved')).toBeTruthy();
  });
});

describe('platform-panel', () => {
  const facts: PlatformFact[] = [
    { key: 'Sandbox', value: 'rootless container', category: 'sandbox' },
    { key: 'Auth',    value: 'Codex OAuth',        category: 'auth' },
  ];

  it('platform_panel_read_only', () => {
    render(<PlatformPanel facts={facts} />);
    expect(document.querySelector('[data-testid="platform-panel-read-only"]')).toBeTruthy();
    expect(document.querySelectorAll('input').length).toBe(0);
  });
});
