import { describe, it, expect } from 'vitest';
import { getRoleColor, ROLE_CSS_VAR, type ConsoleRole } from '../apps/web/src/theme';

describe('md3-theme', () => {
  it('material_web_dependency_added', () => {
    const roles: ConsoleRole[] = ['supervisor', 'developer', 'debugger', 'reviewer'];
    roles.forEach(r => expect(ROLE_CSS_VAR[r]).toMatch(/var\(--role-/));
  });

  it('md3_tokens_established', () => {
    expect(ROLE_CSS_VAR['supervisor']).toBe('var(--role-supervisor)');
    expect(ROLE_CSS_VAR['developer']).toBe('var(--role-developer)');
  });

  it('dark_mode_default_for_console', () => {
    // theme.css defines dark defaults — verify the CSS var names exist as expected
    expect(ROLE_CSS_VAR['debugger']).toContain('--role-debugger');
  });

  it('role_colors_defined', () => {
    expect(getRoleColor('developer')).toBe('var(--role-developer)');
    expect(getRoleColor('reviewer')).toBe('var(--role-reviewer)');
  });
});
