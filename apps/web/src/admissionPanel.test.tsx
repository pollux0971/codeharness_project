import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdmissionPanel } from './AdmissionPanel';

const baseProps = {
  waves: [{ wave_id: 'wave-1', status: 'open' as const }],
  maxWipPerEpic: 3,
  onHoldConfirm: vi.fn(),
  onReleaseConfirm: vi.fn(),
  onWipChange: vi.fn(),
};

describe('admission-panel', () => {
  it('lock_badges_show_block_reason', () => {
    const stories = [
      { story_id: 'S-A', block_reason: 'held' as const, human_hold: true, supervisor_proposed_hold: false },
      { story_id: 'S-B', block_reason: 'wave_closed' as const, human_hold: false, supervisor_proposed_hold: false },
    ];
    render(<AdmissionPanel {...baseProps} stories={stories} />);
    expect(screen.getByText(/S-A/)).toBeTruthy();
    expect(screen.getByText(/held/i)).toBeTruthy();
    expect(screen.getByText(/wave_closed/i)).toBeTruthy();
  });

  it('hold_release_requires_human_confirm', () => {
    const onRelease = vi.fn();
    const stories = [
      { story_id: 'S-A', block_reason: 'held' as const, human_hold: true, supervisor_proposed_hold: false },
    ];
    render(<AdmissionPanel {...baseProps} stories={stories} onReleaseConfirm={onRelease} />);
    expect(screen.getByRole('button', { name: /release/i })).toBeTruthy();
  });

  it('supervisor_proposed_holds_pending_until_confirmed', () => {
    const onHold = vi.fn();
    const stories = [
      { story_id: 'S-B', block_reason: 'none' as const, human_hold: false, supervisor_proposed_hold: true },
    ];
    render(<AdmissionPanel {...baseProps} stories={stories} onHoldConfirm={onHold} />);
    expect(screen.getByText(/proposed hold|pending/i)).toBeTruthy();
    const confirmBtn = screen.getByRole('button', { name: /confirm hold/i });
    fireEvent.click(confirmBtn);
    expect(onHold).toHaveBeenCalledWith('S-B');
  });

  it('wave_and_wip_editable', () => {
    render(<AdmissionPanel {...baseProps} stories={[]} />);
    expect(screen.getByText(/wave-1/)).toBeTruthy();
    // WIP limit input
    const wipInput = screen.getByRole('spinbutton');
    expect(wipInput).toBeTruthy();
  });

  it('wip_update_calls_onWipChange', () => {
    const onWipChange = vi.fn();
    render(<AdmissionPanel {...baseProps} stories={[]} onWipChange={onWipChange} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /update/i }));
    expect(onWipChange).toHaveBeenCalledWith(5);
  });

  it('overlap_and_wip_blocked_badges_render', () => {
    const stories = [
      { story_id: 'S-C', block_reason: 'wip_blocked' as const, human_hold: false, supervisor_proposed_hold: false },
      { story_id: 'S-D', block_reason: 'overlap_blocked' as const, human_hold: false, supervisor_proposed_hold: false },
    ];
    render(<AdmissionPanel {...baseProps} stories={stories} />);
    expect(screen.getByText(/wip_blocked/i)).toBeTruthy();
    expect(screen.getByText(/overlap_blocked/i)).toBeTruthy();
  });

  it('release_requires_two_clicks', () => {
    const onRelease = vi.fn();
    const stories = [
      { story_id: 'S-A', block_reason: 'held' as const, human_hold: true, supervisor_proposed_hold: false },
    ];
    render(<AdmissionPanel {...baseProps} stories={stories} onReleaseConfirm={onRelease} />);
    // First click → pending state (shows "Yes, Release")
    fireEvent.click(screen.getByRole('button', { name: /^release$/i }));
    expect(onRelease).not.toHaveBeenCalled();
    // Second click → confirmed
    fireEvent.click(screen.getByRole('button', { name: /yes, release/i }));
    expect(onRelease).toHaveBeenCalledWith('S-A');
  });
});
