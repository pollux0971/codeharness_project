import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_toi", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'test_name': 'divide(10, 2) returns 5',
    'assertion_type': 'equality',
    'actual': 'NaN',
    'expected': '5',
    'evidence_lines': ['Expected: 5', 'Received: NaN'],
    'stack_summary': 'at divide (calc.ts:3)',
}

def test_good_interpretation_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_missing_test_name_fails():
    assert evaluate({**GOOD, 'test_name': ''})[0] is False

def test_bad_assertion_type_fails():
    assert evaluate({**GOOD, 'assertion_type': 'cosmic_ray'})[0] is False

def test_implementation_intent_present_fails():
    assert evaluate({**GOOD, 'implementation_intent': 'developer forgot to handle NaN'})[0] is False

def test_equality_without_actual_fails():
    d = {**GOOD}
    del d['actual']
    assert evaluate(d)[0] is False
