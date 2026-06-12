"""Rubric for a brownfield architecture-recovery artifact. Returns (ok, errors)."""
LAYERS = {'api', 'domain', 'infra', 'test', 'config', 'root'}

def evaluate(recovery):
    e = []
    if not recovery.get('intake_id'):
        e.append('missing intake_id')
    if not isinstance(recovery.get('entry_points'), list):
        e.append('entry_points must be a list')
    layers = recovery.get('layers') or []
    for l in layers:
        if l.get('name') not in LAYERS:
            e.append(f'unknown layer: {l.get("name")}')
    if not (recovery.get('recovery_docs_path') or '').strip():
        e.append('missing recovery_docs_path')
    if 'as-is' not in (recovery.get('recovery_docs_path') or ''):
        e.append('recovery_docs_path must point to as-is/ area')
    if recovery.get('wrote_inside_source_repo'):
        e.append('wrote inside source repo — violation')
    return (len(e) == 0, e)
