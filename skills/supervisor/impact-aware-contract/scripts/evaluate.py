"""Rubric for a brownfield impact-aware story contract. Returns (ok, errors)."""

def evaluate(contract):
    e = []
    if not (contract.get('contract_id') or '').strip():
        e.append('missing contract_id')
    impact = contract.get('impact_set') or []
    if not isinstance(impact, list) or len(impact) == 0:
        e.append('impact_set must be a non-empty list')
    regression = contract.get('regression_tests') or []
    if not isinstance(regression, list) or len(regression) == 0:
        e.append('regression_tests must be a non-empty list')
    if not (contract.get('rollback_ref') or '').strip():
        e.append('missing rollback_ref')
    write_set = contract.get('write_set') or []
    if not isinstance(write_set, list) or len(write_set) == 0:
        e.append('write_set must be a non-empty list')
    return (len(e) == 0, e)
