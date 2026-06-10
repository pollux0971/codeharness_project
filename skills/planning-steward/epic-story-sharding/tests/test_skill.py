import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {"epics":[{"epic_id":"EPIC-1"}],
        "stories":[{"story_id":"S1","epic":"EPIC-1","allowed_write_set":["pkg/**"],
                    "acceptance_criteria":{"behaviors_must_pass":["b_x"]}}]}
def test_good_shard_passes(): ok,e=evaluate(GOOD); assert ok,e
def test_prose_acceptance_fails(): assert evaluate({**GOOD,"stories":[{**GOOD["stories"][0],"acceptance_criteria":["works"]}]})[0] is False
def test_missing_write_set_fails(): assert evaluate({**GOOD,"stories":[{k:v for k,v in GOOD["stories"][0].items() if k!="allowed_write_set"}]})[0] is False
def test_unknown_epic_fails(): assert evaluate({**GOOD,"stories":[{**GOOD["stories"][0],"epic":"EPIC-9"}]})[0] is False
