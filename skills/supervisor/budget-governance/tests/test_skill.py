import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_supervisor_budget_governance", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'story_id': 'STORY-001',
    'attempts_used': 1,
    'attempt_budget': 3,
    'same_signature_count': 0,
    'verdict': 'continue',
}

def test_healthy_state_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_budget_reached_without_escalate_fails():
    assert evaluate({**GOOD, 'attempts_used': 3, 'verdict': 'continue'})[0] is False

def test_repeated_signature_without_escalate_fails():
    assert evaluate({**GOOD, 'same_signature_count': 2, 'verdict': 'continue'})[0] is False

def test_bad_verdict_fails():
    assert evaluate({**GOOD, 'verdict': 'unknown_verdict'})[0] is False

def test_missing_field_fails():
    assert evaluate({**GOOD, 'story_id': None})[0] is False
