"""Rubric for a structured escalation. Returns (ok, errors)."""
TYPES={'needs_clarification','needs_scope_expansion','blocked_by_missing_context','blocked_by_policy','repeated_failure'}
def evaluate(e):
    errs=[]
    if e.get('type') not in TYPES: errs.append(f'bad type {e.get("type")}')
    if not (e.get('reason') or '').strip(): errs.append('missing reason')
    if not (e.get('requested_decision') or '').strip(): errs.append('missing requested_decision')
    for o in e.get('options') or []:
        if not o.get('option_id') or not o.get('tradeoff'): errs.append('option needs option_id + tradeoff')
    if e.get('type') in ('blocked_by_missing_context','repeated_failure') and not (e.get('evidence_refs') or []):
        errs.append('this type requires at least one evidence_ref')
    return (len(errs)==0, errs)
