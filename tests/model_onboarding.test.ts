import { describe, it, expect } from 'vitest';
import { runModelEval } from '../packages/model-gateway/src/index';
import type { ModelProvider } from '../packages/model-gateway/src/index';

const fakeProvider = (): ModelProvider => ({
  id: 'fake',
  kind: 'scripted',
  call: async () => ({ ok: false, errors: ['scripted'] }),
});

describe('model-onboarding', () => {
  it('new_model_runs_golden_story_suite', async () => {
    const record = await runModelEval({
      providerRef: 'test/model-v1',
      createProvider: fakeProvider,
      fixtureStoryIds: ['STORY-E2E-001', 'STORY-E2E-002', 'STORY-E2E-003'],
      runFixtureStory: async (_id, _p) => true,
    });
    expect(record.stories_run).toBe(3);
    expect(record.stories_passed).toBe(3);
    expect(record.status_after).toBe('active');
  });

  it('below_threshold_blocks_activation', async () => {
    let call = 0;
    const record = await runModelEval({
      providerRef: 'test/model-v2',
      createProvider: fakeProvider,
      fixtureStoryIds: ['STORY-E2E-001', 'STORY-E2E-002', 'STORY-E2E-003'],
      threshold: 1.0,
      runFixtureStory: async () => call++ < 2,
    });
    expect(record.passed).toBe(false);
    expect(record.status_after).toBe('candidate');
  });

  it('eval_results_recorded_in_registry', async () => {
    const record = await runModelEval({
      providerRef: 'test/model-v3',
      createProvider: fakeProvider,
      fixtureStoryIds: ['STORY-E2E-001'],
      runFixtureStory: async () => true,
    });
    expect(record.evaluated_at).toBeTruthy();
    expect(record.pass_rate).toBe(1.0);
    expect(record.fixture_names).toEqual(['STORY-E2E-001']);
  });

  it('partial_pass_rate_respects_threshold', async () => {
    let n = 0;
    const record = await runModelEval({
      providerRef: 'test/model-v4',
      createProvider: fakeProvider,
      fixtureStoryIds: ['STORY-E2E-001', 'STORY-E2E-002', 'STORY-E2E-003'],
      threshold: 0.5,
      runFixtureStory: async () => n++ < 2,
    });
    expect(record.passed).toBe(true);
    expect(record.status_after).toBe('active');
  });

  it('candidate_status_when_all_fail', async () => {
    const record = await runModelEval({
      providerRef: 'test/model-v5',
      createProvider: fakeProvider,
      fixtureStoryIds: ['STORY-E2E-001', 'STORY-E2E-002'],
      runFixtureStory: async () => false,
    });
    expect(record.status_after).toBe('candidate');
    expect(record.pass_rate).toBe(0);
  });
});
