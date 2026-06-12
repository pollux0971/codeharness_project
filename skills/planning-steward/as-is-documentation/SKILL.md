# Skill: as-is-documentation (Planning Steward · brownfield)

## When to use
After architecture-recovery, to write concise, fact-only `as-is/ARCHITECTURE.md` and `as-is/CONVENTIONS.md`.
These documents describe what EXISTS now — not what will be built.

## Standard operating procedure
1. **ARCHITECTURE.md** — list entry points, layers, key modules. Must mention "entry" points explicitly.
2. **CONVENTIONS.md** — list language, framework, lint tool, test framework. Fact-only, no speculation.
3. **No forward-looking language** — do not write `TODO`, `TBD`, or `will be` anywhere.
4. **Minimum length** — each document must be at least 50 characters of meaningful content.

## Constraints
- `doc_type` must be `ARCHITECTURE` or `CONVENTIONS`.
- Content must be ≥ 50 characters.
- No forward-looking language (`TODO`, `TBD`, `will be`).
- ARCHITECTURE docs must mention entry points.

## Output
Two documents: `as-is/ARCHITECTURE.md` and `as-is/CONVENTIONS.md`.
