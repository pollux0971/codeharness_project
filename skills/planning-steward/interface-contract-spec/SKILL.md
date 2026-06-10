# Skill: interface-contract-spec (planning_steward)

## When to use
Specifying a component for an LLM/agent to implement. The spec is **typed signatures +
behavior contracts**, never prose alone — the agent must implement against fixed shapes.

## Inputs / Outputs
- **In:** the component's responsibility + its inputs/outputs/side-effects.
- **Out:** (a) TypeScript `export interface` / `export function` signatures (typed params
  and return), (b) a per-function contract table: preconditions, postconditions, throws,
  side-effects. Trust decisions take an **injected dependency interface**, not a
  self-reported boolean.

## Procedure
1. Write each public function's signature with explicit param + return types (no `any`).
2. For each, state preconditions, postconditions, and what it throws.
3. Mark side-effecting functions (fs / network / git) and declare the effect.
4. For any trust/safety decision, inject an interface (e.g. a `WorkspaceOracle`) the
   function consults — never a caller-supplied flag like `isDisposable`.
5. Leave nothing as prose-only: every described function has a signature + a contract.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. every exported function has a typed return annotation; no `any` on the public surface.
2. every exported function has a contract entry with a non-empty postcondition.
3. every side-effecting function declares its effect (fs/net/git).
4. no self-reported trust flag (e.g. `isDisposable`) appears in an input type.
5. no orphan contract entries (every contract maps to a declared function).

## Postconditions
`scripts/evaluate.py` passes; an implementer can write code without inventing shapes.

## Notes
AVOID `any` and prose-only descriptions. AVOID trusting caller-supplied trust flags —
inject an oracle. Lessons in `.memory.md`.
