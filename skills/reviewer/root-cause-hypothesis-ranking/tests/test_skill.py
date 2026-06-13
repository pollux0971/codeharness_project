import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_rchr", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD_HYP = {'hypothesis': 'The divide function caused NaN because b is zero', 'confidence': 0.9, 'evidence_lines': ['Received: NaN']}
GOOD = {'hypotheses': [GOOD_HYP, {'hypothesis': 'if argument is not a number the result is NaN', 'confidence': 0.5, 'evidence_lines': ['stack: calc.ts:3']}]}

def test_good_ranking_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_empty_hypotheses_fails():
    assert evaluate({'hypotheses': []})[0] is False

def test_confidence_out_of_range_fails():
    bad = {'hypotheses': [{**GOOD_HYP, 'confidence': 1.5}]}
    assert evaluate(bad)[0] is False

def test_non_falsifiable_hypothesis_fails():
    bad = {'hypotheses': [{'hypothesis': 'something went wrong', 'confidence': 0.5, 'evidence_lines': []}]}
    assert evaluate(bad)[0] is False

def test_wrong_sort_order_fails():
    wrong_order = {'hypotheses': [
        {'hypothesis': 'if b is zero the result is NaN', 'confidence': 0.3, 'evidence_lines': []},
        {'hypothesis': 'the divide caused NaN because of zero', 'confidence': 0.9, 'evidence_lines': []},
    ]}
    assert evaluate(wrong_order)[0] is False
