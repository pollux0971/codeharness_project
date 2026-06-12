# Skill: budget-governance (supervisor)

## When to use
Track token/attempt budgets across a story run; determine when to halt (attempt budget),
escalate (repeated failure signature), or continue.

## Inputs / Outputs
- **In:** `budget_state` dict with `story_id`, `attempts_used`, `attempt_budget`,
  `same_signature_count`, `verdict`.
- **Out:** validated `budget_state` with correct `verdict`.

## Procedure
1. If `attempts_used >= attempt_budget` → `verdict` must be `escalate`.
2. If `same_signature_count >= 2` → `verdict` must be `escalate` or `halt`.
3. Otherwise `verdict` may be `continue`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `story_id`, `attempts_used`, `attempt_budget`, `same_signature_count` all present.
2. `verdict` is one of `continue`, `halt`, `escalate`.
3. Budget exhausted → verdict must be `escalate`.
4. Repeated signature (≥ 2) → verdict must be `escalate` or `halt`.

## Postconditions
`scripts/evaluate.py` returns ok; no attempt-budget overrun without escalation.

## Notes
AVOID `continue` when the budget is exhausted — infinite loops are a harness failure mode.
AVOID ignoring `same_signature_count` — repeated patterns mean the fix strategy is wrong.
Lessons in `.memory.md`.
