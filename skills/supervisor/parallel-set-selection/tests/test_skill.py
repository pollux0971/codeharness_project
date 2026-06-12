import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_supervisor_parallel_set_selection", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

STORIES = [
    {'story_id': 'S-A', 'parallelism_class': 'parallel_safe', 'allowed_write_set': ['codeharness/packages/foo/**']},
    {'story_id': 'S-B', 'parallelism_class': 'parallel_safe', 'allowed_write_set': ['codeharness/packages/bar/**']},
    {'story_id': 'S-C', 'parallelism_class': 'sequential',    'allowed_write_set': ['codeharness/packages/baz/**']},
    {'story_id': 'S-D', 'parallelism_class': 'parallel_safe', 'allowed_write_set': ['codeharness/packages/foo/**']},
]

def test_clean_parallel_set_passes():
    sel = {'parallel_set': ['S-A', 'S-B'], 'sequential_next': 'S-C', 'overlap_conflicts': []}
    ok, errs = evaluate(sel, STORIES)
    assert ok, errs

def test_non_parallel_safe_in_set_fails():
    sel = {'parallel_set': ['S-A', 'S-C'], 'sequential_next': None, 'overlap_conflicts': []}
    assert evaluate(sel, STORIES)[0] is False

def test_write_set_overlap_fails():
    # S-A and S-D share the same write-set prefix
    sel = {'parallel_set': ['S-A', 'S-D'], 'sequential_next': None, 'overlap_conflicts': []}
    assert evaluate(sel, STORIES)[0] is False

def test_empty_parallel_set_passes():
    sel = {'parallel_set': [], 'sequential_next': 'S-C', 'overlap_conflicts': []}
    ok, errs = evaluate(sel, STORIES)
    assert ok, errs

def test_unknown_story_in_set_fails():
    sel = {'parallel_set': ['S-UNKNOWN'], 'sequential_next': None, 'overlap_conflicts': []}
    assert evaluate(sel, STORIES)[0] is False
