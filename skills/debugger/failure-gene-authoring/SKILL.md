# Skill: failure-gene-authoring (debugger)

## When to use
After a repair is confirmed, emit a well-formed `FailureGene` object so the failure is
banked and future recurrences are suppressed earlier.

## Inputs / Outputs
- **In:** `gene` dict + optional `existing_signals` list (for dedup check)
- **Out:** `(ok: bool, errors: list)` — machine-checkable evaluation result.

## Procedure
1. Assign a unique `id` and construct a `matching_signal` as pipe-separated `key:value` tokens
   (e.g. `type:test|file:foo_test.py|op:REBIND`). Any-token match is a hit.
2. Write a one-sentence `summary` of the failure.
3. Write an `avoid` line ≤ 40 words, starting with DO NOT / NEVER / AVOID / ALWAYS (imperative).
4. Set `failure_type` ∈ {test_failure, build_error, type_error, runtime_error,
   validation_fail, regression, timeout, scope_error, skill_failure, unknown}.
5. Set `repair_operator` ∈ {REBIND, INSERT_PREREQ, SUBSTITUTE, REWIRE, BYPASS, none}.
6. Include `story_id` of the originating story.
7. **Dedup:** if `matching_signal` already exists in the bank, increment `consolidated_count`
   instead of creating a duplicate.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. All required fields present: id, matching_signal, summary, avoid, failure_type, repair_operator, story_id.
2. `failure_type` and `repair_operator` within allowed sets.
3. `avoid` ≤ 40 words and starts with imperative prefix.
4. `matching_signal` contains pipe-separated key:value tokens.
5. Duplicate signal → `consolidated_count` incremented (≥ 2).

## Postconditions
`scripts/evaluate.py` returns ok; gene is ready for failure bank insertion.

## Notes
`consolidated_count >= 2` signals a systemic pattern — escalate in budget-governance context.
Lessons in `.memory.md`.
