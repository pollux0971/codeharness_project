"""Executable rubric for an interface-contract spec.
spec_text: the TS signatures; contracts: {fn: {pre, post, throws}}; effects: {fn: [..]}"""
import re

def evaluate(spec_text, contracts, effects=None):
    errors = []
    effects = effects or {}
    sigs = re.findall(r'export (?:async )?function (\w+)\s*\(([^)]*)\)\s*(:[^\{;]+)?', spec_text)
    names = [s[0] for s in sigs]
    for name, params, ret in sigs:
        if not ret or not ret.strip().startswith(':'):
            errors.append(f'{name}: missing return type annotation')
        if ret and 'any' in ret:
            errors.append(f'{name}: uses `any` on the public surface')
        if name not in contracts or not (contracts[name] or {}).get('post'):
            errors.append(f'{name}: missing postcondition in contract')
        if name in effects and not effects[name]:
            errors.append(f'{name}: declared side-effecting but no effect listed')
    # criterion 4: no self-reported trust flag in inputs
    if re.search(r'isDisposable\s*[?:]|self_report', spec_text):
        errors.append('self-reported trust flag present (inject an oracle instead)')
    # criterion 5: no orphan contracts
    for c in contracts:
        if c not in names:
            errors.append(f'orphan contract entry (no such function): {c}')
    return (len(errors) == 0, errors)
