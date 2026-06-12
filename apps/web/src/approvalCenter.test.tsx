import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalCenter, EscalationCard, PromotionCard,
         type EscalationData, type PromotionData } from './ApprovalCenter';

const esc = (id: string): EscalationData =>
  ({ id, type: 'needs_clarification', reason: 'unclear spec', story_id: 'STORY-A' });
const promo = (): PromotionData => ({
  run_id: 'run-1', project_id: 'proj-1', promotable: true,
  validation_evidence: [
    { story_id: 'STORY-A', checkpoint_sha: 'abc123def456' },
    { story_id: 'STORY-B', checkpoint_sha: 'fff000aaa111' },
  ]
});

describe('approval-center', () => {
  it('escalations_render_as_actionable_cards', () => {
    render(<ApprovalCenter escalations={[esc('e1'), esc('e2')]} promotions={[]} onDecide={vi.fn()} />);
    expect(screen.getAllByText('needs_clarification').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /approve/i }).length).toBeGreaterThan(0);
  });

  it('approve_deny_writes_back_to_harness', () => {
    const onDecide = vi.fn();
    render(<EscalationCard escalation={esc('e1')} onDecide={(_outcome, _reason) => onDecide('e1', _outcome, _reason)} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onDecide).toHaveBeenCalledWith('e1', 'approved', '');
  });

  it('deny_requires_reason', () => {
    const onDecide = vi.fn();
    render(<EscalationCard escalation={esc('e1')} onDecide={onDecide} />);
    const denyBtn = screen.getByRole('button', { name: /deny/i });
    expect(denyBtn).toBeDisabled();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('deny_with_reason_calls_onDecide', () => {
    const onDecide = vi.fn();
    render(<EscalationCard escalation={esc('e1')} onDecide={onDecide} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'the reason' } });
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(onDecide).toHaveBeenCalledWith('denied', 'the reason');
  });

  it('promotion_requests_show_validation_evidence', () => {
    render(<PromotionCard promotion={promo()} onDecide={vi.fn()} />);
    expect(screen.getByText(/STORY-A/)).toBeTruthy();
    expect(screen.getByText(/STORY-B/)).toBeTruthy();
    expect(screen.getByText(/abc123/)).toBeTruthy();
  });

  it('empty_state_renders_when_no_items', () => {
    render(<ApprovalCenter escalations={[]} promotions={[]} onDecide={vi.fn()} />);
    expect(screen.getByText(/No pending approvals/i)).toBeTruthy();
  });
});
