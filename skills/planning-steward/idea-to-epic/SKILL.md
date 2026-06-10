# Skill: idea-to-epic (planning_steward)

## When to use
To turn a classified idea into a machine-checkable **epic/story graph** (the backlog),
before any contract is written.

## Inputs / Outputs
- **In:** the idea record + classification (greenfield/brownfield/patch/research_spike).
- **Out:** `{ epics: [{epic_id, exit_criteria}], stories: [{story_id, epic_id, objective, depends_on, parallelism_class}] }`.

## Procedure
1. Group work into epics; give each epic a concrete `exit_criteria` (testable).
2. Split each epic into stories with a single testable `objective`.
3. Set `depends_on` (story ids) to form an acyclic DAG; set `parallelism_class`
   (`sequential`|`parallel_safe`|`barrier`|`exclusive`).
4. Every story belongs to a declared epic; no duplicate ids.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. every story has a non-empty `objective`.
2. every `parallelism_class` ∈ {sequential, parallel_safe, barrier, exclusive}.
3. every `depends_on` references an existing story id (and forms no cycle).
4. every epic has a non-empty `exit_criteria`.
5. every story's `epic_id` is a declared epic.
6. no duplicate `story_id`.

## Postconditions
`scripts/evaluate.py` returns ok; the graph feeds `epic-story-sharding` and the
Supervisor's `story-contract` skill.

## Notes
AVOID epics without exit criteria and stories without testable objectives — they cannot be
turned into machine-checkable contracts downstream. Lessons in `.memory.md`.
