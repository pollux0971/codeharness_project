import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

WS = ['codeharness/packages/foo/src/**']
GOOD = [
  {'id': 't0', 'intent': 'add the type', 'files_touched': ['codeharness/packages/foo/src/types.ts']},
  {'id': 't1', 'intent': 'implement fn', 'files_touched': ['codeharness/packages/foo/src/index.ts'], 'depends_on': ['t0']},
  {'id': 't2', 'intent': 'add test', 'files_touched': ['codeharness/packages/foo/src/index.test.ts'], 'depends_on': ['t1']},
]
def test_good_decomposition_passes():
    ok, errs = evaluate(GOOD, WS); assert ok, errs
def test_file_outside_write_set_fails():
    bad = GOOD + [{'id': 't3', 'intent': 'x', 'files_touched': ['other/x.ts']}]
    assert evaluate(bad, WS)[0] is False
def test_empty_intent_fails():
    assert evaluate([{'id': 't0', 'intent': '', 'files_touched': []}], WS)[0] is False
def test_too_many_files_fails():
    big = [{'id': 't0', 'intent': 'big', 'files_touched': [f'codeharness/packages/foo/src/f{i}.ts' for i in range(6)]}]
    assert evaluate(big, WS)[0] is False
def test_duplicate_intent_fails():
    dup = [{'id': 't0', 'intent': 'same', 'files_touched': []}, {'id': 't1', 'intent': 'same', 'files_touched': []}]
    assert evaluate(dup, WS)[0] is False
def test_cycle_fails():
    cyc = [{'id': 't0', 'intent': 'a', 'depends_on': ['t1']}, {'id': 't1', 'intent': 'b', 'depends_on': ['t0']}]
    assert evaluate(cyc, WS)[0] is False
