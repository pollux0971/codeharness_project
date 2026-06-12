import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("debugger_ftd_eval", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'run_count': 3,
    'failure_count': 3,
    'classification': 'real_failure',
    'escalated_on_first_run': False,
}

def test_good_detection_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_fewer_than_3_runs_fails():
    ok, errs = evaluate({**GOOD, 'run_count': 2, 'failure_count': 2})
    assert not ok
    assert any('>=3 runs' in err for err in errs)

def test_wrong_classification_for_pattern_fails():
    # 2 out of 3 failures classified as real_failure is wrong (should be flaky)
    ok, errs = evaluate({**GOOD, 'run_count': 3, 'failure_count': 2, 'classification': 'real_failure'})
    assert not ok
    assert any('all runs to fail' in err for err in errs)

def test_escalated_on_first_run_fails():
    ok, errs = evaluate({**GOOD, 'escalated_on_first_run': True})
    assert not ok
    assert any('first run' in err for err in errs)

def test_undetermined_with_3_mixed_runs_passes():
    detection = {
        'run_count': 3,
        'failure_count': 1,
        'classification': 'undetermined',
        'escalated_on_first_run': False,
    }
    ok, errs = evaluate(detection)
    assert ok, errs
