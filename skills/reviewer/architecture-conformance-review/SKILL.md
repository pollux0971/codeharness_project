# Skill: architecture-conformance-review (reviewer)

## When to use
When the Reviewer must assess whether a proposed or applied patch conforms to the
documented architecture (layering, ownership, public-API constraints). Triggered after
a Developer patch proposal is produced but before Supervisor approval.

## Inputs / Outputs
- **In:** `conformance` dict containing:
  - `conforms`: bool — overall conformance verdict
  - `violations`: list of violation description strings (must be non-empty when `conforms` is false)
  - `rescope_recommendation` (optional): `{ advisory_only: true, rationale, direction }`
- **Out:** structured assessment: conformance verdict validated, violations present when needed.

## Procedure
1. Check that `conforms` field is present (it is the primary verdict).
2. When `conforms` is false, `violations` must be non-empty — a non-conforming review
   without listed violations provides no actionable signal.
3. If `rescope_recommendation` is present, it MUST carry `advisory_only: true` and
   `direction` must be one of `{ none, scope_in, scope_out }`.
4. Return `(ok, errors)` — empty errors list means the review is well-formed.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `conforms` field must be present.
2. When `conforms` is false, `violations` must be a non-empty list.
3. `rescope_recommendation.advisory_only` must be true when the field is present.
4. `rescope_recommendation.direction` must be a valid direction type when present.

## Notes
AVOID returning `conforms: false` with an empty violations list — it blocks repair without guidance.
AVOID setting `rescope_recommendation` without `advisory_only: true`; the harness rejects it.
