import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactBrowser, CheckpointHistory, PromotionReview } from './DeliveryPage';
import { PromotionHistory } from './ProjectPreview';

describe('delivery-page', () => {
  it('artifact_tree_browsable', () => {
    render(<ArtifactBrowser files={[{ path: 'src/index.ts', kind: 'file' }, { path: 'test', kind: 'dir' }]} />);
    expect(screen.getByText(/src\/index\.ts/)).toBeTruthy();
    expect(screen.getByText('test')).toBeTruthy();
  });

  it('checkpoint_history_with_resume', () => {
    const onResume = vi.fn();
    const checkpoints = [
      { checkpoint_id: 'cp-1', story_id: 'S-A', commit_sha: 'abc123', checkpointed_at: '2026-01-01T00:00Z', is_resume_entry: true },
      { checkpoint_id: 'cp-2', story_id: 'S-B', commit_sha: 'def456', checkpointed_at: '2026-01-02T00:00Z', is_resume_entry: false },
    ];
    render(<CheckpointHistory checkpoints={checkpoints} onResume={onResume} />);
    expect(screen.getByText(/abc123/)).toBeTruthy();
    // Resume button only for is_resume_entry
    const resumeBtn = screen.getByRole('button', { name: /resume/i });
    fireEvent.click(resumeBtn);
    expect(onResume).toHaveBeenCalledWith('cp-1');
    // cp-2 has no resume button
    expect(screen.queryAllByRole('button', { name: /resume/i }).length).toBe(1);
  });

  it('promotion_review_shows_evidence', () => {
    render(<PromotionReview
      runId="run-1"
      diffStats={{ additions: 42, deletions: 5 }}
      validationEvidence={[{ story_id: 'S-A', sha: 'abc' }]}
      qualityBarPassed={true}
      onDecide={vi.fn()}
    />);
    expect(screen.getByText(/\+42/)).toBeTruthy();
    expect(screen.getByText(/S-A/)).toBeTruthy();
  });

  it('rollback_one_click_with_trace_record', () => {
    // Reuse PromotionHistory from ProjectPreview (016.6)
    const onRollback = vi.fn();
    const promos = [{ promotion_id: 'p-1', promoted_at: '2026-01-01T00:00Z', story_ids_promoted: ['S-A'], isLatest: true }];
    render(<PromotionHistory promotions={promos} onRollback={onRollback} />);
    fireEvent.click(screen.getByRole('button', { name: /rollback/i }));
    expect(onRollback).toHaveBeenCalledWith('p-1');
  });
});
