"""Rubric for a Debugger flaky-test-detection output. Returns (ok, errors)."""
CLASSIFICATIONS = {'real_failure', 'flaky', 'intermittent', 'undetermined'}

def evaluate(detection: dict):
    e = []
    runs = detection.get('run_count', 0)
    if runs < 3:
        e.append(f'flaky detection needs >=3 runs; got {runs}')
    if detection.get('classification') not in CLASSIFICATIONS:
        e.append(f'bad classification: {detection.get("classification")}')
    failures = detection.get('failure_count', 0)
    if detection.get('classification') == 'real_failure' and failures < runs:
        e.append('real_failure classification requires all runs to fail')
    if detection.get('classification') == 'flaky' and (failures == 0 or failures == runs):
        e.append('flaky classification requires some (not all, not zero) failures')
    if detection.get('escalated_on_first_run'):
        e.append('must not escalate on first run -- re-run protocol required')
    return (len(e) == 0, e)
