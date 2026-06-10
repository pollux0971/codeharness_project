"""Rubric for a Debugger triage output. Returns (ok, errors)."""
FT = {'test', 'typecheck', 'lint', 'runtime', 'schema', 'integration'}
GRASP = {'REBIND', 'INSERT_PREREQ', 'SUBSTITUTE', 'REWIRE', 'BYPASS'}
def evaluate(o: dict):
    e = []
    if o.get('failure_type') not in FT: e.append(f'bad failure_type: {o.get("failure_type")}')
    sig = o.get('matching_signal') or ''
    if '|' not in sig: e.append('matching_signal not pipe-delimited')
    if not (o.get('root_cause_hypothesis') or '').strip(): e.append('missing root_cause_hypothesis')
    if o.get('repair_operator') not in GRASP: e.append(f'repair_operator not a GRASP op: {o.get("repair_operator")}')
    gene = o.get('failure_gene') or {}
    avoid = (gene.get('avoid') or '').strip()
    if not avoid: e.append('failure_gene.avoid missing')
    elif len(avoid.split()) > 40: e.append('failure_gene.avoid exceeds 40 words')
    if o.get('changes_story_goal'): e.append('must not modify the story goal/acceptance')
    if o.get('needs_scope_expansion') and o.get('repair_proposal') is not None: e.append('scope expansion needed but a repair was attached')
    return (len(e) == 0, e)
