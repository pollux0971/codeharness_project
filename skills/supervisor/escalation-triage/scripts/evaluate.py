"""Rubric for escalation-triage decision validation."""
ETYPE = {'needs_clarification', 'needs_scope_expansion', 'blocked_by_missing_context',
         'blocked_by_policy', 'repeated_failure'}
DECISION = {'retry_with_guidance', 'human_gate', 're_scope', 'reject'}

def evaluate(triage):
    e = []
    if triage.get('escalation_type') not in ETYPE:
        e.append(f'bad escalation_type: {triage.get("escalation_type")}')
    if triage.get('decision') not in DECISION:
        e.append(f'bad decision: {triage.get("decision")}')
    if not (triage.get('rationale') or '').strip():
        e.append('missing rationale')
    if triage.get('escalation_type') == 'needs_scope_expansion' and triage.get('decision') != 'human_gate':
        e.append('scope_expansion must be human_gate, not auto-approved')
    if triage.get('escalation_type') == 'repeated_failure' and triage.get('decision') == 'retry_with_guidance':
        if not triage.get('retry_limit'):
            e.append('repeated_failure retry must specify retry_limit')
    return (len(e) == 0, e)
