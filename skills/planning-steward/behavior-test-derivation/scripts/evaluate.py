"""Executable rubric for a derived behavior set + vitest skeleton.
behaviors: list of {id, category}; skeleton: the *.test.ts text; stubs: list of stub symbols."""
import re
ID = re.compile(r'^[a-z][a-z0-9_]*$')

def evaluate(behaviors, skeleton, stubs=None, safety_relevant=False):
    errors = []
    ids = [b['id'] for b in behaviors]
    cats = {b.get('category') for b in behaviors}
    for need in ('happy', 'negative', 'boundary'):
        if need not in cats:
            errors.append(f'missing coverage class: {need}')
    if safety_relevant and 'security' not in cats:
        errors.append('safety-relevant component has no security/deny behavior')
    for s in (stubs or []):
        if not any(i.endswith('_is_not_implemented') for i in ids):
            errors.append(f'documented stub not locked by a behavior: {s}')
    if len(ids) != len(set(ids)):
        errors.append('duplicate behavior ids')
    for i in ids:
        if not ID.match(i):
            errors.append(f'behavior id not snake_case: {i!r}')
    it_names = set(re.findall(r"it\(\s*['\"]([a-z0-9_]+)['\"]", skeleton))
    if it_names != set(ids):
        errors.append(f'skeleton it() names != behavior list (missing={set(ids)-it_names}, extra={it_names-set(ids)})')
    if re.search(r'(read_ground_truth|expected\.json|if\s+.*task_id)', skeleton):
        errors.append('leakage: test reads ground truth or branches on task id')
    return (len(errors) == 0, errors)
