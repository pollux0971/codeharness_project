# Skill: cross-story-consistency-review (reviewer)

## When to use
When a parallel run completes and the Reviewer must check whether two or more concurrently
executed stories introduced conflicting changes — overlapping files, diverging interfaces,
or contradictory assumptions.

## Inputs / Outputs
- **In:** `review` dict containing:
  - `consistency_violations`: list of `{ description, affected_story_ids }` objects (may be empty)
  - `run_had_parallel_stories`: bool — true when the run dispatched ≥2 stories simultaneously
  - `rescope_recommendation` (optional): `{ advisory_only: true, rationale, direction }`
- **Out:** structured assessment: violations validated, rescope constraint enforced.

## Procedure
1. When `run_had_parallel_stories` is true, the review MUST check consistency — an empty
   `consistency_violations` list is only valid if no conflicts were found AND the reviewer
   explicitly confirmed the check was performed (field present, not absent).
2. For each violation, verify `description` is substantive (≥5 words) and
   `affected_story_ids` names at least one story.
3. If `rescope_recommendation` is present, it MUST carry `advisory_only: true`; the
   Reviewer cannot instruct scope changes.
4. Return `(ok, errors)` — empty errors list means the review is well-formed.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. Parallel runs must have `consistency_violations` present (even if empty, it confirms the check ran).
2. Each violation `description` must be ≥5 words.
3. Each violation `affected_story_ids` must be non-empty.
4. `rescope_recommendation`, if present, must have `advisory_only: true`.

## Notes
AVOID omitting `consistency_violations` entirely in parallel runs — its absence is ambiguous.
AVOID writing rescope instructions; the field is advisory-only and the harness ignores directives.
