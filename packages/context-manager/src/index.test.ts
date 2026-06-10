import { describe, it, expect } from 'vitest';
import {
  buildRoleContextPacket, validateContextPacket, enforceTokenBudgetByArtifactSelection,
  detectPhase, DEFAULT_CONFIG, ArtifactRef,
} from './index';

const dev: ArtifactRef[] = [
  { name: 'story_contract', ref: 'a#1' }, { name: 'relevant_files', ref: 'a#2' },
  { name: 'allowed_write_set', ref: 'a#3' }, { name: 'validation_commands', ref: 'a#4' },
  { name: 'failure_genes', ref: 'a#5' }, { name: 'unrelated_logs', ref: 'a#6' },
];
describe('context-manager', () => {
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
  it('detect_phase_is_not_implemented', () => expect(() => detectPhase([], DEFAULT_CONFIG)).toThrow(/not implemented/));
});
