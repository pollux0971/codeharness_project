# Skill: root-cause-hypothesis-ranking (reviewer)

## When to use
After test-output-interpretation has produced structured failure signals, use this skill
to produce ≥1 ranked root-cause hypotheses with confidence scores and evidence links.

## Inputs / Outputs
- **In:** structured failure signals (from test-output-interpretation), diff, matching genes.
- **Out:** `{ hypotheses: [ { hypothesis, confidence, evidence_lines } ] }` ranked by
  descending confidence.

## Procedure
1. For each plausible root cause, write a falsifiable `hypothesis` statement (≥ 3 words,
   contains causal language: "if", "when", "because", "caused by", or "the").
2. Assign `confidence` ∈ [0.0, 1.0] based on evidence strength in the test output / diff.
3. List `evidence_lines` that support the hypothesis.
4. Sort hypotheses descending by confidence (highest first).
5. Include ≥ 1 hypothesis; do not return an empty list.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `hypotheses` non-empty list.
2. Each hypothesis ≥ 3 words and contains causal language.
3. Each `confidence` ∈ [0.0, 1.0].
4. Each hypothesis has `evidence_lines` list.
5. Hypotheses sorted descending by confidence.

## Notes
AVOID one-word or symptom-only hypotheses — they are not falsifiable.
AVOID ordering hypotheses by anything other than descending confidence.
