# Skill: structured-escalation (shared)

Roles: developer, debugger

## When to use
Whenever blocked, uncertain, or about to exceed scope — emit a structured escalation
instead of guessing. This prevents self-widening scope, deleting tests, or hallucinating context.

## Inputs / Outputs
- **In:** the blocker (ambiguity / missing scope / missing context / policy / repeated failure).
- **Out:** an `Escalation` per `specs/escalation.schema.json`:
```yaml
escalation:
  type: needs_clarification | needs_scope_expansion | blocked_by_missing_context | blocked_by_policy | repeated_failure
  reason: string
  evidence_refs: [string]
  requested_decision: string
  options: [{ option_id, tradeoff }]
```

## Procedure
1. Pick the precise `type`. 2. State a concrete `reason` + `requested_decision`.
3. Attach `evidence_refs` (trace/artifact). 4. Offer `options` with explicit tradeoffs.
5. STOP — do not act on the blocker yourself.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `type` is one of the five allowed values.
2. `reason` and `requested_decision` are non-empty.
3. every `option` has both `option_id` and `tradeoff`.
4. `blocked_by_missing_context` and `repeated_failure` include at least one `evidence_ref`.
5. no field instructs widening scope / deleting tests / changing policy.

## Postconditions
`scripts/evaluate.py` returns ok; matches `agent-output.validateEscalation`.

## Notes
AVOID free-text "maybe I should ask you" — emit the structured object. Lessons in `.memory.md`.
