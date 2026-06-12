import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("debugger_rca_eval", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'failure_description': 'TypeError raised when calling process() with None input',
    'hypothesis': 'if input is None, the guard check is missing because validate() is never called',
    'method': 'stack_trace',
    'evidence': 'Stack trace shows AttributeError on line 42 of processor.py with input=None',
    'scope_widened': False,
}

def test_good_rca_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_missing_hypothesis_fails():
    ok, errs = evaluate({**GOOD, 'hypothesis': ''})
    assert not ok
    assert any('hypothesis' in err for err in errs)

def test_bad_method_fails():
    ok, errs = evaluate({**GOOD, 'method': 'crystal_ball'})
    assert not ok
    assert any('bad method' in err for err in errs)

def test_scope_widened_fails():
    ok, errs = evaluate({**GOOD, 'scope_widened': True})
    assert not ok
    assert any('scope' in err for err in errs)

def test_unfalsifiable_hypothesis_fails():
    ok, errs = evaluate({**GOOD, 'hypothesis': 'something is broken'})
    assert not ok
    assert any('falsifiable' in err for err in errs)
