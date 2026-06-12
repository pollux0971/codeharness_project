import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_supervisor_task_packet_composition", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

CONTRACT = {
    'allowed_write_set': ['codeharness/packages/foo/src/**', 'codeharness/packages/bar/src/**'],
}
GOOD = {
    'packet_id': 'pkt-001',
    'story_id': 'STORY-001',
    'story_contract_ref': 'contracts/STORY-001.json',
    'target_agent': 'developer',
    'context_packet': {'objective': 'implement feature X'},
    'output_required': ['patch.diff', 'test_plan.md'],
    'allowed_write_set': ['codeharness/packages/foo/src/**'],
    'attempt_budget': 3,
}

def test_good_packet_passes():
    ok, errs = evaluate(GOOD, CONTRACT)
    assert ok, errs

def test_missing_packet_id_fails():
    assert evaluate({**GOOD, 'packet_id': ''}, CONTRACT)[0] is False

def test_bad_target_agent_fails():
    assert evaluate({**GOOD, 'target_agent': 'unknown_role'}, CONTRACT)[0] is False

def test_write_set_widening_fails():
    widened = {**GOOD, 'allowed_write_set': ['codeharness/packages/baz/src/**']}
    assert evaluate(widened, CONTRACT)[0] is False

def test_zero_attempt_budget_fails():
    assert evaluate({**GOOD, 'attempt_budget': 0}, CONTRACT)[0] is False
