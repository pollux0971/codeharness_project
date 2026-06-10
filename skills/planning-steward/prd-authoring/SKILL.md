# Skill: PRD Authoring  (Planning Steward · PM function)

Adapted from BMAD-METHOD `bmad-prd` (MIT). Produces the Product Requirements
Document — the spine the whole plan hangs off.

## When to use
After idea intake + classification, BEFORE architecture. The PRD is written
first; architecture and the epic/story breakdown build on it.

## Standard operating procedure
1. **Vision** — 2–3 paragraphs: what this is, what it does for the user, why it
   matters. Must stand alone.
2. **Target user** — Jobs To Be Done; named **User Journeys** numbered UJ-1..UJ-N
   (entry state → path → climax → resolution, plus one edge case where it matters).
3. **Glossary** — every domain noun, defined once. FRs/UJs/stories use these
   terms verbatim; introducing a synonym anywhere is a discipline violation.
4. **Features → Functional Requirements** — group FRs under features, each with a
   stable id `FR-N`, each referencing the UJ it realises.
5. **Non-Functional Requirements** — `NFR-N` (performance, security, etc.).
6. **Success metrics** — measurable; how you know v1 worked.
7. **Assumptions** — tagged inline and indexed.
8. **Validate** against `assets/prd-validation-checklist.md` before handing off.

## Output
`docs/prd/PRD.md` (+ a short validation report).

## Postconditions
Every FR has an id; every UJ is numbered; the glossary covers all domain nouns;
success metrics are measurable; no synonyms for glossary terms anywhere.

## What NOT to do
Do not leave FRs without ids · do not introduce synonyms for glossary terms ·
do not duplicate an existing UX doc (reference it) · do not write architecture
here (that is the next skill).

Template: `assets/prd-template.md`.
