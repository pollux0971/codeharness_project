/** Minimal story entry shape needed for dependency graph traversal. */
export interface StoryDep {
  story_id: string;
  depends_on?: string[];
}

/**
 * Returns story_ids on the longest dependency chain (by hop count).
 * Algorithm: topological sort via DFS, then DP longest-path.
 * Returns [] if there are no stories; returns [any_id] when there are no edges.
 */
export function computeCriticalPath(stories: StoryDep[]): string[] {
  if (stories.length === 0) return [];

  const storyMap = new Map(stories.map(s => [s.story_id, s]));
  const visited = new Set<string>();
  const order: string[] = [];

  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const s = storyMap.get(id);
    for (const dep of (s?.depends_on ?? [])) {
      if (storyMap.has(dep)) dfs(dep);
    }
    order.push(id);
  }
  for (const s of stories) dfs(s.story_id);

  const dp: Record<string, number> = {};
  const parent: Record<string, string | null> = {};
  for (const id of order) {
    const s = storyMap.get(id)!;
    dp[id] = 1;
    parent[id] = null;
    for (const dep of (s?.depends_on ?? [])) {
      if (dp[dep] !== undefined && dp[dep] + 1 > dp[id]) {
        dp[id] = dp[dep] + 1;
        parent[id] = dep;
      }
    }
  }

  let maxId = '';
  let maxLen = 0;
  for (const s of stories) {
    if ((dp[s.story_id] ?? 0) > maxLen) {
      maxLen = dp[s.story_id];
      maxId = s.story_id;
    }
  }

  if (maxLen <= 1) return maxId ? [maxId] : [];

  const path: string[] = [];
  let cur: string | null = maxId;
  while (cur !== null) {
    path.push(cur);
    cur = parent[cur];
  }
  return path;
}
