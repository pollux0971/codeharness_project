"""Rubric for improvement-direction-authoring skill. Returns (ok, errors)."""
DIRECTION_TYPES = {
    'change_implementation', 'tighten_test', 'widen_write_set',
    'clarify_spec', 'add_prereq_check',
}

def evaluate(directions):
    e = []
    items = directions.get('items') or []
    if not items:
        e.append('must have at least one direction')
    for i, d in enumerate(items):
        if d.get('direction_type') not in DIRECTION_TYPES:
            e.append(f'items[{i}] bad direction_type: {d.get("direction_type")}')
        if len((d.get('rationale') or '').split()) < 5:
            e.append(f'items[{i}] rationale too short (< 5 words)')
        if d.get('direction_type') == 'widen_write_set' and not d.get('scope_expansion_flagged'):
            e.append(f'items[{i}] widen_write_set must have scope_expansion_flagged: true')
    return (len(e) == 0, e)
