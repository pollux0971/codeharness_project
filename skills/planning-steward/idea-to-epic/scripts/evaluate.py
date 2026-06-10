"""Rubric for an epic/story graph. Returns (ok, errors)."""
PCLASS = {'sequential', 'parallel_safe', 'barrier', 'exclusive'}
def _acyclic(nodes, edges):
    color = {n: 0 for n in nodes}
    def dfs(n):
        color[n] = 1
        for m in edges.get(n, []):
            if color.get(m, 0) == 1: return False
            if color.get(m, 0) == 0 and not dfs(m): return False
        color[n] = 2; return True
    return all(color[n] != 0 or dfs(n) for n in nodes)
def evaluate(graph: dict):
    errors = []
    epics = graph.get('epics') or []
    stories = graph.get('stories') or []
    epic_ids = {e.get('epic_id') for e in epics}
    for e in epics:
        if not (e.get('exit_criteria') or '').strip(): errors.append(f"epic {e.get('epic_id')} has no exit_criteria")
    sids = [s.get('story_id') for s in stories]
    if len(sids) != len(set(sids)): errors.append('duplicate story_id')
    for s in stories:
        sid = s.get('story_id')
        if not (s.get('objective') or '').strip(): errors.append(f'{sid}: empty objective')
        if s.get('parallelism_class') not in PCLASS: errors.append(f'{sid}: bad parallelism_class {s.get("parallelism_class")!r}')
        if s.get('epic_id') not in epic_ids: errors.append(f'{sid}: epic_id not declared')
        for d in s.get('depends_on') or []:
            if d not in sids: errors.append(f'{sid}: depends_on unknown story {d}')
    edges = {s.get('story_id'): (s.get('depends_on') or []) for s in stories}
    if not _acyclic(sids, edges): errors.append('story dependency graph has a cycle')
    return (len(errors) == 0, errors)
