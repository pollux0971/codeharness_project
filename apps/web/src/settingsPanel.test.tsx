import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsPanel, determineLayer } from './SettingsPanel';
import { DEFAULT_SETTINGS } from '@codeharness/settings';

describe('settings-panel', () => {
  it('settings_rendered_from_schema', () => {
    render(<SettingsPanel effectiveSettings={DEFAULT_SETTINGS} defaultSettings={DEFAULT_SETTINGS} />);
    expect(screen.getByTestId('settings-panel')).toBeTruthy();
  });

  it('enum_as_dropdown_range_validated', () => {
    render(<SettingsPanel effectiveSettings={DEFAULT_SETTINGS} defaultSettings={DEFAULT_SETTINGS} />);
    const select = document.querySelector('[data-setting-key="target.project_type"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('greenfield');
    expect(options).toContain('brownfield');
  });

  it('invalid_edit_shows_inline_error', () => {
    render(<SettingsPanel effectiveSettings={DEFAULT_SETTINGS} defaultSettings={DEFAULT_SETTINGS} />);
    const input = document.querySelector('[data-setting-key="budget.max_calls_per_story"]') as HTMLInputElement;
    if (input) {
      fireEvent.change(input, { target: { value: '0' } });
      expect(document.querySelector('[data-error="budget.max_calls_per_story"]')).toBeTruthy();
    }
  });

  it('effective_layer_shown_per_setting', () => {
    render(<SettingsPanel
      effectiveSettings={{ ...DEFAULT_SETTINGS, parallelism: { max_parallel_stories: 4, enable_competitive_debug: false } }}
      defaultSettings={DEFAULT_SETTINGS}
      workspaceSettings={{ parallelism: { max_parallel_stories: 4 } }}
    />);
    const row = document.querySelector('[data-layer="workspace"]');
    expect(row).toBeTruthy();
  });

  it('global_gates_shown_read_only', () => {
    render(<SettingsPanel effectiveSettings={DEFAULT_SETTINGS} defaultSettings={DEFAULT_SETTINGS} />);
    expect(screen.getByText(/real_api_calls/)).toBeTruthy();
    const gateInput = document.querySelector('[data-setting-key="real_api_calls"]');
    expect(gateInput).toBeNull();
  });
});

describe('determineLayer', () => {
  it('returns_default_when_value_matches_defaults', () => {
    const layer = determineLayer('budget.max_calls_per_story', DEFAULT_SETTINGS, DEFAULT_SETTINGS);
    expect(layer).toBe('default');
  });

  it('returns_workspace_when_value_from_workspace', () => {
    const effective = { ...DEFAULT_SETTINGS, parallelism: { max_parallel_stories: 4, enable_competitive_debug: false } };
    const workspace = { parallelism: { max_parallel_stories: 4 } };
    const layer = determineLayer('parallelism.max_parallel_stories', effective, DEFAULT_SETTINGS, workspace);
    expect(layer).toBe('workspace');
  });

  it('returns_story_when_value_not_from_default_or_workspace', () => {
    const effective = { ...DEFAULT_SETTINGS, parallelism: { max_parallel_stories: 6, enable_competitive_debug: false } };
    const workspace = { parallelism: { max_parallel_stories: 4 } };
    const layer = determineLayer('parallelism.max_parallel_stories', effective, DEFAULT_SETTINGS, workspace);
    expect(layer).toBe('story');
  });
});
