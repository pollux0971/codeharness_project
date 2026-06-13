import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_acr", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'conforms': True,
    'violations': [],
}

def test_good_conformance_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_missing_conforms_fails():
    ok, errs = evaluate({'violations': []})
    assert not ok
    assert any('conforms' in e for e in errs)

def test_non_conforming_without_violations_fails():
    ok, errs = evaluate({'conforms': False, 'violations': []})
    assert not ok
    assert any('violations' in e for e in errs)

def test_non_advisory_rescope_fails():
    review = {
        **GOOD,
        'rescope_recommendation': {'advisory_only': False, 'rationale': 'shrink', 'direction': 'scope_in'},
    }
    ok, errs = evaluate(review)
    assert not ok
    assert any('advisory_only' in e for e in errs)

def test_bad_direction_fails():
    review = {
        **GOOD,
        'rescope_recommendation': {'advisory_only': True, 'rationale': 'move out', 'direction': 'upward'},
    }
    ok, errs = evaluate(review)
    assert not ok
    assert any('direction' in e for e in errs)
