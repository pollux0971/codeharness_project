"""Rubric for a subtask decomposition. Returns (ok, errors).
Input: subtasks (list of dicts) + allowed_write_set (list of globs)."""
import re
def _covers(g, f):
    rx = '^' + re.escape(g).replace(r'\*\*', '§').replace(r'\*', '[^/]*').replace('§', '.*') + '$'
    return re.match(rx, f) is not None
def _covered(f, ws): return any(_covers(g, f) for g in ws)

def _acyclic(nodes, edges):
    color = {n: 0 for n in nodes}
    def dfs(n):
        color[n] = 1
        for m in edges.get(n, []):
            if color.get(m, 0) == 1: return False
            if color.get(m, 0) == 0 and not dfs(m): return False
        color[n] = 2; return True
    return all(color[n] != 0 or dfs(n) for n in nodes)

def evaluate(subtasks, allowed_write_set, file_cap=5):
    errors = []
    ids = [s.get('id', f'#{i}') for i, s in enumerate(subtasks)]
    seen_intents = set()
    for i, s in enumerate(subtasks):
        sid = s.get('id', f'#{i}')
        intent = (s.get('intent') or '').strip()
        if not intent: errors.append(f'{sid}: empty intent')
        if intent and intent in seen_intents: errors.append(f'{sid}: duplicate intent')
        seen_intents.add(intent)
        files = s.get('files_touched') or []
        for f in files:
            if not _covered(f, allowed_write_set):
                errors.append(f'{sid}: file outside write-set: {f}')
        if len(files) > file_cap:
            errors.append(f'{sid}: touches {len(files)} files (> cap {file_cap}); split it')
        for d in s.get('depends_on') or []:
            if d not in ids: errors.append(f'{sid}: depends_on unknown subtask {d}')
            elif ids.index(d) > i: errors.append(f'{sid}: depends_on a later subtask {d}')
    edges = {s.get('id', f'#{i}'): (s.get('depends_on') or []) for i, s in enumerate(subtasks)}
    if not _acyclic(ids, edges): errors.append('dependency graph has a cycle')
    return (len(errors) == 0, errors)
