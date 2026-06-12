import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRoleContextPacket, validateContextPacket, enforceTokenBudgetByArtifactSelection,
  detectPhase, requiredContextSections, lifecycleToTrajectory, injectSkillsIntoPacket,
  ArtifactRef, PhaseSignals, LifecyclePhase,
} from './index';
import type { FullSkillManifest } from '@codeharness/skill-runtime';

const dev: ArtifactRef[] = [
  { name: 'story_contract', ref: 'a#1' }, { name: 'relevant_files', ref: 'a#2' },
  { name: 'allowed_write_set', ref: 'a#3' }, { name: 'validation_commands', ref: 'a#4' },
  { name: 'failure_genes', ref: 'a#5' }, { name: 'unrelated_logs', ref: 'a#6' },
];

describe('context-manager', () => {
  // ── v0 behaviors (STORY-004.1) ─────────────────────────────────────────────
  it('build_role_context_packet_selects_required_sections', () => {
    const p = buildRoleContextPacket('developer', dev);
    expect(p.sections.map(s => s.name)).toContain('story_contract');
  });
  it('build_role_context_packet_excludes_others', () => {
    expect(buildRoleContextPacket('developer', dev).excluded).toContain('unrelated_logs');
  });
  it('validate_context_packet_flags_secret', () => {
    const r = validateContextPacket({ role: 'developer', sections: [{ name: 'x', ref: 'r', text: 'key sk-ABCDEFGH1234567890' }], excluded: [] });
    expect(r.ok).toBe(false);
  });
  it('validate_context_packet_flags_missing_ref', () => {
    const r = validateContextPacket({ role: 'developer', sections: [{ name: 'x', ref: '' }], excluded: [] });
    expect(r.ok).toBe(false);
  });
  it('enforce_token_budget_defers_low_priority', () => {
    const secs: ArtifactRef[] = [
      { name: 'keep', ref: 'r', tokenCount: 50, priority: 1 },
      { name: 'drop', ref: 'r', tokenCount: 100, priority: 9 },
    ];
    const out = enforceTokenBudgetByArtifactSelection(secs, 50);
    expect(out.kept.map(s => s.name)).toEqual(['keep']);
    expect(out.deferred).toContain('drop');
  });

  // ── STORY-008.2: detectPhase — lifecycle phase detection ──────────────────
  it('STORY-008.2: detect_phase_no_longer_throws', () => {
    expect(() => detectPhase({})).not.toThrow();
  });

  it('STORY-008.2: explicit_phase_hint_wins', () => {
    const phases: LifecyclePhase[] = ['planning', 'developing', 'validating', 'debugging', 'escalating', 'checkpointing', 'done', 'unknown'];
    for (const p of phases) {
      expect(detectPhase({ phase: p })).toBe(p);
    }
  });

  it('STORY-008.2: checkpoint_marker_returns_checkpointing', () => {
    expect(detectPhase({ checkpointMarker: true })).toBe('checkpointing');
  });

  it('STORY-008.2: story_status_checkpointed_returns_checkpointing', () => {
    expect(detectPhase({ storyStatus: 'checkpointed' })).toBe('checkpointing');
  });

  it('STORY-008.2: story_status_done_returns_done', () => {
    expect(detectPhase({ storyStatus: 'done' })).toBe('done');
  });

  it('STORY-008.2: escalation_required_returns_escalating', () => {
    expect(detectPhase({ escalationRequired: true })).toBe('escalating');
  });

  it('STORY-008.2: story_status_escalated_returns_escalating', () => {
    expect(detectPhase({ storyStatus: 'escalated' })).toBe('escalating');
  });

  it('STORY-008.2: story_status_blocked_returns_escalating', () => {
    expect(detectPhase({ storyStatus: 'blocked' })).toBe('escalating');
  });

  it('STORY-008.2: validation_failed_returns_debugging', () => {
    expect(detectPhase({ validationPassed: false })).toBe('debugging');
  });

  it('STORY-008.2: failure_count_nonzero_returns_debugging', () => {
    expect(detectPhase({ failureCount: 2 })).toBe('debugging');
  });

  it('STORY-008.2: story_status_debugging_returns_debugging', () => {
    expect(detectPhase({ storyStatus: 'debugging' })).toBe('debugging');
  });

  it('STORY-008.2: validation_passed_returns_validating', () => {
    expect(detectPhase({ validationPassed: true })).toBe('validating');
  });

  it('STORY-008.2: story_status_validating_returns_validating', () => {
    expect(detectPhase({ storyStatus: 'validating' })).toBe('validating');
  });

  it('STORY-008.2: story_status_passed_returns_validating', () => {
    expect(detectPhase({ storyStatus: 'passed' })).toBe('validating');
  });

  it('STORY-008.2: story_status_in_progress_returns_developing', () => {
    expect(detectPhase({ storyStatus: 'in_progress' })).toBe('developing');
  });

  it('STORY-008.2: story_status_todo_returns_planning', () => {
    expect(detectPhase({ storyStatus: 'todo' })).toBe('planning');
  });

  it('STORY-008.2: empty_signals_returns_unknown', () => {
    expect(detectPhase({})).toBe('unknown');
  });

  it('STORY-008.2: ambiguous_signals_return_unknown_deterministically', () => {
    // No story status and no validation signals → unknown every time
    expect(detectPhase({})).toBe('unknown');
    expect(detectPhase({})).toBe('unknown');
  });

  it('STORY-008.2: same_input_always_same_output', () => {
    const signals: PhaseSignals = { storyStatus: 'debugging', failureCount: 3 };
    const first = detectPhase(signals);
    const second = detectPhase(signals);
    expect(first).toBe(second);
    expect(first).toBe('debugging');
  });

  it('STORY-008.2: explicit_hint_overrides_conflicting_status', () => {
    // Explicit hint beats any status signal
    expect(detectPhase({ phase: 'planning', storyStatus: 'debugging', failureCount: 5 })).toBe('planning');
  });

  it('STORY-008.2: failure_count_zero_does_not_trigger_debugging', () => {
    expect(detectPhase({ failureCount: 0, storyStatus: 'in_progress' })).toBe('developing');
  });

  it('STORY-008.2: lifecycle_to_trajectory_debugging_maps_to_stuck', () => {
    expect(lifecycleToTrajectory('debugging')).toBe('stuck');
  });

  it('STORY-008.2: lifecycle_to_trajectory_done_maps_to_terminal', () => {
    expect(lifecycleToTrajectory('done')).toBe('terminal');
  });

  it('STORY-008.2: lifecycle_to_trajectory_developing_maps_to_search', () => {
    expect(lifecycleToTrajectory('developing')).toBe('search');
  });

  // ── STORY-008.2: required_sections_are_role_scoped ─────────────────────────
  it('STORY-008.2: supervisor_gets_supervisor_sections', () => {
    const secs = requiredContextSections('supervisor');
    expect(secs).toContain('project_status');
    expect(secs).toContain('story_goal');
    expect(secs).not.toContain('failed_logs');  // debugger-only
    expect(secs).not.toContain('story_contract'); // developer-only
  });

  it('STORY-008.2: developer_gets_developer_sections', () => {
    const secs = requiredContextSections('developer');
    expect(secs).toContain('story_contract');
    expect(secs).toContain('failure_genes');
    expect(secs).not.toContain('failed_logs');    // debugger-only
    expect(secs).not.toContain('project_status'); // supervisor-only
  });

  it('STORY-008.2: debugger_gets_debugger_sections', () => {
    const secs = requiredContextSections('debugger');
    expect(secs).toContain('failed_logs');
    expect(secs).toContain('matching_failure_genes');
    expect(secs).not.toContain('story_contract');  // developer-only
    expect(secs).not.toContain('project_status');  // supervisor-only
  });

  it('STORY-008.2: secret_sections_never_included_in_packet', () => {
    const available: ArtifactRef[] = [
      { name: 'story_contract', ref: 'r1' },
      { name: 'relevant_files', ref: 'r2', text: 'normal content' },
      { name: 'api_key_section', ref: 'r3', text: 'sk-ABC12345678XXXXXXXXX secret' },
    ];
    // api_key_section is not a required developer section → excluded
    const packet = buildRoleContextPacket('developer', available);
    expect(packet.excluded).toContain('api_key_section');
    // Even if a secret crept into a required section, validateContextPacket blocks it
    const badPacket = { role: 'developer' as const, sections: [{ name: 'story_contract', ref: 'r', text: 'sk-ABCDEFGH12345678' }], excluded: [] };
    expect(validateContextPacket(badPacket).ok).toBe(false);
  });

  it('STORY-008.2: token_budget_defers_low_priority_artifacts_deterministically', () => {
    const secs: ArtifactRef[] = [
      { name: 'critical', ref: 'r1', tokenCount: 100, priority: 1 },
      { name: 'medium',   ref: 'r2', tokenCount: 100, priority: 3 },
      { name: 'low',      ref: 'r3', tokenCount: 100, priority: 9 },
    ];
    const out = enforceTokenBudgetByArtifactSelection(secs, 200);
    expect(out.kept.map(s => s.name)).toEqual(['critical', 'medium']);
    expect(out.deferred).toEqual(['low']);
    // Same input → same result (deterministic)
    const out2 = enforceTokenBudgetByArtifactSelection(secs, 200);
    expect(out2.kept.map(s => s.name)).toEqual(out.kept.map(s => s.name));
  });
});

