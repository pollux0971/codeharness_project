import { describe, it, expect } from 'vitest';
import { validateSettings, DEFAULT_SETTINGS, isGlobalGateKey, resolveSettings, loadWorkspaceSettings, ensureGitignored } from './index';

describe('settings-boot', () => {
  it('default_settings_validate_against_schema', () => {
    expect(validateSettings(DEFAULT_SETTINGS).ok).toBe(true);
  });

  it('unknown_key_fails_boot', () => {
    const r = validateSettings({ unknown_key: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown|additional/i);
  });

  it('out_of_range_value_fails_boot', () => {
    expect(validateSettings({ budget: { max_calls_per_story: 0 } }).ok).toBe(false);
    expect(validateSettings({ budget: { max_calls_per_story: 201 } }).ok).toBe(false);
  });

  it('no_global_gate_key_representable', () => {
    const r = validateSettings({ real_api_calls: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/global gate/i);
  });

  it('valid_partial_settings_ok', () => {
    expect(validateSettings({ budget: { max_calls_per_story: 10 } }).ok).toBe(true);
  });

  it('is_global_gate_key_identifies_gates', () => {
    expect(isGlobalGateKey('real_api_calls')).toBe(true);
    expect(isGlobalGateKey('stable_promotion')).toBe(true);
    expect(isGlobalGateKey('budget')).toBe(false);
  });
});

describe('review-settings', () => {
  it('review_settings_in_schema', () => {
    expect(validateSettings({ review: { trigger: 'off', cross_model: false, max_directions: 2 } }).ok).toBe(true);
  });

  it('review_trigger_invalid_fails', () => {
    expect(validateSettings({ review: { trigger: 'sometimes' } } as any).ok).toBe(false);
  });

  it('settings_cannot_open_global_gate', () => {
    const r = validateSettings({ review: { real_api_calls: true } } as any);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown|additional/i);
  });
});

describe('settings-resolution', () => {
  it('story_override_beats_workspace_settings', () => {
    const resolved = resolveSettings(
      DEFAULT_SETTINGS,
      { budget: { max_calls_per_story: 50 } },
      { budget: { max_calls_per_story: 5 } }
    );
    expect(resolved.budget!.max_calls_per_story).toBe(5);
  });

  it('workspace_settings_beat_defaults', () => {
    const resolved = resolveSettings(DEFAULT_SETTINGS, { parallelism: { max_parallel_stories: 4 } });
    expect(resolved.parallelism!.max_parallel_stories).toBe(4);
  });

  it('defaults_used_when_no_overrides', () => {
    const resolved = resolveSettings(DEFAULT_SETTINGS);
    expect(resolved.budget!.max_calls_per_story).toBe(30);
    expect(resolved.parallelism!.max_parallel_stories).toBe(2);
  });

  it('invalid_workspace_settings_throws', () => {
    expect(() => loadWorkspaceSettings('budget:\n  max_calls_per_story: 0\n')).toThrow();
  });

  it('workspace_settings_file_gitignored', () => {
    const result = ensureGitignored('node_modules\n.env\n');
    expect(result).toContain('settings.yaml');
  });

  it('gitignore_not_duplicated', () => {
    const result = ensureGitignored('settings.yaml\n.env\n');
    const count = (result.match(/settings\.yaml/g) || []).length;
    expect(count).toBe(1);
  });
});
