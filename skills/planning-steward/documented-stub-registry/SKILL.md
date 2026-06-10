# Skill: documented-stub-registry (planning_steward)

## When to use
Deferring a function (walking-skeleton scoping): producing the **documented stub** and
its **registry entry** so no unimplemented function is silent or unowned.

## Inputs / Outputs
- **In:** the deferred function's typed signature + the owning `STORY-*` or `ROADMAP:phase-*`.
- **Out:** (a) the stub body `throw new Error('not implemented: <symbol> — <what>')` keeping
  the full typed signature, (b) a `stub_registry.json` entry `{symbol, file, owner}`.

## Procedure
1. Keep the function's full typed signature (callers must compile against the contract).
2. Body = a single `throw new Error('not implemented: <symbol> — <one-line contract>')`.
3. Add an entry to `codeharness/specs/stub_registry.json` mapping symbol+file → owner.
4. Owner MUST be a real story id or a roadmap phase; never leave it blank.
5. When the stub is implemented later, remove it from the code AND the registry.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. the stub throws a message starting `not implemented:` that names the symbol.
2. the stub retains a typed signature (params + return), not a deleted/`any` shim.
3. a registry entry exists for (symbol, file).
4. owner matches `STORY-<n>` or `ROADMAP:phase-<n>`.
5. (registry-wide) no orphan entries — every entry maps to an existing stub.

## Postconditions
`scripts/evaluate.py` passes; the project's `tests/stub_registry.test.ts` stays green
(`validator-suite.validateDocumentedStubsHaveStory`).

## Notes
AVOID a stub without an owner — it becomes an invisible hole. AVOID dropping the signature
when stubbing (callers lose the contract). Lessons in `.memory.md`.
