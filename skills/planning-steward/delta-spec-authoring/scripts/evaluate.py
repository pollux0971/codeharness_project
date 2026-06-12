"""Rubric for a brownfield delta-spec artifact. Returns (ok, errors)."""

def _overlaps(write_set, frozen):
    """Return True if any write_set path starts with any frozen prefix (stripped of globs)."""
    def norm(p):
        return p.rstrip('/*').rstrip('*')
    for w in write_set:
        for f in frozen:
            fp = norm(f)
            if fp and (w == fp or w.startswith(fp + '/') or w.startswith(fp)):
                return True
    return False

def evaluate(delta):
    e = []
    if not (delta.get('delta_id') or '').strip():
        e.append('missing delta_id')
    affected = delta.get('affected_files') or []
    if not isinstance(affected, list) or len(affected) == 0:
        e.append('affected_files must be a non-empty list')
    write_set = delta.get('write_set') or []
    if not isinstance(write_set, list) or len(write_set) == 0:
        e.append('write_set must be a non-empty list')
    summary = delta.get('change_summary', '')
    if len(summary.strip()) < 20:
        e.append('change_summary must be at least 20 characters')
    frozen = delta.get('public_api_frozen') or []
    if write_set and frozen and _overlaps(write_set, frozen):
        e.append('write_set overlaps public_api_frozen — violation')
    return (len(e) == 0, e)
