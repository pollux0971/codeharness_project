import { describe, it, expect } from 'vitest';
import { checkAdmission, selectAdmissible, type AdmissionContext, type StoryManagerConfig } from './index.js';
import { readJsonl } from '@codeharness/event-log';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

function makeStory(id: string, overrides: Record<string, unknown> = {}) {
  return {
    story_id: id, epic_id: 'EPIC-001', depends_on: [] as string[],
    parallelism_class: 'sequential' as const, status: 'todo' as const,
    attempts: 0, attempt_budget: 3, allowed_write_set: ['src/a.ts'],
    branch: null, last_action: null, last_result: null, last_validation: null, blocked_reason: null,
    ...overrides,
  };
}

const trace = () => join(tmpdir(), `sm-trace-${Date.now()}-${Math.floor(Math.random() * 1e6)}.jsonl`);
const defaultCfg = (t: string): StoryManagerConfig => ({ maxWipPerEpic: 3, traceLogPath: t });

describe('story-manager', () => {
  it('dependency_complete_required_for_admission', async () => {
    const t = trace();
    const storyA = makeStory('STORY-A');
    const storyB = makeStory('STORY-B', { depends_on: ['STORY-A'] });
    const ctx: AdmissionContext = { allStories: [storyA, storyB], iterationsUsed: 0, iterationBudget: 10 };
    const result = await checkAdmission(storyB, ctx, defaultCfg(t));
    expect(result.admitted).toBe(false);
    expect(result.denied_reason).toBe('deps_not_done');
    if (existsSync(t)) unlinkSync(t);
  });

  it('human_hold_blocks_admission', async () => {
    const t = trace();
    const story = makeStory('STORY-A', { human_hold: true });
    const ctx: AdmissionContext = { allStories: [story], iterationsUsed: 0, iterationBudget: 10 };
    const result = await checkAdmission(story, ctx, defaultCfg(t));
    expect(result.admitted).toBe(false);
    expect(result.denied_reason).toBe('human_hold');
    if (existsSync(t)) unlinkSync(t);
  });

  it('closed_wave_blocks_admission', async () => {
    const t = trace();
    const story = makeStory('STORY-A', { wave_id: 'wave-1' });
    const ctx: AdmissionContext = {
      allStories: [story], iterationsUsed: 0, iterationBudget: 10,
      waveRegistry: { 'wave-1': 'closed' },
    };
    const result = await checkAdmission(story, ctx, defaultCfg(t));
    expect(result.admitted).toBe(false);
    expect(result.denied_reason).toBe('wave_closed');
    if (existsSync(t)) unlinkSync(t);
  });

  it('wip_limit_enforced', async () => {
    const t = trace();
    const running = makeStory('STORY-A', { status: 'in_progress' });
    const candidate = makeStory('STORY-B', { allowed_write_set: ['test/**'] });
    const ctx: AdmissionContext = { allStories: [running, candidate], iterationsUsed: 0, iterationBudget: 10 };
    const result = await checkAdmission(candidate, ctx, { maxWipPerEpic: 1, traceLogPath: t });
    expect(result.admitted).toBe(false);
    expect(result.denied_reason).toBe('wip_limit_exceeded');
    if (existsSync(t)) unlinkSync(t);
  });

  it('running_write_set_overlap_blocks_admission', async () => {
    const t = trace();
    const running = makeStory('STORY-A', { status: 'in_progress', allowed_write_set: ['src/**'] });
    const candidate = makeStory('STORY-B', { allowed_write_set: ['src/**'], parallelism_class: 'parallel_safe' });
    const ctx: AdmissionContext = { allStories: [running, candidate], iterationsUsed: 0, iterationBudget: 10 };
    const result = await checkAdmission(candidate, ctx, defaultCfg(t));
    expect(result.admitted).toBe(false);
    expect(result.denied_reason).toBe('write_set_overlap');
    if (existsSync(t)) unlinkSync(t);
  });

  it('admission_events_recorded_in_trace', async () => {
    const t = trace();
    const story = makeStory('STORY-A');
    const ctx: AdmissionContext = { allStories: [story], iterationsUsed: 0, iterationBudget: 10 };
    const result = await checkAdmission(story, ctx, defaultCfg(t));
    expect(result.admitted).toBe(true);
    const events = readJsonl(t);
    expect(events[0].type).toBe('story_admission');
    expect(events[0].payload?.admitted).toBe(true);
    if (existsSync(t)) unlinkSync(t);
  });

  it('all_gates_pass_story_admitted', async () => {
    const t = trace();
    const story = makeStory('STORY-A');
    const ctx: AdmissionContext = { allStories: [story], iterationsUsed: 0, iterationBudget: 10 };
    expect((await checkAdmission(story, ctx, defaultCfg(t))).admitted).toBe(true);
    if (existsSync(t)) unlinkSync(t);
  });

  it('select_admissible_returns_multiple', async () => {
    const t = trace();
    const stories = [makeStory('A'), makeStory('B'), makeStory('C')];
    const ctx: AdmissionContext = { allStories: stories, iterationsUsed: 0, iterationBudget: 10 };
    const admissible = await selectAdmissible(ctx, defaultCfg(t));
    expect(admissible.length).toBe(3);
    if (existsSync(t)) unlinkSync(t);
  });
});
