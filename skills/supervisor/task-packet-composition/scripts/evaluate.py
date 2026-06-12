"""Rubric for a TaskPacket assembled by the Supervisor from a StoryContract."""
AGENTS = {'developer', 'debugger', 'planning_steward', 'supervisor'}

def evaluate(packet, contract):
    e = []
    for k in ('packet_id', 'story_id', 'story_contract_ref', 'target_agent',
              'context_packet', 'output_required'):
        if not packet.get(k):
            e.append(f'missing: {k}')
    if packet.get('target_agent') not in AGENTS:
        e.append(f'bad target_agent: {packet.get("target_agent")}')
    ws = packet.get('allowed_write_set') or []
    cws = contract.get('allowed_write_set') or []
    if ws and cws:
        for g in ws:
            if g not in cws:
                e.append(f'packet write-set widened: {g} not in contract')
    if not (packet.get('attempt_budget') or 0) > 0:
        e.append('missing or zero attempt_budget')
    return (len(e) == 0, e)
