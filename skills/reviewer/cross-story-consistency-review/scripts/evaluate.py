"""Rubric for cross-story-consistency-review skill. Returns (ok, errors)."""

def evaluate(review):
    e = []
    violations = review.get('consistency_violations') or []
    if not violations and review.get('run_had_parallel_stories'):
        e.append('cross-story review must check consistency in parallel runs')
    for i, v in enumerate(violations):
        if len((v.get('description') or '').split()) < 5:
            e.append(f'violations[{i}] description too short')
        if not v.get('affected_story_ids'):
            e.append(f'violations[{i}] must name affected stories')
    rr = review.get('rescope_recommendation')
    if rr and not rr.get('advisory_only'):
        e.append('rescope_recommendation must have advisory_only: true')
    return (len(e) == 0, e)