// ── STORY-014.6: skill injection ──────────────────────────────────────────────

function makeTmpSkillRoot(skills: { id: string; role: string; avoid?: string; md?: string }[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-sk-'));
  for (const s of skills) {
    const dir = path.join(root, 'skills', s.role, s.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), s.md ?? `# ${s.id}`);
    fs.writeFileSync(path.join(dir, '.memory.md'), s.avoid ? `AVOID: ${s.avoid}\n` : '');
    fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({
      skill_id: `${s.role}.${s.id}`, agent_role: s.role,
      path: `skills/${s.role}/${s.id}`, tests: ['t.py'],
    }));
  }
  return root;
}

function makeSkillManifest(id: string, role: string, status: string): FullSkillManifest {
  return {
    skill_id: id,
    agent_role: role as FullSkillManifest['agent_role'],
    status: status as FullSkillManifest['status'],
    path: `skills/${role}/${id.split('.')[1] ?? id}`,
    tests: ['t.py'],
  };
}

describe('skill-injection', () => {
  it('inject_skills_into_packet_adds_sections', async () => {
    const root = makeTmpSkillRoot([{ id: 'patch-proposal', role: 'developer' }]);
    try {
      const manifests = [makeSkillManifest('developer.patch-proposal', 'developer', 'registered')];
      const packet = { role: 'developer' as const, sections: [], excluded: [] };
      const result = await injectSkillsIntoPacket(packet, { role: 'developer', manifests, skillsRoot: root });
      expect(result.sections.some(s => s.name.startsWith('skill_'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('inject_respects_token_budget', async () => {
    const root = makeTmpSkillRoot([{ id: 'patch-proposal', role: 'developer', md: 'A'.repeat(4000) }]);
    try {
      const manifests = [makeSkillManifest('developer.patch-proposal', 'developer', 'registered')];
      const packet = { role: 'developer' as const, sections: [], excluded: [] };
      const result = await injectSkillsIntoPacket(packet, {
        role: 'developer', manifests, skillsRoot: root, budgetTokens: 10,
      });
      expect(result.excluded.some(n => n.startsWith('skill_'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('quarantined_avoid_lines_still_injected', async () => {
    const root = makeTmpSkillRoot([{ id: 'bad-skill', role: 'developer', avoid: 'never do X' }]);
    try {
      const manifests = [makeSkillManifest('developer.bad-skill', 'developer', 'quarantined')];
      const packet = { role: 'developer' as const, sections: [], excluded: [] };
      const result = await injectSkillsIntoPacket(packet, { role: 'developer', manifests, skillsRoot: root });
      expect(result.sections.some(s => s.name.includes('avoid'))).toBe(true);
      expect(result.sections.some(s => s.name === 'skill_developer.bad-skill')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
