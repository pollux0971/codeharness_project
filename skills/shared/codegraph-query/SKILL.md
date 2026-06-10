# Skill: codegraph-query (shared)

Roles: supervisor, developer, debugger (shared)

## When to use
Before editing unfamiliar code, scoping a write-set, or assessing the blast
radius of a change — instead of grepping/reading files one by one.

## Capability
Queries the CodeGraph index (see docs/architecture/06_CODEGRAPH_INTEGRATION.md):
- `impact <symbol|file>` — dependents / blast radius
- `dependents <symbol>` / `dependencies <symbol>` — edge traversal + direction
- `definition <symbol>` / `references <symbol>` — locate
- `callgraph <function>` — call relationships

## SOP
1. Prefer a single graph query over multiple grep/read calls (fewer tokens).
2. Use `impact` to derive or sanity-check the contract's allowed_write_set.
3. Interpret direction: a reverse dependency (core → auth) is a refactor smell.

## Postconditions
The query result is recorded to the trace as tool_call/tool_result. The skill
returns a compact summary, not the raw dump, into agent context.

## Notes
Read-only. Does not assert pass/fail (that is the Validator). For precise,
type-checked symbol facts (exact references, hover types, diagnostics), pair
with the `lsp-navigate` skill — codegraph is structural, LSP is semantic.
