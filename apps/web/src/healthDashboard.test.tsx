import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BudgetPanel, FailureHeatmap, GateStatusPanel,
         type BudgetSnapshot, type GateConfig, type GateAuditEntry } from './HealthDashboard';

describe('health-dashboard', () => {
  it('budget_usage_per_story_epic_run', () => {
    const snapshots: BudgetSnapshot[] = [
      { story_id: 'STORY-A', calls_used: 5, calls_budget: 30,
        tokens_used: 10000, tokens_budget: 400000, killed: false },
      { story_id: 'STORY-B', calls_used: 25, calls_budget: 30,
        tokens_used: 360000, tokens_budget: 400000, killed: false },
    ];
    render(<BudgetPanel snapshots={snapshots} />);
    expect(screen.getByText('STORY-A')).toBeTruthy();
    expect(screen.getByText('STORY-B')).toBeTruthy();
    expect(screen.getByText('NEAR_LIMIT')).toBeTruthy();
  });

  it('killed_budget_shows_killed_status', () => {
    const snapshots: BudgetSnapshot[] = [
      { story_id: 'STORY-X', calls_used: 30, calls_budget: 30,
        tokens_used: 0, tokens_budget: 400000, killed: true },
    ];
    render(<BudgetPanel snapshots={snapshots} />);
    expect(screen.getByText('KILLED')).toBeTruthy();
  });

  it('failure_gene_heatmap_rendered', () => {
    const genes = [
      { id: 'g1', failure_type: 'test_failure', summary: 'Test A fails', consolidated_count: 3, story_id: 'STORY-A' },
      { id: 'g2', failure_type: 'test_failure', summary: 'Test B fails', consolidated_count: 1, story_id: 'STORY-B' },
      { id: 'g3', failure_type: 'build_error', summary: 'TS error', consolidated_count: 2, story_id: 'STORY-C' },
    ];
    render(<FailureHeatmap genes={genes} />);
    expect(screen.getByText('test_failure')).toBeTruthy();
    expect(screen.getByText(/Test A fails/)).toBeTruthy();
    expect(screen.getByText(/Test B fails/)).toBeTruthy();
  });

  it('heatmap_groups_by_failure_type', () => {
    const genes = [
      { id: 'g1', failure_type: 'type_error', summary: 'S1', consolidated_count: 1, story_id: 'S1' },
      { id: 'g2', failure_type: 'type_error', summary: 'S2', consolidated_count: 1, story_id: 'S2' },
      { id: 'g3', failure_type: 'runtime_error', summary: 'S3', consolidated_count: 1, story_id: 'S3' },
      { id: 'g4', failure_type: 'runtime_error', summary: 'S4', consolidated_count: 1, story_id: 'S4' },
    ];
    render(<FailureHeatmap genes={genes} />);
    expect(screen.getByText('type_error')).toBeTruthy();
    expect(screen.getByText('runtime_error')).toBeTruthy();
  });

  it('gate_status_panel_with_audit_log', () => {
    const config: GateConfig = { real_api_calls_enabled: false, kill_switch: false, ci_override: true };
    const auditLog: GateAuditEntry[] = [
      { timestamp: '2026-01-01T00:00Z', gate: 'real_api_calls', change: 'enabled→disabled', operator: 'alice' }
    ];
    render(<GateStatusPanel config={config} auditLog={auditLog} />);
    expect(screen.getByText(/real_api_calls/)).toBeTruthy();
    expect(screen.getByText(/alice/)).toBeTruthy();
  });

  it('gates_are_read_only_no_toggle', () => {
    const config: GateConfig = { real_api_calls_enabled: true, kill_switch: false, ci_override: true };
    render(<GateStatusPanel config={config} auditLog={[]} />);
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      expect((cb as HTMLInputElement).disabled).toBe(true);
    });
  });
});
