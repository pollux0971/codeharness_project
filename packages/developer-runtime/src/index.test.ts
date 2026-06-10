import { describe, it, expect } from 'vitest';
import { validateDeveloperOutput, changedFilesWithinWriteSet, producePatchProposal } from './index';

const fullOutput = {
  implementation_plan: 'p', patch_proposal: {}, changed_files: ['a.ts'],
  test_plan: 't', risk_notes: 'r', rollback_notes: 'rb',
};
describe('developer-runtime', () => {
  it('valid_developer_output_passes', () => expect(validateDeveloperOutput(fullOutput).ok).toBe(true));
  it('missing_rollback_notes_fails', () => { const { rollback_notes, ...rest } = fullOutput; expect(validateDeveloperOutput(rest).ok).toBe(false); });
  it('changed_files_within_write_set_passes', () => expect(changedFilesWithinWriteSet(['pkg/src/a.ts'], ['pkg/src/**']).ok).toBe(true));
  it('changed_files_outside_write_set_fails', () => expect(changedFilesWithinWriteSet(['other/x.ts'], ['pkg/src/**']).ok).toBe(false));
  it('produce_patch_proposal_is_not_implemented', () => expect(() => producePatchProposal({})).toThrow(/not implemented/));
});
