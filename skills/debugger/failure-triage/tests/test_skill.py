import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {'failure_type': 'test', 'matching_signal': 'test|undefined|foo', 'root_cause_hypothesis': 'mock not reset between cases',
        'repair_operator': 'INSERT_PREREQ', 'failure_gene': {'avoid': 'reset the shared mock in beforeEach'},
        'within_scope': True, 'needs_scope_expansion': False}
def test_good_triage_passes(): ok, errs = evaluate(GOOD); assert ok, errs
def test_bad_failure_type_fails(): assert evaluate({**GOOD, 'failure_type': 'cosmic_ray'})[0] is False
def test_signal_not_piped_fails(): assert evaluate({**GOOD, 'matching_signal': 'undefined foo'})[0] is False
def test_long_avoid_fails(): assert evaluate({**GOOD, 'failure_gene': {'avoid': ' '.join(['x']*41)}})[0] is False
def test_changes_story_goal_fails(): assert evaluate({**GOOD, 'changes_story_goal': True})[0] is False
def test_scope_expansion_with_repair_fails(): assert evaluate({**GOOD, 'needs_scope_expansion': True, 'repair_proposal': {}})[0] is False
