import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectPreview, DiffViewer, PromotionHistory,
         type ProjectFile, type FileDiff, type PromotionHistoryEntry } from './ProjectPreview';

const files: ProjectFile[] = [
  { path: 'src/index.ts', kind: 'file' },
  { path: 'src/calc.ts',  kind: 'file' },
];
const diffs: FileDiff[] = [
  { path: 'src/index.ts', additions: 3, deletions: 1,
    patch: '+const x = 1;\n context\n-const y = 2;' },
  { path: 'src/calc.ts',  additions: 5, deletions: 0,
    patch: '+export const add = (a,b) => a+b;\n' },
];
const promos: PromotionHistoryEntry[] = [
  { promotion_id: 'promo-old', promoted_at: '2026-01-01T00:00Z', story_ids_promoted: ['S1'], isLatest: false },
  { promotion_id: 'promo-new', promoted_at: '2026-01-02T00:00Z', story_ids_promoted: ['S2'], isLatest: true },
];

describe('project-preview', () => {
  it('generated_file_tree_and_diff_rendered', () => {
    render(<ProjectPreview files={files} diffs={diffs} targetType='cli'
      promotionHistory={promos} onRollback={vi.fn()} />);
    expect(screen.getByText(/src\/index\.ts/)).toBeTruthy();
    expect(screen.getByText(/\+3/)).toBeTruthy();
  });

  it('diff_lines_colored_correctly', () => {
    render(<DiffViewer diff={diffs[0]} />);
    expect(screen.getByText(/const x = 1/)).toBeTruthy();
    expect(screen.getByText(/const y = 2/)).toBeTruthy();
  });

  it('web_target_live_preview_in_iframe', () => {
    render(<ProjectPreview files={files} targetType='web' previewUrl='http://localhost:5000'
      promotionHistory={promos} onRollback={vi.fn()} />);
    const iframe = document.querySelector('iframe');
    expect(iframe).toBeTruthy();
    expect(iframe?.src).toContain('localhost:5000');
  });

  it('non_web_target_no_iframe', () => {
    render(<ProjectPreview files={files} targetType='cli'
      promotionHistory={promos} onRollback={vi.fn()} />);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('promotion_history_with_rollback_action', () => {
    const onRollback = vi.fn();
    render(<PromotionHistory promotions={promos} onRollback={onRollback} />);
    const buttons = screen.getAllByRole('button', { name: /rollback/i });
    expect(buttons.length).toBe(2);
    const oldBtn = buttons.find(b => b.closest('[data-promo-id="promo-old"]'));
    const newBtn = buttons.find(b => b.closest('[data-promo-id="promo-new"]'));
    expect(oldBtn).toBeDisabled();
    expect(newBtn).not.toBeDisabled();
  });

  it('file_selection_updates_diff_view', () => {
    render(<ProjectPreview files={files} diffs={diffs} targetType='cli'
      promotionHistory={promos} onRollback={vi.fn()} />);
    fireEvent.click(screen.getByText(/src\/calc\.ts/));
    expect(screen.getByText(/export const add/)).toBeTruthy();
  });
});
