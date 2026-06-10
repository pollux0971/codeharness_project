import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

C={'allowed_write_set':['pkg/src/**'],'acceptance_criteria':{'behaviors_must_pass':['a_b']}}
P={'proposal_id':'p','story_id':'s','contract_id':'c','change_type':'ADD','changed_files':['pkg/src/x.ts'],'rollback_notes':'revert'}
def test_good_passes(): ok,e=evaluate(P,C); assert ok,e
def test_out_of_write_set_fails(): assert evaluate({**P,'changed_files':['other/x.ts']},C)[0] is False
def test_missing_rollback_fails(): assert evaluate({k:v for k,v in P.items() if k!='rollback_notes'},C)[0] is False
def test_prose_acceptance_fails(): assert evaluate(P,{**C,'acceptance_criteria':['works']})[0] is False
