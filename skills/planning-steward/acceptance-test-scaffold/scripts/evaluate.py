"""Rubric for a generated vitest test-file skeleton.
Input: test_text (str) + behaviors (list) + unit_module path. Returns (ok, errors)."""
import re
ID = re.compile(r'^[a-z][a-z0-9_]*$')

def evaluate(test_text: str, behaviors: list, unit_module: str = './index'):
    errors = []
    it_names = re.findall(r"it\(\s*['\"]([a-z0-9_]+)['\"]", test_text)
    nameset, bset = set(it_names), set(behaviors)
    for b in behaviors:
        if b not in nameset:
            errors.append(f'missing it() for behavior: {b}')
    for n in nameset:
        if n not in bset:
            errors.append(f'extra it() not in behaviors_must_pass: {n}')
    if len(it_names) != len(nameset):
        errors.append('duplicate it() names')
    for n in it_names:
        if not ID.match(n):
            errors.append(f'invalid test name: {n}')
    if 'import' not in test_text or unit_module not in test_text:
        errors.append(f'test file does not import the unit under test ({unit_module})')
    for b in behaviors:
        if b.endswith('_is_not_implemented') and 'toThrow' not in test_text:
            errors.append(f'stub-lock {b} must assert toThrow(/not implemented/)')
            break
    if re.search(r'expect\(\s*true\s*\)\.toBe\(\s*true\s*\)', test_text):
        errors.append('trivially-passing assertion detected')
    return (len(errors) == 0, errors)
