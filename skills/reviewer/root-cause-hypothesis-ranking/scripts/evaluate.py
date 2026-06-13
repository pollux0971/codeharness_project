"""Rubric for root-cause-hypothesis-ranking skill. Returns (ok, errors)."""

def evaluate(ranking):
    e = []
    hyps = ranking.get('hypotheses') or []
    if not hyps:
        e.append('must have at least one hypothesis')
    for i, h in enumerate(hyps):
        if not (h.get('hypothesis') or '').strip() or len((h.get('hypothesis') or '').split()) < 3:
            e.append(f'hypothesis[{i}] too vague (< 3 words)')
        conf = h.get('confidence', -1)
        if not (0.0 <= conf <= 1.0):
            e.append(f'hypothesis[{i}] confidence {conf} out of range')
        if not isinstance(h.get('evidence_lines'), list):
            e.append(f'hypothesis[{i}] missing evidence_lines')
        hyp_text = (h.get('hypothesis') or '').lower()
        if not any(w in hyp_text for w in ('if ', 'when ', 'because ', 'caused by', 'the ')):
            e.append(f'hypothesis[{i}] not falsifiable')
    confs = [h.get('confidence', 0) for h in hyps]
    if confs != sorted(confs, reverse=True):
        e.append('hypotheses not ranked by descending confidence')
    return (len(e) == 0, e)
