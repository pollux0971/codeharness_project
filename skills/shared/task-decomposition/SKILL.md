# Skill: task-decomposition (shared)

Roles: developer, debugger (shared coding substrate)

## When to use
Before writing any patch/repair, to break the assigned Task Packet into small, ordered,
independently-verifiable subtasks (via the `task-graph` tools). Smaller steps raise
per-step success and bound context.

## Inputs / Outputs
- **In:** the Task Packet objective + the parent contract `allowed_write_set`.
- **Out:** an ordered list of subtasks `{ intent, files_touched, depends_on?, acceptance_behavior? }`,
  each created with `TaskCreate`. One `in_progress` at a time.

## Procedure
1. Split the objective into the smallest steps that each produce a checkable result
   (e.g. *add type → implement fn → add test → wire export*).
2. For each step write a one-sentence `intent` and the `files_touched` it needs.
3. Keep every `files_touched` inside the contract write-set; if a step needs more, STOP
   and escalate (needs scope expansion) — never widen silently.
4. Order steps; set `depends_on` for real prerequisites (keep the graph acyclic).
5. Prefer ≤5 files per subtask; split further if larger.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. every subtask has a non-empty `intent`.
2. every subtask `files_touched` ⊆ the parent `allowed_write_set`.
3. `depends_on` references only earlier subtasks; the dependency graph is acyclic.
4. no subtask touches more than the file cap (default 5).
5. no two subtasks share an identical `intent` (no duplicate steps).
6. the plan is orderable into a single sequence (≤1 `in_progress` at a time is feasible).

## Postconditions
`scripts/evaluate.py` returns ok; each subtask is accepted by `task-graph.TaskCreate`
(which re-enforces the write-set scope).

## Notes
AVOID a single "do everything" subtask — it defeats the point. AVOID a subtask that needs
a file outside the write-set — escalate instead. Lessons in `.memory.md`.
