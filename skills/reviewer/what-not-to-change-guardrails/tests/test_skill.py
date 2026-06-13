import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_wntcg", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'do_not_touch': ['src/index.test.ts', 'src/schema.ts'],
    'rationale_per_entry': {
        'src/index.test.ts': 'These tests are passing and define the acceptance contract',
        'src/schema.ts': 'Schema is outside the write-set and must not be altered',
    },
}

def test_good_guardrails_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_empty_do_not_touch_fails():
    assert evaluate({'do_not_touch': [], 'rationale_per_entry': {}})[0] is False

def test_missing_rationale_for_entry_fails():
    bad = {**GOOD, 'rationale_per_entry': {'src/schema.ts': 'Out of write-set'}}
    assert evaluate(bad)[0] is False

def test_passing_test_not_in_list_fails():
    assert evaluate(GOOD, passing_tests=['src/other.test.ts'])[0] is False

def test_multiple_entries_with_rationale_passes():
    multi = {
        'do_not_touch': ['a.ts', 'b.ts', 'c.ts'],
        'rationale_per_entry': {
            'a.ts': 'Passing test file must remain unchanged',
            'b.ts': 'Outside the allowed write-set for this story',
            'c.ts': 'Acceptance criteria encoded here must not drift',
        },
    }
    ok, errs = evaluate(multi)
    assert ok, errs
