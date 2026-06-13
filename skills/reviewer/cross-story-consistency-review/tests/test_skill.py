import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_cscr", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'consistency_violations': [
        {
            'description': 'Both stories modify src/calc.ts in conflicting ways.',
            'affected_story_ids': ['STORY-A', 'STORY-B'],
        }
    ],
    'run_had_parallel_stories': True,
}

def test_good_review_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_empty_violations_in_parallel_run_fails():
    review = {'consistency_violations': [], 'run_had_parallel_stories': True}
    ok, errs = evaluate(review)
    assert not ok
    assert any('parallel' in e for e in errs)

def test_short_description_fails():
    review = {
        'consistency_violations': [
            {'description': 'Conflict', 'affected_story_ids': ['STORY-A']}
        ],
        'run_had_parallel_stories': True,
    }
    ok, errs = evaluate(review)
    assert not ok
    assert any('description too short' in e for e in errs)

def test_missing_affected_stories_fails():
    review = {
        'consistency_violations': [
            {'description': 'Both stories modify the same module file.', 'affected_story_ids': []}
        ],
        'run_had_parallel_stories': True,
    }
    ok, errs = evaluate(review)
    assert not ok
    assert any('affected stories' in e for e in errs)

def test_non_advisory_rescope_fails():
    review = {
        **GOOD,
        'rescope_recommendation': {'advisory_only': False, 'rationale': 'scope out', 'direction': 'scope_out'},
    }
    ok, errs = evaluate(review)
    assert not ok
    assert any('advisory_only' in e for e in errs)
