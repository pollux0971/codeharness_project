"""Rubric for a Debugger minimal-repair-pattern output. Returns (ok, errors)."""
GRASP = {'REBIND', 'INSERT_PREREQ', 'SUBSTITUTE', 'REWIRE', 'BYPASS'}

def evaluate(repair: dict):
    e = []
    if repair.get('operator') not in GRASP:
        e.append(f'bad operator: {repair.get("operator")}')
    if not (repair.get('target_file') or '').strip():
        e.append('missing target_file')
    if not (repair.get('change_description') or '').strip():
        e.append('missing change_description')
    if not (repair.get('rollback_notes') or '').strip():
        e.append('missing rollback_notes')
    files = repair.get('changed_files') or []
    if len(files) > 3:
        e.append(f'repair touches {len(files)} files; minimal repair is <=3')
    if repair.get('operator') == 'ADD' and repair.get('is_new_feature'):
        e.append('minimal-repair must not add new features')
    return (len(e) == 0, e)
