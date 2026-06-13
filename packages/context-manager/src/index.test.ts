import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildRoleContextPacket, validateContextPacket, enforceTokenBudgetByArtifactSelection,
  detectPhase, requiredContextSections, lifecycleToTrajectory, injectSkillsIntoPacket,
  extractProjectProfile, injectProjectProfile,
  compactContextWindow, DEFAULT_CONFIG,
  buildModeAwarePacket, assertDocWriteSafe,
  buildReviewerContextPacket, assertReviewerContextClean, REVIEWER_DENIED_SECTIONS,
  injectOwnPreviousStorySummary,
  ArtifactRef, PhaseSignals, LifecyclePhase, ContextWindow, Turn,
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

// ── STORY-015.4: project-profile extraction ───────────────────────────────────

function makeTmpProject(pkg?: object, extraFiles: string[] = []): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prof-'));
  if (pkg) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  for (const f of extraFiles) fs.writeFileSync(path.join(root, f), '');
  return root;
}

describe('project-profile', () => {
  it('profile_extracted_from_target_repo', () => {
    const root = makeTmpProject({
      name: 'my-project',
      devDependencies: { vitest: '^1', typescript: '^5', '@types/node': '*' },
    });
    try {
      const p = extractProjectProfile(root);
      expect(p.test_layout.framework).toBe('vitest');
      expect(p.toolchain.language).toBe('typescript');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('profile_loaded_into_developer_context', () => {
    const root = makeTmpProject({ name: 'x', devDependencies: {} });
    try {
      const profile = extractProjectProfile(root);
      const packet = { role: 'developer' as const, sections: [], excluded: [] };
      const updated = injectProjectProfile(packet, profile);
      expect(updated.sections.some(s => s.name === 'project_conventions')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('profile_never_contains_secrets', () => {
    const root = makeTmpProject({ name: 'sk-12345abcdefghij-project', devDependencies: {} });
    try {
      const profile = extractProjectProfile(root);
      expect(profile.summary).not.toContain('sk-12345abcdefghij');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('profile_not_injected_for_supervisor', () => {
    const root = makeTmpProject();
    try {
      const profile = extractProjectProfile(root);
      const packet = { role: 'supervisor' as const, sections: [], excluded: [] };
      const updated = injectProjectProfile(packet, profile);
      expect(updated.sections.some(s => s.name === 'project_conventions')).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('profile_fallbacks_on_missing_package_json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));
    try {
      const profile = extractProjectProfile(root);
      expect(profile.test_layout.framework).toBe('unknown');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lint_config_files_detected', () => {
    const root = makeTmpProject({ name: 'x', devDependencies: {} },
      ['.eslintrc.json', 'prettier.config.js']);
    try {
      const profile = extractProjectProfile(root);
      expect(profile.lint_config_files).toContain('.eslintrc.json');
      expect(profile.lint_config_files).toContain('prettier.config.js');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

// ── STORY-015.5: context compaction ──────────────────────────────────────────

function makeTurn(content: string, pinned = false): Turn {
  return { role: 'assistant', content, tokenCount: Math.ceil(content.length / 4), pinned };
}
function makeWindow(turns: Turn[]): ContextWindow {
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

describe('compaction', () => {
  it('summarize_turn_preserves_decisions', () => {
    // Need 9 turns so the big turn at index 3 falls outside both the first-3 and last-5
    // pinning windows (isLast = i >= 9-5 = 4, so index 3 is NOT last).
    const small: Turn = { role: 'user', content: 'short', tokenCount: 5, pinned: false };
    const bigTurn: Turn = { role: 'assistant', content: 'A'.repeat(16000), tokenCount: 4001, pinned: false };
    const turns = [small, small, small, bigTurn, small, small, small, small, small];
    const window: ContextWindow = { turns, totalTokens: 4001 + 8 * 5 };
    const result = compactContextWindow(window);
    const bigResult = result.turns[3];
    expect(bigResult.content).toContain('[compacted]');
    expect(bigResult.tokenCount).toBeLessThan(bigTurn.tokenCount);
  });

  it('merge_and_summarize_respects_pinned_sections', () => {
    const pinned1: Turn = { role: 'user', content: 'PINNED_A', tokenCount: 10, pinned: true };
    const pinned2: Turn = { role: 'user', content: 'PINNED_B', tokenCount: 10, pinned: true };
    // Build window over L2 threshold using explicit tokenCounts
    const bigUnpinned: Turn[] = Array.from({ length: 5 }, () => ({
      role: 'assistant' as const, content: 'X'.repeat(100), tokenCount: 15000, pinned: false,
    }));
    const allTurns = [pinned1, ...bigUnpinned, pinned2];
    const window: ContextWindow = { turns: allTurns, totalTokens: pinned1.tokenCount + bigUnpinned.reduce((s, t) => s + t.tokenCount, 0) + pinned2.tokenCount };
    const result = compactContextWindow(window);
    const contents = result.turns.map(t => t.content);
    expect(contents.some(c => c.includes('PINNED_A'))).toBe(true);
    expect(contents.some(c => c.includes('PINNED_B'))).toBe(true);
  });

  it('compaction_triggered_at_threshold', () => {
    // 15 turns ensures middle turns (indices 3-9) are outside the first-3/last-5 pinning
    // windows and will be compressed by level-1, reducing total below 75000.
    const turns: Turn[] = Array.from({ length: 15 }, () => ({
      role: 'assistant' as const, content: 'x', tokenCount: 5000, pinned: false,
    }));
    const window: ContextWindow = { turns, totalTokens: 75000 };
    const result = compactContextWindow(window);
    expect(result.totalTokens).toBeLessThan(window.totalTokens);
  });

  it('compacted_context_passes_token_budget', () => {
    // 15 turns: middle 7 get level-1 compressed (tokenCount 5000 > threshold 4000),
    // resulting total ~40k which is ≤ level2ChainTokenThreshold (60000).
    const turns: Turn[] = Array.from({ length: 15 }, () => ({
      role: 'assistant' as const, content: 'D'.repeat(1000), tokenCount: 5000, pinned: false,
    }));
    const window: ContextWindow = { turns, totalTokens: 75000 };
    const result = compactContextWindow(window);
    expect(result.totalTokens).toBeLessThanOrEqual(DEFAULT_CONFIG.level2ChainTokenThreshold);
  });

  it('detect_phase_returns_search_for_small_window', () => {
    expect(detectPhase({ turns: [], totalTokens: 100 }, DEFAULT_CONFIG)).toBe('search');
  });

  it('detect_phase_returns_terminal_for_many_pinned', () => {
    const pinnedTurns = Array.from({ length: 6 }, () => makeTurn('x', true));
    const w = makeWindow(pinnedTurns);
    expect(detectPhase(w, DEFAULT_CONFIG)).toBe('terminal');
  });

  it('pinned_turns_never_compacted', () => {
    const turns = Array.from({ length: 3 }, (_, i) => makeTurn(`PINNED_${i}`, true));
    const window = makeWindow(turns);
    const result = compactContextWindow(window);
    const contents = result.turns.map(t => t.content);
    for (let i = 0; i < 3; i++) {
      expect(contents.some(c => c.includes(`PINNED_${i}`))).toBe(true);
    }
  });
});

// ── STORY-020.5: mode-aware document flow ────────────────────────────────────

describe('mode-aware-docs', () => {
  let asIsDir: string;
  beforeEach(() => {
    asIsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asis-'));
    fs.mkdirSync(path.join(asIsDir, 'as-is'));
    fs.writeFileSync(path.join(asIsDir, 'as-is', 'ARCHITECTURE.md'), '# Architecture\nEntry: src/index.ts');
    fs.writeFileSync(path.join(asIsDir, 'as-is', 'CONVENTIONS.md'),  '# Conventions\ntypeScript, vitest');
  });
  afterEach(() => {
    try { fs.rmSync(asIsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('greenfield_loads_templates_brownfield_loads_profile_and_impact', () => {
    const gf = buildModeAwarePacket('developer', { mode: 'greenfield' });
    const bf = buildModeAwarePacket('developer', { mode: 'brownfield', asIsDocsPath: asIsDir });
    expect(gf.sections.some(s => s.name.includes('as-is'))).toBe(false);
    expect(bf.sections.some(s => s.name.includes('as-is'))).toBe(true);
  });

  it('existing_docs_ingested_read_only', () => {
    const archPath = path.join(asIsDir, 'as-is', 'ARCHITECTURE.md');
    const before = fs.readFileSync(archPath, 'utf8');
    buildModeAwarePacket('developer', { mode: 'brownfield', asIsDocsPath: asIsDir });
    expect(fs.readFileSync(archPath, 'utf8')).toBe(before);
  });

  it('as_is_and_to_be_docs_separated', () => {
    const packet = buildModeAwarePacket('developer', { mode: 'brownfield', asIsDocsPath: asIsDir });
    const asIsSection = packet.sections.find(s => s.name.includes('as-is'));
    expect(asIsSection?.priority).toBe(1);
  });

  it('generated_docs_never_overwrite_outside_write_set', () => {
    expect(() => assertDocWriteSafe('docs/README.md', ['src/**'])).toThrow(/doc_write_blocked/);
  });

  it('write_safe_passes_for_allowed_path', () => {
    expect(() => assertDocWriteSafe('src/README.md', ['src/**'])).not.toThrow();
  });
});

// ── STORY-022.3: reviewer-context ─────────────────────────────────────────────

describe('reviewer-context', () => {
  const input = {
    story_id: 'STORY-X',
    failing_test_output: 'AssertionError: expected 5 but received NaN',
    acceptance_criteria: 'divide(10, 2) === 5',
    diff_under_review: '-export const divide = (a, b) => a / b;',
    matching_genes: [{ matching_signal: 'src:calc|type:runtime_error', summary: 'crash on zero' }],
    story_objective: 'Fix division',
    allowed_write_set: ['src/**'],
  };

  it('reviewer_context_grants_failing_output', () => {
    const packet = buildReviewerContextPacket(input);
    expect(packet.sections.some(s => s.name === 'failing_test_output')).toBe(true);
  });

  it('reviewer_context_grants_acceptance_and_diff', () => {
    const packet = buildReviewerContextPacket(input);
    expect(packet.sections.some(s => s.name === 'acceptance_criteria')).toBe(true);
    expect(packet.sections.some(s => s.name === 'diff_under_review')).toBe(true);
  });

  it('reviewer_context_denies_implementation_history', () => {
    const packet = buildReviewerContextPacket(input);
    expect(packet.sections.some(s => s.name === 'implementation_history')).toBe(false);
  });

  it('reviewer_context_denies_agent_reasoning', () => {
    const packet = buildReviewerContextPacket(input);
    expect(packet.sections.some(s => s.name === 'agent_reasoning')).toBe(false);
  });

  it('reviewer_write_set_read_only_labelled', () => {
    const packet = buildReviewerContextPacket(input);
    const ws = packet.sections.find(s => s.name === 'write_set_scope');
    expect(ws?.text ?? ws?.ref ?? '').toContain('SCOPE REFERENCE ONLY');
  });

  it('assert_reviewer_context_clean_catches_violation', () => {
    const dirty = buildReviewerContextPacket(input);
    dirty.sections.push({ name: 'implementation_history', ref: 'impl', text: 'Developer tried X', tokenCount: 5, priority: 3 });
    const violations = assertReviewerContextClean(dirty);
    expect(violations).toContain('implementation_history');
  });
});

// ── STORY-023.4: own-story-summary ───────────────────────────────────────────

function makeTurnLocal(content: string, pinned = false): Turn {
  return { role: 'assistant', content, tokenCount: Math.ceil(content.length / 4), pinned };
}
function makeWindowLocal(turns: Turn[]): ContextWindow {
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

describe('own-story-summary', () => {
  it('developer_receives_own_previous_story_summary', () => {
    const packet = { role: 'developer' as const, sections: [] as ArtifactRef[], excluded: [] as string[] };
    const prev = { story_id: 'STORY-PREV', window: makeWindowLocal([
      makeTurnLocal('Developer applied patch to src/calc.ts.'),
      makeTurnLocal('Tests ran and passed with 5/5.'),
    ])};
    const updated = injectOwnPreviousStorySummary(packet, { role: 'developer', previousStory: prev });
    expect(updated.sections.some(s => s.name === 'own_previous_story_summary')).toBe(true);
  });

  it('summary_is_compacted_not_raw', () => {
    const bigTurn = makeTurnLocal('X'.repeat(5000));
    const packet = { role: 'developer' as const, sections: [] as ArtifactRef[], excluded: [] as string[] };
    const prev = { story_id: 'STORY-PREV', window: makeWindowLocal([bigTurn]) };
    const updated = injectOwnPreviousStorySummary(packet, { role: 'developer', previousStory: prev, summaryFloor: 0.3 });
    const section = updated.sections.find(s => s.name === 'own_previous_story_summary');
    expect((section?.text ?? '').length).toBeLessThan(5000);
    expect(section?.text ?? '').toContain('[compacted]');
  });

  it('other_agents_reasoning_excluded', () => {
    const agentReasoningTurn = makeTurnLocal('AGENT_REASONING: The model chose approach X because...');
    const normalTurn = makeTurnLocal('Applied patch to calc.ts successfully.');
    const packet = { role: 'developer' as const, sections: [] as ArtifactRef[], excluded: [] as string[] };
    const prev = { story_id: 'STORY-PREV', window: makeWindowLocal([agentReasoningTurn, normalTurn]) };
    const updated = injectOwnPreviousStorySummary(packet, { role: 'developer', previousStory: prev });
    const section = updated.sections.find(s => s.name === 'own_previous_story_summary');
    expect(section?.text ?? '').not.toContain('AGENT_REASONING');
    expect(section?.text ?? '').toContain('Applied patch');
  });

  it('reviewer_denial_unaffected', () => {
    const devPacket = { role: 'developer' as const, sections: [] as ArtifactRef[], excluded: [] as string[] };
    const prev = { story_id: 'STORY-PREV', window: makeWindowLocal([makeTurnLocal('dev work')]) };
    injectOwnPreviousStorySummary(devPacket, { role: 'developer', previousStory: prev });

    const reviewerPacket = buildReviewerContextPacket({
      story_id: 'S-X', failing_test_output: 'err', acceptance_criteria: 'ac',
      diff_under_review: 'diff', matching_genes: [],
    });
    const violations = assertReviewerContextClean(reviewerPacket);
    expect(violations).toHaveLength(0);
  });

  it('non_developer_role_unchanged', () => {
    const packet = { role: 'supervisor' as const, sections: [] as ArtifactRef[], excluded: [] as string[] };
    const prev = { story_id: 'STORY-PREV', window: makeWindowLocal([makeTurnLocal('x')]) };
    const updated = injectOwnPreviousStorySummary(packet as unknown as Parameters<typeof injectOwnPreviousStorySummary>[0], { role: 'supervisor' as unknown as 'developer', previousStory: prev });
    expect(updated).toBe(packet);
  });
});
