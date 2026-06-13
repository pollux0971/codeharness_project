import { describe, it, expect } from 'vitest';
import { validateSettings, DEFAULT_SETTINGS, isGlobalGateKey } from './index';

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
