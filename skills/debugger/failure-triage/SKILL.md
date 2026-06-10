# Skill: failure-triage (debugger)

## When to use
On a validation failure (or confirmed human-issue), to classify the failure, find root
cause, propose a minimal scoped repair, and emit a failure gene.

## Inputs / Outputs
- **In:** the Debugger Task Packet (failure context, failure_signature, allowed_repair_scope).
- **Out:** `{ failure_type, matching_signal, root_cause_hypothesis, repair_operator,
  within_scope, needs_scope_expansion, failure_gene }` (+ a repair proposal if in scope).

## Procedure
1. Classify (`test|typecheck|lint|runtime|schema|integration`).
2. Build a pipe-delimited `matching_signal` (the dedup/retrieval key).
3. State a root-cause hypothesis (not the symptom); decompose the repair (task-decomposition).
4. Pick a GRASP `repair_operator`; stay within `allowed_repair_scope` (else
   `needs_scope_expansion: true` and STOP — no repair).
5. Emit a `failure_gene` whose `avoid` ≤ 40 words.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `failure_type` ∈ {test, typecheck, lint, runtime, schema, integration}.
2. `matching_signal` is pipe-delimited (≥1 `|`).
3. `root_cause_hypothesis` non-empty (not just a symptom restatement).
4. `repair_operator` ∈ {REBIND, INSERT_PREREQ, SUBSTITUTE, REWIRE, BYPASS}.
5. `failure_gene.avoid` is present and ≤ 40 words.
6. it does NOT modify the story goal/acceptance (`changes_story_goal` falsy/absent).
7. if `needs_scope_expansion` is true, NO repair proposal is attached.

## Postconditions
`scripts/evaluate.py` returns ok; the gene is bankable (`specs/failure_gene.schema.json`).

## Notes
AVOID widening scope or deleting tests to force a pass; AVOID an `avoid` line over 40
words (only `avoid` is injected). Lessons in `.memory.md`.
