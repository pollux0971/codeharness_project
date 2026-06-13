import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillsPage, type SkillEntry } from './SkillsPage';

const skills: SkillEntry[] = [
  { skill_id: 'developer.patch-proposal', agent_role: 'developer', description: 'Propose a patch', status: 'registered', test_count: 5 },
  { skill_id: 'debugger.failure-triage', agent_role: 'debugger', description: 'Triage failures', status: 'quarantined', quarantine_reason: 'stub only' },
];

describe('skills-page', () => {
  it('catalog_grouped_by_role', () => {
    render(<SkillsPage skills={skills} />);
    expect(screen.getByText(/developer/i)).toBeTruthy();
    expect(screen.getByText(/debugger/i)).toBeTruthy();
  });

  it('gate_status_and_avoid_visible', () => {
    render(<SkillsPage skills={skills} />);
    expect(screen.getByText('registered')).toBeTruthy();
    expect(screen.getByText('quarantined')).toBeTruthy();
    expect(screen.getByText(/stub only/i)).toBeTruthy();
  });

  it('tool_allowlist_rendered_per_role', () => {
    const allowlist = [{ role: 'developer', allowed_tools: ['read_file', 'apply_patch'] }];
    render(<SkillsPage skills={[skills[0]]} toolAllowlist={allowlist} />);
    expect(screen.getByText('apply_patch')).toBeTruthy();
  });

  it('ui_cannot_register_skills', () => {
    render(<SkillsPage skills={skills} />);
    expect(document.querySelector('[data-testid="skills-page-read-only"]')).toBeTruthy();
    const btns = screen.queryAllByRole('button', { name: /register/i });
    expect(btns.length).toBe(0);
  });
});
