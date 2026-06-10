import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

BEHAVIORS = ['plan_mode_write_file_returns_deny', 'sudo_returns_deny', 'produce_x_is_not_implemented']
GOOD = """
import { describe, it, expect } from 'vitest';
import { f } from './index';
describe('foo', () => {
  it('plan_mode_write_file_returns_deny', () => { expect(f()).toBe('deny'); });
  it('sudo_returns_deny', () => { expect(f()).toBe('deny'); });
  it('produce_x_is_not_implemented', () => { expect(() => f()).toThrow(/not implemented/); });
});
"""

def test_good_skeleton_passes():
    ok, errs = evaluate(GOOD, BEHAVIORS); assert ok, errs

def test_missing_behavior_fails():
    ok, errs = evaluate(GOOD, BEHAVIORS + ['extra_behavior'])
    assert ok is False and any('extra_behavior' in e for e in errs)

def test_extra_it_fails():
    txt = GOOD.replace("});\n});", "});\n  it('rogue_case', () => {}); });")
    assert evaluate(txt, BEHAVIORS)[0] is False

def test_missing_import_fails():
    assert evaluate(GOOD.replace("import { f } from './index';", ''), BEHAVIORS)[0] is False

def test_stub_lock_requires_tothrow():
    txt = GOOD.replace("expect(() => f()).toThrow(/not implemented/)", "expect(f()).toBe(1)")
    assert evaluate(txt, BEHAVIORS)[0] is False
