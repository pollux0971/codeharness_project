import { selectNextStory } from '@codeharness/harness-core';
import type { StoryRecord, CheckpointRecord } from '@codeharness/harness-core';

export type SchedulerResult =
  | { outcome: 'all_done'; completed: string[] }
  | { outcome: 'escalated'; completed: string[]; escalated_story: string; reason: string }
  | { outcome: 'halted'; completed: string[]; reason: string };

export interface SchedulerRunOptions {
  stories: StoryRecord[];
  runInnerLoop: (story: StoryRecord) => Promise<boolean>;
  onCheckpoint: (story: StoryRecord) => Promise<CheckpointRecord>;
  runBudget?: number;
}

export async function runSequentialScheduler(
  opts: SchedulerRunOptions,
): Promise<SchedulerResult> {
  const completed: string[] = [];
  let iterations = 0;

  for (;;) {
    if (opts.runBudget !== undefined && iterations >= opts.runBudget) {
      return { outcome: 'halted', completed, reason: 'run_budget_exceeded' };
    }

    const nextId = selectNextStory(opts.stories);
    if (nextId === null) {
      return { outcome: 'all_done', completed };
    }

    const story = opts.stories.find(s => s.story_id === nextId)!;
    story.status = 'in_progress';

    let passed: boolean;
    try {
      passed = await opts.runInnerLoop(story);
    } catch {
      passed = false;
    }

    if (!passed) {
      story.status = 'escalated';
      return {
        outcome: 'escalated',
        completed,
        escalated_story: story.story_id,
        reason: 'attempt_budget_exceeded or inner loop failure',
      };
    }

    try {
      await opts.onCheckpoint(story);
    } catch {
      story.status = 'escalated';
      return {
        outcome: 'escalated',
        completed,
        escalated_story: story.story_id,
        reason: 'checkpoint failed',
      };
    }

    story.status = 'done';
    completed.push(story.story_id);
    iterations++;
  }
}
