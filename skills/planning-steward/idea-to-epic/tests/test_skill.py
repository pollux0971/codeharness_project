import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
  'epics': [{'epic_id': 'E1', 'exit_criteria': 'feature works end to end'}],
  'stories': [
    {'story_id': 'S1', 'epic_id': 'E1', 'objective': 'do a', 'depends_on': [], 'parallelism_class': 'sequential'},
    {'story_id': 'S2', 'epic_id': 'E1', 'objective': 'do b', 'depends_on': ['S1'], 'parallelism_class': 'parallel_safe'},
  ],
}
def test_good_graph_passes(): ok, errs = evaluate(GOOD); assert ok, errs
def test_missing_objective_fails():
    bad = {**GOOD, 'stories': [{**GOOD['stories'][0], 'objective': ''}, GOOD['stories'][1]]}
    assert evaluate(bad)[0] is False
def test_bad_parallelism_fails():
    bad = {**GOOD, 'stories': [{**GOOD['stories'][0], 'parallelism_class': 'whenever'}]}
    assert evaluate(bad)[0] is False
def test_unknown_epic_fails():
    bad = {**GOOD, 'stories': [{**GOOD['stories'][0], 'epic_id': 'E9'}]}
    assert evaluate(bad)[0] is False
def test_cycle_fails():
    bad = {'epics': [{'epic_id': 'E1', 'exit_criteria': 'x'}], 'stories': [
        {'story_id': 'S1', 'epic_id': 'E1', 'objective': 'a', 'depends_on': ['S2'], 'parallelism_class': 'sequential'},
        {'story_id': 'S2', 'epic_id': 'E1', 'objective': 'b', 'depends_on': ['S1'], 'parallelism_class': 'sequential'}]}
    assert evaluate(bad)[0] is False
