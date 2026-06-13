import { appendNextEvent } from '@codeharness/event-log';
import { computeSpawnPlan } from '@codeharness/task-graph';
import type { StoryRecord } from '@codeharness/harness-core';

export interface WaveRegistry {
  [waveId: string]: 'open' | 'closed';
}

export interface StoryManagerConfig {
  maxWipPerEpic: number;
  traceLogPath: string;
}

type ExtendedStoryRecord = StoryRecord & {
  human_hold?: boolean;
  wave_id?: string;
  allowed_write_set?: string[];
};

export interface AdmissionContext {
  allStories: (StoryRecord & { human_hold?: boolean; wave_id?: string; allowed_write_set?: string[] })[];
  waveRegistry?: WaveRegistry;
  iterationsUsed: number;
  iterationBudget: number;
}

export type DeniedReason =
  | 'deps_not_done' | 'human_hold' | 'wave_closed'
  | 'wip_limit_exceeded' | 'write_set_overlap' | 'budget_exhausted';

export interface AdmissionResult {
  story_id: string;
  admitted: boolean;
  denied_reason: DeniedReason | null;
  gates_checked: string[];
}

export async function checkAdmission(
  story: ExtendedStoryRecord,
  ctx: AdmissionContext,
  cfg: StoryManagerConfig,
): Promise<AdmissionResult> {
  const gates_checked: string[] = [];
  const storyMap = new Map(ctx.allStories.map(s => [s.story_id, s]));
  const checked_at = new Date().toISOString();

  function emit(admitted: boolean, denied_reason: DeniedReason | null): AdmissionResult {
    appendNextEvent(cfg.traceLogPath, {
      run_id: story.story_id,
      type: 'story_admission',
      payload: {
        story_id: story.story_id,
        admitted,
        denied_reason,
        gates_checked: [...gates_checked],
        checked_at,
      },
    });
    return { story_id: story.story_id, admitted, denied_reason, gates_checked: [...gates_checked] };
  }

  // Gate 1: deps done
  gates_checked.push('deps_done');
  for (const dep of story.depends_on) {
    const depStory = storyMap.get(dep);
    if (!depStory || depStory.status !== 'done') return emit(false, 'deps_not_done');
  }

  // Gate 2: human hold
  gates_checked.push('human_hold');
  if (story.human_hold) return emit(false, 'human_hold');

  // Gate 3: wave open
  gates_checked.push('wave_open');
  if (story.wave_id !== undefined && ctx.waveRegistry?.[story.wave_id] !== 'open') {
    return emit(false, 'wave_closed');
  }

  // Gate 4: WIP limit
  gates_checked.push('wip_limit');
  const runningInEpic = ctx.allStories.filter(
    s => s.status === 'in_progress' && s.epic_id === story.epic_id,
  ).length;
  if (runningInEpic >= cfg.maxWipPerEpic) return emit(false, 'wip_limit_exceeded');

  // Gate 5: write-set overlap
  gates_checked.push('write_set_overlap');
  const inProgressStories = ctx.allStories.filter(s => s.status === 'in_progress');
  const candidates = [story, ...inProgressStories].map(s => ({
    story_id: s.story_id,
    parallelism_class: s.parallelism_class,
    allowed_write_set: s.allowed_write_set ?? [],
  }));
  const plan = computeSpawnPlan(candidates);
  if (plan.sequential_queue.includes(story.story_id) && inProgressStories.length > 0) {
    return emit(false, 'write_set_overlap');
  }

  // Gate 6: budget
  gates_checked.push('budget');
  if (ctx.iterationsUsed >= ctx.iterationBudget) return emit(false, 'budget_exhausted');

  return emit(true, null);
}

export async function selectAdmissible(
  ctx: AdmissionContext,
  cfg: StoryManagerConfig,
): Promise<string[]> {
  const results = await Promise.all(
    ctx.allStories.map(story => checkAdmission(story as ExtendedStoryRecord, ctx, cfg)),
  );
  return results.filter(r => r.admitted).map(r => r.story_id);
}
