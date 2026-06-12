"""Rubric for budget-governance verdict validation."""

def evaluate(bs):
    e = []
    for k in ('story_id', 'attempts_used', 'attempt_budget', 'same_signature_count'):
        if bs.get(k) is None:
            e.append(f'missing: {k}')
    verdict = bs.get('verdict')
    if verdict not in ('continue', 'halt', 'escalate'):
        e.append(f'bad verdict: {verdict}')
    au = bs.get('attempts_used', 0)
    ab = bs.get('attempt_budget', 3)
    sc = bs.get('same_signature_count', 0)
    if au >= ab and verdict != 'escalate':
        e.append('attempt budget reached; verdict must be escalate')
    if sc >= 2 and verdict not in ('escalate', 'halt'):
        e.append('repeated signature; verdict must be escalate or halt')
    return (len(e) == 0, e)
