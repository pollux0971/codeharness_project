import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_ida", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD_DIR = {'direction_type': 'change_implementation', 'rationale': 'Guard against zero divisor in divide function'}
GOOD = {'items': [GOOD_DIR]}

def test_good_directions_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_empty_items_fails():
    assert evaluate({'items': []})[0] is False

def test_bad_direction_type_fails():
    assert evaluate({'items': [{**GOOD_DIR, 'direction_type': 'rewrite_everything'}]})[0] is False

def test_short_rationale_fails():
    assert evaluate({'items': [{**GOOD_DIR, 'rationale': 'fix it'}]})[0] is False

def test_widen_write_set_without_flag_fails():
    bad = {'items': [{'direction_type': 'widen_write_set', 'rationale': 'Need to add tests in test directory for coverage'}]}
    assert evaluate(bad)[0] is False
