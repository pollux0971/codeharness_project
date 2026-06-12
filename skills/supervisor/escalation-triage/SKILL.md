# Skill: escalation-triage (supervisor)

## When to use
Classify incoming escalations and decide: retry (with guidance), human-gate, or re-scope.
Input is a structured `Escalation`; output is a triage decision.

## Inputs / Outputs
- **In:** `triage` dict with `escalation_type`, `decision`, `rationale`, optional `retry_limit`.
- **Out:** validated triage decision.

## Procedure
1. Validate `escalation_type` against the known set.
2. Map to a `decision`: `retry_with_guidance`, `human_gate`, `re_scope`, or `reject`.
3. `needs_scope_expansion` must always route to `human_gate` — never auto-approve.
4. `repeated_failure` with `retry_with_guidance` must specify `retry_limit`.
5. Populate `rationale` (non-empty).

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `escalation_type` is a known type.
2. `decision` is a known decision.
3. `rationale` is non-empty.
4. Scope expansion must be `human_gate`.
5. Repeated-failure retry must include `retry_limit`.

## Postconditions
`scripts/evaluate.py` returns ok; scope expansions never auto-approved.

## Notes
AVOID auto-approving scope expansions — they alter the contract and require human sign-off.
AVOID `retry_with_guidance` on `repeated_failure` without a `retry_limit` — it loops forever.
Lessons in `.memory.md`.
