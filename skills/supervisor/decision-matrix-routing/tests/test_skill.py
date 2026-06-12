import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_supervisor_decision_matrix_routing", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'state': 'develop',
    'story_status': 'in_progress',
    'attempts': 1,
    'budget': 3,
    'validation_passed': False,
    'result': None,
    'action': 'develop_patch',
}

def test_good_routing_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_bad_state_fails():
    assert evaluate({**GOOD, 'state': 'nonexistent_state'})[0] is False

def test_budget_exhausted_without_escalate_fails():
    assert evaluate({**GOOD, 'attempts': 3, 'budget': 3, 'action': 'develop_patch'})[0] is False

def test_passed_validation_with_route_debugger_fails():
    assert evaluate({**GOOD, 'validation_passed': True, 'action': 'route_debugger'})[0] is False

def test_unknown_action_fails():
    assert evaluate({**GOOD, 'action': 'do_something_weird'})[0] is False
