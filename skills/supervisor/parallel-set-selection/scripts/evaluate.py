"""Rubric for a parallel-set selection decision."""

def _overlaps(ws_a, ws_b):
    def prefix(g):
        return g.split('*')[0]
    return any(
        prefix(a) == prefix(b)
        or prefix(a).startswith(prefix(b))
        or prefix(b).startswith(prefix(a))
        for a in ws_a for b in ws_b
    )

def evaluate(selection, stories):
    e = []
    pset = selection.get('parallel_set') or []
    for sid in pset:
        s = next((x for x in stories if x['story_id'] == sid), None)
        if not s:
            e.append(f'parallel_set contains unknown story: {sid}')
        elif s.get('parallelism_class') != 'parallel_safe':
            e.append(f'{sid} is not parallel_safe')
    ws_list = [
        (s['story_id'], s.get('allowed_write_set', []))
        for s in stories if s['story_id'] in pset
    ]
    for i, (sid_a, ws_a) in enumerate(ws_list):
        for sid_b, ws_b in ws_list[i + 1:]:
            if _overlaps(ws_a, ws_b):
                e.append(f'write-set overlap: {sid_a} vs {sid_b}')
    return (len(e) == 0, e)
