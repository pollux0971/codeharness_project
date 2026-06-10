"""Mirror of validator-suite.specConformanceGate. Returns (ok, errors). In: proposal, contract."""
import re
def _covers(g,f): return re.match('^'+re.escape(g).replace(r'\*\*','§').replace(r'\*','[^/]*').replace('§','.*')+'$',f) is not None
def _mc(ac):
    o=ac if isinstance(ac,dict) else {}
    return any(isinstance(o.get(k),list) and o.get(k) for k in ('files_must_exist','behaviors_must_pass','commands_must_pass'))
def evaluate(proposal, contract):
    e=[]
    for k in ('proposal_id','story_id','contract_id','change_type','changed_files'):
        if not proposal.get(k): e.append(f'proposal missing {k}')
    files=proposal.get('changed_files') or []
    ws=contract.get('allowed_write_set') or []
    if not files: e.append('changed_files empty')
    for f in files:
        if not any(_covers(g,f) for g in ws): e.append(f'changed file outside write-set: {f}')
    if not _mc(contract.get('acceptance_criteria')): e.append('contract acceptance not machine-checkable')
    if not (proposal.get('rollback_notes') or '').strip(): e.append('missing rollback_notes')
    return (len(e)==0, e)
