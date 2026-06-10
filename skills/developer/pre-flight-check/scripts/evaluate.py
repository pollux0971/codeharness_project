"""Rubric for a preflight report + its decision. Returns (ok, errors)."""
ALLOWED_PREFIX=('pnpm typecheck','pnpm test')
def decide(passed, attempts, same_sig, max_attempts=2, sig_limit=2):
    if passed: return 'submit'
    if same_sig>=sig_limit: return 'escalate'
    if attempts>=max_attempts: return 'escalate'
    return 'self_correct'
def evaluate(report):
    e=[]
    if report.get('advisory') is not True: e.append('advisory must be true')
    v=report.get('verdict')
    if v not in ('submit','self_correct','escalate'): e.append(f'bad verdict {v}')
    exp=decide(report.get('passed',False), report.get('self_correction_attempts',0), report.get('same_signature_count',0))
    if v!=exp: e.append(f'verdict {v} inconsistent with policy (expected {exp})')
    for c in report.get('commands_run') or []:
        if not any(c.strip().lower().startswith(p) for p in ALLOWED_PREFIX): e.append(f'command not allow-listed: {c}')
    return (len(e)==0, e)
