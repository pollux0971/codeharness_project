import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_supervisor_escalation_triage", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'escalation_type': 'needs_clarification',
    'decision': 'retry_with_guidance',
    'rationale': 'The agent lacked enough context to complete the task.',
    'retry_limit': 2,
}

def test_valid_triage_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_bad_decision_fails():
    assert evaluate({**GOOD, 'decision': 'auto_approve'})[0] is False

def test_scope_expansion_without_human_gate_fails():
    assert evaluate({**GOOD, 'escalation_type': 'needs_scope_expansion', 'decision': 'retry_with_guidance'})[0] is False

def test_repeated_failure_retry_without_limit_fails():
    bad = {**GOOD, 'escalation_type': 'repeated_failure', 'decision': 'retry_with_guidance', 'retry_limit': None}
    assert evaluate(bad)[0] is False

def test_missing_rationale_fails():
    assert evaluate({**GOOD, 'rationale': ''})[0] is False
