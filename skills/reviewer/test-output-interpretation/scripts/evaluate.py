"""Rubric for test-output-interpretation skill. Returns (ok, errors)."""
ASSERTION_TYPES = {
    'equality', 'inequality', 'throws', 'rejects', 'truthy', 'falsy',
    'type_error', 'timeout', 'unknown',
}

def evaluate(interpretation):
    e = []
    if not (interpretation.get('test_name') or '').strip():
        e.append('missing test_name')
    if interpretation.get('assertion_type') not in ASSERTION_TYPES:
        e.append(f'bad assertion_type: {interpretation.get("assertion_type")}')
    if not isinstance(interpretation.get('evidence_lines'), list):
        e.append('evidence_lines must be a list')
    if interpretation.get('implementation_intent'):
        e.append('test-output-interpretation must not infer implementation intent')
    if interpretation.get('assertion_type') == 'equality':
        if interpretation.get('actual') is None:
            e.append('equality assertion missing actual')
        if interpretation.get('expected') is None:
            e.append('equality assertion missing expected')
    return (len(e) == 0, e)
