import { createTraceEvent, appendJsonl } from '@codeharness/event-log';

export interface SpawnCandidate {
  story_id: string;
  parallelism_class: string;
  allowed_write_set: string[];
}

export interface SpawnPlan {
  parallel_batch: string[];
  sequential_queue: string[];
  overlap_pairs: [string, string][];
}

function globPrefix(glob: string): string {
  const idx = glob.search(/[*?{]/);
  const prefix = idx === -1 ? glob : glob.slice(0, idx);
  const lastSlash = prefix.lastIndexOf('/');
  return lastSlash === -1 ? prefix : prefix.slice(0, lastSlash + 1);
}

function writeSetsOverlap(a: string[], b: string[]): boolean {
  for (const ga of a) {
    for (const gb of b) {
      const pa = globPrefix(ga);
      const pb = globPrefix(gb);
      if (pa.startsWith(pb) || pb.startsWith(pa)) return true;
    }
  }
  return false;
}

export function computeSpawnPlan(candidates: SpawnCandidate[]): SpawnPlan {
  const parallel_batch: string[] = [];
  const sequential_queue: string[] = [];
  const overlap_pairs: [string, string][] = [];

  const exclusives = candidates.filter(c => c.parallelism_class === 'exclusive');
  const parallels = candidates.filter(c => c.parallelism_class !== 'exclusive');

  for (const e of exclusives) sequential_queue.push(e.story_id);

  const sorted = [...parallels].sort((a, b) => a.story_id.localeCompare(b.story_id));

  const adj = new Map<string, Set<string>>();
  for (const c of sorted) adj.set(c.story_id, new Set());

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (writeSetsOverlap(a.allowed_write_set, b.allowed_write_set)) {
        overlap_pairs.push([a.story_id, b.story_id]);
        adj.get(a.story_id)!.add(b.story_id);
        adj.get(b.story_id)!.add(a.story_id);
      }
    }
  }

  const visited = new Set<string>();
  for (const c of sorted) {
    if (visited.has(c.story_id)) continue;
    const component: string[] = [];
    const queue = [c.story_id];
    visited.add(c.story_id);
    while (queue.length > 0) {
      const node = queue.shift()!;
      component.push(node);
      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const hasConflict = component.some(id => (adj.get(id)?.size ?? 0) > 0);
    const sortedComponent = [...component].sort();
    if (hasConflict) {
      parallel_batch.push(sortedComponent[0]);
      for (let i = 1; i < sortedComponent.length; i++) {
        sequential_queue.push(sortedComponent[i]);
      }
    } else {
      parallel_batch.push(...sortedComponent);
    }
  }

  return { parallel_batch, sequential_queue, overlap_pairs };
}

export async function recordSpawnPlan(plan: SpawnPlan, traceLogPath: string): Promise<void> {
  const e = createTraceEvent({
    run_id: 'spawn-plan',
    seq: 0,
    type: 'spawn_plan',
    payload: plan as unknown as Record<string, unknown>,
  });
  appendJsonl(traceLogPath, e);
}
