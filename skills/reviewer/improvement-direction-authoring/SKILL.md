# Skill: improvement-direction-authoring (reviewer)

## When to use
After root-cause hypotheses are ranked, use this skill to author ≥1 structured
ImprovementDirection items for the Debugger — ranked, actionable, scoped.

## Inputs / Outputs
- **In:** ranked hypotheses, acceptance criteria, diff under review, write-set scope.
- **Out:** `{ items: [ { direction_type, rationale, scope_expansion_flagged? } ] }`
  where `direction_type` ∈ {change_implementation, tighten_test, widen_write_set,
  clarify_spec, add_prereq_check}.

## Procedure
1. For each hypothesis, author a direction with a concrete `direction_type`.
2. Write `rationale` ≥ 5 words explaining why this direction addresses the hypothesis.
3. If `direction_type` is `widen_write_set`, set `scope_expansion_flagged: true` — this
   direction requires a human gate; never auto-applied.
4. Order directions from most to least likely to resolve the failure.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `items` non-empty list.
2. Each `direction_type` ∈ allowed enum.
3. Each `rationale` ≥ 5 words.
4. Any `widen_write_set` direction has `scope_expansion_flagged: true`.

## Notes
AVOID directions that widen scope without flagging — the harness escalates on flag,
not on presence of the direction type.
AVOID rationale under 5 words — too vague to be actionable by the Debugger.
