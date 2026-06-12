"""Rubric for a Debugger failure-gene-authoring output. Returns (ok, errors)."""
FTYPES = {
    'test_failure', 'build_error', 'type_error', 'runtime_error',
    'validation_fail', 'regression', 'timeout', 'scope_error', 'skill_failure', 'unknown'
}
GRASP = {'REBIND', 'INSERT_PREREQ', 'SUBSTITUTE', 'REWIRE', 'BYPASS', 'none'}

def evaluate(gene: dict, existing_signals=None):
    e = []
    for k in ('id', 'matching_signal', 'summary', 'avoid', 'failure_type', 'repair_operator', 'story_id'):
        if not gene.get(k):
            e.append(f'missing: {k}')
    if gene.get('failure_type') not in FTYPES:
        e.append(f'bad failure_type: {gene.get("failure_type")}')
    if gene.get('repair_operator') not in GRASP:
        e.append(f'bad repair_operator: {gene.get("repair_operator")}')
    avoid = (gene.get('avoid') or '').strip()
    if avoid and len(avoid.split()) > 40:
        e.append('avoid exceeds 40 words')
    if avoid and not any(avoid.upper().startswith(p) for p in ('DO NOT', 'NEVER', 'AVOID', 'ALWAYS')):
        e.append('avoid must start with DO NOT / NEVER / AVOID / ALWAYS (imperative)')
    sig = gene.get('matching_signal') or ''
    if '|' not in sig and ':' not in sig:
        e.append('matching_signal needs pipe-separated key:value tokens')
    if existing_signals and sig in existing_signals:
        cc = gene.get('consolidated_count', 1)
        if cc <= 1:
            e.append('duplicate signal must increment consolidated_count')
    return (len(e) == 0, e)
