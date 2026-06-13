"""Rubric for what-not-to-change-guardrails skill. Returns (ok, errors)."""

def evaluate(guardrails, passing_tests=None):
    e = []
    dnt = guardrails.get('do_not_touch') or []
    if not dnt:
        e.append('do_not_touch must have at least one entry')
    rationale = guardrails.get('rationale_per_entry') or {}
    for entry in dnt:
        if not rationale.get(entry, '').strip():
            e.append(f'do_not_touch["{entry}"] missing rationale')
    if passing_tests:
        for pt in passing_tests:
            if not any(pt in entry or entry in pt for entry in dnt):
                e.append(f'passing test {pt} must be in do_not_touch')
    return (len(e) == 0, e)
