# Planning Steward — Machine-Facing Program-Spec Suite

The Planning Steward authors specs whose **audience is a machine** (Claude Code / Codex
/ the validator), not a human reader. A spec is "done" only when it is locked by
executable checks. Every skill below ships an **executable rubric** (`scripts/evaluate.py`
returning `(ok, errors)`) plus `tests/` — so the skill itself obeys the no-skill-without-
tests gate (`docs/architecture/05_SKILL_RUNTIME_MODEL.md`).

## The 7 categories
| # | skill_id | produces | depends_on |
| --- | --- | --- | --- |
| 1 | `planning-steward.behavior-test-derivation` | named behaviors (happy/negative/boundary/security/stub_lock) | machine-checkable-acceptance |
| 2 | `planning-steward.machine-checkable-acceptance` | `acceptance_criteria` (files / behaviors / commands) | — |
| 3 | `planning-steward.acceptance-test-scaffold` | a runnable `*.test.ts` skeleton (one `it()` per behavior) | behavior-test-derivation, machine-checkable-acceptance |
| 4 | `planning-steward.interface-contract-spec` | typed signatures + behavior contracts (documented-stub pattern) | — |
| 5 | `planning-steward.write-set-and-guards` | `allowed_write_set` globs + `forbidden_actions` guards | — |
| 6 | `planning-steward.documented-stub-registry` | every `not implemented` → owner (story/roadmap) | interface-contract-spec |
| 7 | `planning-steward.program-spec-assembly` | the consolidated machine-facing spec bundle | **all of the above** |

## Dependency graph (load order)
```text
machine-checkable-acceptance ─┐
                              ├─→ behavior-test-derivation ─→ acceptance-test-scaffold ─┐
interface-contract-spec ─→ documented-stub-registry ───────────────────────────────────┤
write-set-and-guards ───────────────────────────────────────────────────────────────────┤
                                                                                          └─→ program-spec-assembly
```
The assembler (7) runs each upstream evaluator and then checks **cross-artifact
consistency** — the single most important property: the behavior-id set is identical
across `behaviors_must_pass`, the test skeleton's `it()` names, and the contract.

## Shared evaluation philosophy (applies to every skill)
1. **No prose.** If a criterion cannot be a file path, a behavior id, a command, or a
   typed signature, it does not belong in the spec.
2. **The behavior id is the join key.** One snake_case id == one acceptance entry ==
   one `it()` test name. Drift between them is a hard failure.
3. **Acceptance-test integrity.** The test skeleton is authored by the planner, not the
   implementer; provenance records the author.
4. **Stubs are typed + owned.** A deferred function keeps its signature, throws
   `not implemented: <symbol>`, and maps to a story or `ROADMAP:phase-*`.
5. **Minimal blast radius.** `allowed_write_set` covers exactly the files the behaviors
   touch and is disjoint from parallel stories.
6. **Executable rubric.** Each skill's `scripts/evaluate.py` is the source of truth for
   "good"; its `tests/` prove the rubric accepts good specs and rejects bad ones.
