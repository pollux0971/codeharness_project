/**
 * STORY-024.5 — WorkerGrid N×N with cycle-flow visualization
 * Pure Node source-analysis tests. React render tests live in apps/web/src/workerGrid.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'WorkerGrid.tsx'), 'utf8');

describe('worker-grid', () => {
  it('n_cells_rendered_from_max_workers', () => {
    expect(src).toContain('data-testid="worker-grid"');
    expect(src).toContain('data-testid={`cell-${');
    expect(src).toContain('maxWorkers');
  });

  it('click_to_zoom_selected_cell', () => {
    expect(src).toContain('data-zoomed');
    expect(src).toContain('selectedWorkerId');
    expect(src).toContain("'true'");
  });

  it('others_collapse_to_status_chips', () => {
    expect(src).toContain('idle');
    expect(src).toContain('STATUS_COLOR');
  });

  it('cycle_flow_visible_in_running_cell', () => {
    expect(src).toContain('cycle_phase');
    expect(src).toContain('develop');
    expect(src).toContain('validate');
    expect(src).toContain('review');
    expect(src).toContain('admit');
  });
});
