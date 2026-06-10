import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate
find_orphans = _mod.find_orphans

STUB = ("export function applyPatch(ws: WorkspaceManifest, diffPath: string): string[] {\n"
        "  throw new Error('not implemented: applyPatch — apply a diff inside the workspace branch');\n}")
REG = [{'symbol': 'applyPatch', 'file': 'workspace-manager/src/index.ts', 'owner': 'STORY-003.2'}]

def test_well_formed_stub_passes():
    ok, errs = evaluate(STUB, 'applyPatch', 'workspace-manager/src/index.ts', REG); assert ok, errs

def test_unowned_stub_fails():
    assert evaluate(STUB, 'applyPatch', 'workspace-manager/src/index.ts', [])[0] is False

def test_bad_owner_format_fails():
    bad = [{'symbol': 'applyPatch', 'file': 'workspace-manager/src/index.ts', 'owner': 'someday'}]
    assert evaluate(STUB, 'applyPatch', 'workspace-manager/src/index.ts', bad)[0] is False

def test_orphan_detection():
    orphans = find_orphans([], REG); assert len(orphans) == 1
