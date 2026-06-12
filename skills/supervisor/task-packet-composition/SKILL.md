# Skill: task-packet-composition (supervisor)

## When to use
Given a StoryContract, assemble the role-scoped Task Packet sent to Developer or Debugger —
correct target_agent, bounded context, write-set, acceptance, and attempt budget.

## Inputs / Outputs
- **In:** a validated `StoryContract` (from `supervisor.story-contract`).
- **Out:** a `TaskPacket` with `packet_id`, `story_id`, `story_contract_ref`, `target_agent`,
  `context_packet`, `output_required`, `allowed_write_set`, and `attempt_budget`.

## Procedure
1. Assign `target_agent` from the contract's story type (`developer` or `debugger`).
2. Copy `allowed_write_set` verbatim from the contract — do NOT widen it.
3. Set `attempt_budget` from `contract.attempt_budget`.
4. Populate `context_packet` with only the fields the target agent needs (no leakage).
5. Set `output_required` to the list of expected artifacts.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `packet_id`, `story_id`, `story_contract_ref`, `target_agent`, `context_packet`, `output_required` all present.
2. `target_agent` is one of: `developer`, `debugger`, `planning_steward`, `supervisor`.
3. `allowed_write_set` is a subset of the contract's `allowed_write_set` (no self-grant).
4. `attempt_budget` > 0.

## Postconditions
`scripts/evaluate.py` returns ok; packet is scoped to contract write-set.

## Notes
AVOID widening `allowed_write_set` beyond the contract — the Permission Gateway will reject it.
AVOID setting `target_agent` to an unknown role — routing will fail silently.
Lessons in `.memory.md`.
