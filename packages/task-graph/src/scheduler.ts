import { selectNextStory } from '@codeharness/harness-core';
import type { StoryRecord, CheckpointRecord } from '@codeharness/harness-core';

// ---- STORY-010.4: minimal structural interface for the isolation pool ----
// WorkspaceIsolationPool from @codeharness/workspace-manager satisfies this.
interface IsolatedRunItem {
  story_id: string;
  result: 'passed' | 'escalated';
  checkpoint_sha: string | null;
}

export interface IsolationPool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runBatch(stories: { story_id: string }[], runFn: (sid: string, ws: any) => Promise<boolean>): Promise<IsolatedRunItem[]>;
  mergeInOrder(runs: IsolatedRunItem[], targetRoot: string): Promise<string[]>;
}

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

export interface ParallelSchedulerOptions {
  stories: StoryRecord[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runInnerLoopIsolated: (story: StoryRecord, ws: any) => Promise<boolean>;
  runInnerLoopSequential: (story: StoryRecord) => Promise<boolean>;
  onCheckpoint: (story: StoryRecord) => Promise<CheckpointRecord>;
  pool: IsolationPool;
  mergeTargetRoot: string;
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

// ---- STORY-010.4: Parallel scheduler ----

export async function runParallelScheduler(
  opts: ParallelSchedulerOptions,
): Promise<SchedulerResult> {
  const completed: string[] = [];
  let iterations = 0;

  for (;;) {
    if (opts.runBudget !== undefined && iterations >= opts.runBudget) {
      return { outcome: 'halted', completed, reason: 'run_budget_exceeded' };
    }

    const doneSet = new Set(opts.stories.filter(s => s.status === 'done').map(s => s.story_id));
    const batchParallel = opts.stories.filter(s =>
      s.status === 'todo' &&
      s.parallelism_class === 'parallel_safe' &&
      s.depends_on.every(dep => doneSet.has(dep)),
    );
    const nextSequential = selectNextStory(opts.stories);

    if (batchParallel.length === 0 && nextSequential === null) {
      return { outcome: 'all_done', completed };
    }

    if (batchParallel.length > 0) {
      for (const s of batchParallel) s.status = 'in_progress';

      const runs = await opts.pool.runBatch(
        batchParallel,
        (sid, ws) => {
          const story = opts.stories.find(s => s.story_id === sid)!;
          return opts.runInnerLoopIsolated(story, ws);
        },
      );

      await opts.pool.mergeInOrder(runs, opts.mergeTargetRoot);

      const sortedRuns = [...runs].sort((a, b) => a.story_id.localeCompare(b.story_id));
      for (const run of sortedRuns) {
        const story = opts.stories.find(s => s.story_id === run.story_id)!;
        if (run.result === 'escalated') {
          story.status = 'escalated';
          return {
            outcome: 'escalated',
            completed,
            escalated_story: run.story_id,
            reason: 'inner loop failure',
          };
        }
        await opts.onCheckpoint(story);
        story.status = 'done';
        completed.push(story.story_id);
      }

      iterations += batchParallel.length;
    } else {
      const story = opts.stories.find(s => s.story_id === nextSequential)!;
      story.status = 'in_progress';

      let passed: boolean;
      try {
        passed = await opts.runInnerLoopSequential(story);
      } catch {
        passed = false;
      }

      if (!passed) {
        story.status = 'escalated';
        return {
          outcome: 'escalated',
          completed,
          escalated_story: story.story_id,
          reason: 'inner loop failure',
        };
      }

      await opts.onCheckpoint(story);
      story.status = 'done';
      completed.push(story.story_id);
      iterations++;
    }
  }
}
