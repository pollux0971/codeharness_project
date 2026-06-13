import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkerGrid } from './WorkerGrid';

const workers = [
  { worker_id: 'w1', story_id: 'S-A', status: 'running' as const, cycle_phase: 'develop' as const },
  { worker_id: 'w2', status: 'idle' as const },
  { worker_id: 'w3', story_id: 'S-B', status: 'reviewing' as const, cycle_phase: 'review' as const },
];

describe('worker-grid', () => {
  it('n_cells_rendered_from_max_workers', () => {
    render(<WorkerGrid maxWorkers={4} workers={workers} />);
    expect(document.querySelector('[data-testid="worker-grid"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cell-w1"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cell-w2"]')).toBeTruthy();
  });

  it('click_to_zoom_selected_cell', () => {
    const onSelect = vi.fn();
    render(<WorkerGrid maxWorkers={4} workers={workers} selectedWorkerId="w1" onSelectWorker={onSelect} />);
    const cell = document.querySelector('[data-testid="cell-w1"]');
    expect(cell?.getAttribute('data-zoomed')).toBe('true');
    expect(document.querySelector('[data-testid="cell-w2"]')?.getAttribute('data-zoomed')).not.toBe('true');
  });

  it('others_collapse_to_status_chips', () => {
    render(<WorkerGrid maxWorkers={4} workers={workers} selectedWorkerId="w1" />);
    expect(screen.getByText(/idle/i)).toBeTruthy();
  });

  it('cycle_flow_visible_in_running_cell', () => {
    render(<WorkerGrid maxWorkers={4} workers={workers} />);
    expect(screen.getByText(/develop/i)).toBeTruthy();
    expect(screen.getByText(/review/i)).toBeTruthy();
  });

  it('onSelectWorker_called_on_cell_click', () => {
    const onSelect = vi.fn();
    render(<WorkerGrid maxWorkers={4} workers={workers} onSelectWorker={onSelect} />);
    const cell = document.querySelector('[data-testid="cell-w1"]') as HTMLElement;
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith('w1');
  });

  it('empty_slots_rendered_for_unused_capacity', () => {
    render(<WorkerGrid maxWorkers={4} workers={workers} />);
    const grid = document.querySelector('[data-testid="worker-grid"]');
    // 3 workers + 1 empty slot = 4 children
    expect(grid?.children.length).toBe(4);
  });
});
