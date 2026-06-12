import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("debugger_fga_eval", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'id': 'gene-001',
    'matching_signal': 'type:test_failure|file:processor.py|op:INSERT_PREREQ',
    'summary': 'None input bypassed guard check causing AttributeError in processor.',
    'avoid': 'NEVER call validate() without first checking for None input in processor.py',
    'failure_type': 'test_failure',
    'repair_operator': 'INSERT_PREREQ',
    'story_id': 'STORY-014.4',
    'consolidated_count': 1,
}

def test_good_gene_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_avoid_exceeds_40_words_fails():
    long_avoid = 'DO NOT ' + ' '.join(['word'] * 40)
    ok, errs = evaluate({**GOOD, 'avoid': long_avoid})
    assert not ok
    assert any('40 words' in err for err in errs)

def test_non_imperative_avoid_fails():
    ok, errs = evaluate({**GOOD, 'avoid': 'it is good to check for None'})
    assert not ok
    assert any('imperative' in err for err in errs)

def test_bad_matching_signal_fails():
    ok, errs = evaluate({**GOOD, 'matching_signal': 'no delimiters here'})
    assert not ok
    assert any('matching_signal' in err for err in errs)

def test_duplicate_signal_without_consolidated_count_fails():
    existing = ['type:test_failure|file:processor.py|op:INSERT_PREREQ']
    gene = {**GOOD, 'consolidated_count': 1}
    ok, errs = evaluate(gene, existing_signals=existing)
    assert not ok
    assert any('consolidated_count' in err for err in errs)
