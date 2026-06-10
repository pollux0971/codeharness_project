"""Rubric for a Patch Proposal. Returns (ok, errors). Input: proposal dict + write-set."""
import re
GRASP = {'REBIND', 'INSERT_PREREQ', 'SUBSTITUTE', 'REWIRE', 'BYPASS', 'ADD'}
def _covers(g, f):
    return re.match('^' + re.escape(g).replace(r'\*\*', '§').replace(r'\*', '[^/]*').replace('§', '.*') + '$', f) is not None
def evaluate(p: dict, allowed_write_set):
    e = []
    for k in ('proposal_id', 'story_id', 'contract_id', 'change_type', 'changed_files'):
        if not p.get(k): e.append(f'missing: {k}')
    if p.get('change_type') and p['change_type'] not in GRASP: e.append(f'change_type not a GRASP op: {p.get("change_type")}')
    files = p.get('changed_files') or []
    if not files: e.append('changed_files is empty')
    for f in files:
        if not any(_covers(g, f) for g in allowed_write_set): e.append(f'changed file outside write-set: {f}')
    if len((p.get('rollback_notes') or '').strip()) < 8: e.append('rollback_notes too vague (not reversible)')
    if not (p.get('test_plan') or '').strip(): e.append('missing test_plan')
    if not (p.get('summary') or '').strip(): e.append('missing summary')
    return (len(e) == 0, e)
