/**
 * @codeharness/planning-steward — parallelism model
 * STORY-000.4: story graph and parallelism rules.
 *
 * Formalises the StoryNode dependency graph: conflict detection,
 * topological readiness, full graph validation (missing deps, self-deps, cycles),
 * and deterministic topological ordering.
 */
export type { StoryNode } from './index.js';
export { detectParallelismConflict, selectableStories } from './index.js';

import type { StoryNode } from './index.js';

export interface StoryGraphResult {
  ok: boolean;
  errors: string[];
  topologicalOrder: string[] | null;
}

/**
 * Validate the full story dependency graph.
 * Reports ALL errors (missing deps, self-deps, cycles) — not just the first.
 * topologicalOrder is null when a cycle is present.
 */
export function validateStoryGraph(stories: StoryNode[]): StoryGraphResult {
  const errors: string[] = [];
  const ids = new Set(stories.map(s => s.story_id));

  for (const s of stories) {
    if (s.depends_on.includes(s.story_id)) {
      errors.push(`self-dependency: ${s.story_id}`);
    }
    for (const dep of s.depends_on) {
      if (!ids.has(dep)) {
        errors.push(`${s.story_id} depends on unknown story: ${dep}`);
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors, topologicalOrder: null };

  const order = topologicalSort(stories);
  if (order === null) {
    return { ok: false, errors: ['dependency cycle detected'], topologicalOrder: null };
  }
  return { ok: true, errors: [], topologicalOrder: order };
}

/**
 * Deterministic topological sort via Kahn's algorithm.
 * Ties broken lexicographically by story_id.
 * Returns null when a cycle is detected.
 */
export function topologicalSort(stories: StoryNode[]): string[] | null {
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const s of stories) {
    if (!inDegree.has(s.story_id)) inDegree.set(s.story_id, 0);
    if (!successors.has(s.story_id)) successors.set(s.story_id, []);
    for (const dep of s.depends_on) {
      if (!successors.has(dep)) successors.set(dep, []);
      successors.get(dep)!.push(s.story_id);
      inDegree.set(s.story_id, (inDegree.get(s.story_id) ?? 0) + 1);
    }
  }

  const queue: string[] = [...stories]
    .filter(s => (inDegree.get(s.story_id) ?? 0) === 0)
    .map(s => s.story_id)
    .sort();

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);
    const next: string[] = [];
    for (const neighbor of (successors.get(node) ?? [])) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) next.push(neighbor);
    }
    next.sort();
    queue.push(...next);
  }

  return result.length === stories.length ? result : null;
}
