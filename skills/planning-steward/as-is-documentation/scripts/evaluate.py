"""Rubric for an as-is documentation artifact. Returns (ok, errors)."""
FORWARD_LOOKING = ('TODO', 'TBD', 'will be')

def evaluate(doc):
    e = []
    doc_type = doc.get('doc_type', '')
    if doc_type not in ('ARCHITECTURE', 'CONVENTIONS'):
        e.append('doc_type must be ARCHITECTURE or CONVENTIONS')
    content = doc.get('content', '')
    if len(content.strip()) < 50:
        e.append('content must be at least 50 characters')
    for phrase in FORWARD_LOOKING:
        if phrase in content:
            e.append(f'forward-looking language found: {phrase!r}')
    if doc_type == 'ARCHITECTURE' and 'entry' not in content.lower():
        e.append('ARCHITECTURE doc must mention entry points')
    return (len(e) == 0, e)
