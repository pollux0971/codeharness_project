"""Rubric for an epic/story shard. Each story must be machine-checkable. Returns (ok, errors)."""
def _mc(ac):
    o = ac if isinstance(ac,dict) else {}
    return any(isinstance(o.get(k),list) and o.get(k) for k in ("files_must_exist","behaviors_must_pass","commands_must_pass"))
def evaluate(shard):
    e=[]
    epics = shard.get("epics") or []
    stories = shard.get("stories") or []
    if not epics: e.append("no epics")
    if not stories: e.append("no stories")
    epic_ids = {ep.get("epic_id") for ep in (epics if isinstance(epics,list) else [])}
    for s in (stories if isinstance(stories,list) else []):
        sid = s.get("story_id","?")
        if not s.get("story_id"): e.append("story missing story_id")
        if not s.get("epic"): e.append(f"{sid} missing epic")
        elif s.get("epic") not in epic_ids: e.append(f"{sid} references unknown epic {s.get('epic')}")
        if not s.get("allowed_write_set"): e.append(f"{sid} missing allowed_write_set")
        if not _mc(s.get("acceptance_criteria")): e.append(f"{sid} acceptance not machine-checkable")
    return (len(e)==0, e)
