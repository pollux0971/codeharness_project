"""Rubric for a PRD artifact. Returns (ok, errors)."""
REQUIRED = ["vision","jobs_to_be_done","user_journeys","glossary","functional_requirements","non_functional_requirements","success_metrics"]
def evaluate(prd):
    e=[]
    for k in REQUIRED:
        if not prd.get(k): e.append(f"missing {k}")
    frs = prd.get("functional_requirements") or []
    if not isinstance(frs,list) or not frs: e.append("functional_requirements must be a non-empty list")
    for fr in (frs if isinstance(frs,list) else []):
        if not (isinstance(fr,dict) and fr.get("id") and fr.get("statement")): e.append("each FR needs id + statement")
    if not isinstance(prd.get("success_metrics"),list) or not prd.get("success_metrics"):
        e.append("success_metrics must be a non-empty list")
    return (len(e)==0, e)
