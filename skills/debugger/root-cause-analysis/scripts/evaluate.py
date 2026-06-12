"""Rubric for a Debugger root-cause-analysis output. Returns (ok, errors)."""
METHODS = {'stack_trace', 'bisect', 'log_narrow', 'hypothesis_probe', 'diff_blame'}

def evaluate(rca: dict):
    e = []
    if not (rca.get('failure_description') or '').strip():
        e.append('missing failure_description')
    if not (rca.get('hypothesis') or '').strip():
        e.append('missing hypothesis')
    if rca.get('method') not in METHODS:
        e.append(f'bad method: {rca.get("method")}')
    if not (rca.get('evidence') or '').strip():
        e.append('missing evidence')
    if rca.get('scope_widened'):
        e.append('root_cause_analysis must not widen scope')
    hyp = (rca.get('hypothesis') or '').lower()
    if not any(w in hyp for w in ('if ', 'because ', 'when ', 'caused by')):
        e.append('hypothesis not falsifiable (needs if/because/when/caused by)')
    return (len(e) == 0, e)
