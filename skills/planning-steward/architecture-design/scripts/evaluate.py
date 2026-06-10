"""Rubric for an architecture decision record set. Returns (ok, errors)."""
def evaluate(arch):
    e=[]
    decs = arch.get("decisions") or []
    if not decs: e.append("no decisions")
    for d in (decs if isinstance(decs,list) else []):
        for k in ("id","context","decision","consequences"):
            if not d.get(k): e.append(f"decision missing {k}")
    if not arch.get("component_boundaries"): e.append("missing component_boundaries")
    if not arch.get("tech_stack"): e.append("missing tech_stack")
    return (len(e)==0, e)
