import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

WS = ['codeharness/packages/foo/src/**']
GOOD = {'proposal_id': 'p1', 'story_id': 'S1', 'contract_id': 'C1', 'change_type': 'ADD',
        'changed_files': ['codeharness/packages/foo/src/index.ts'], 'rollback_notes': 'revert the change',
        'test_plan': 'add unit test for fn', 'summary': 'add fn'}
def test_good_proposal_passes(): ok, errs = evaluate(GOOD, WS); assert ok, errs
def test_file_outside_write_set_fails(): assert evaluate({**GOOD, 'changed_files': ['other/x.ts']}, WS)[0] is False
def test_bad_change_type_fails(): assert evaluate({**GOOD, 'change_type': 'YOLO'}, WS)[0] is False
def test_missing_rollback_fails(): assert evaluate({**GOOD, 'rollback_notes': ''}, WS)[0] is False
def test_missing_test_plan_fails(): assert evaluate({**GOOD, 'test_plan': ''}, WS)[0] is False
