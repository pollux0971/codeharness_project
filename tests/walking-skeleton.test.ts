import { describe, it, expect } from 'vitest';
import { runWalkingSkeleton } from '../scripts/walking-skeleton.ts';

describe('walking skeleton', () => {
  it('[00#2] walking_skeleton_reaches_story_validated', async () => {
    const result = await runWalkingSkeleton({ print: false });
    expect(result.output).toContain('model-gateway:    PASS');
    expect(result.output).toContain('spec-conformance: PASS');
    expect(result.output).toContain('validator:        PASS');
    expect(result.output).toContain('STORY VALIDATED ✓');
    expect(result.validated).toBe(true);
  });
});
