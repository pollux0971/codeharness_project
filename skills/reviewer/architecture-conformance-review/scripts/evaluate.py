"""Rubric for architecture-conformance-review skill. Returns (ok, errors)."""

DIRECTION_TYPES = {'none', 'scope_in', 'scope_out'}

def evaluate(conformance):
    e = []
    if 'conforms' not in conformance:
        e.append('missing conforms field')
    if not conformance.get('conforms', True):
        if not conformance.get('violations'):
            e.append('non-conforming review must list violations')
    if conformance.get('rescope_recommendation'):
        rr = conformance['rescope_recommendation']
        if not rr.get('advisory_only'):
            e.append('rescope_recommendation advisory_only required')
        if rr.get('direction') not in DIRECTION_TYPES:
            e.append(f'bad direction: {rr.get("direction")}')
    return (len(e) == 0, e)
