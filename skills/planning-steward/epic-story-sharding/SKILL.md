# Skill: Epic & Story Sharding  (Planning Steward · Scrum Master function)

Adapted from BMAD-METHOD `bmad-create-epics-and-stories` + `bmad-create-story`
(MIT). Transforms PRD + Architecture into epics, then into **hyper-detailed
stories** that give the Developer everything needed for flawless implementation.

These stories feed `tracker_state.json` and become the input the Supervisor
turns into StoryContracts. (Authoring stories = Planning Steward; dispatching &
governing them = Supervisor.)

## When to use
AFTER PRD + Architecture exist.

## Standard operating procedure
1. **Requirements inventory** — list every FR/NFR; build an **FR coverage map**.
2. **Epics by user value** — group requirements into epics, each with a goal and
   exit criteria.
3. **Stories per epic** — `As a / I want / so that`, with acceptance criteria in
   **Given/When/Then** form.
4. **Hyper-detail each story** so the Developer cannot go wrong:
   - tasks/subtasks mapped to each AC
   - dev notes: architecture patterns/constraints, **exact source-tree paths to
     touch**, testing standards
   - references: cite every technical detail with its source path+section
     `[Source: docs/architecture/...#AD-3]`
   - links back to the PRD FRs and architecture decisions it implements
5. **Verify coverage** — every FR maps to ≥1 story.

## Prevent these common LLM-developer mistakes (encode guards in each story)
Reinventing wheels · wrong libraries · wrong file locations · breaking
regressions · ignoring UX · vague implementations · claiming completion without
evidence · not learning from past work.

## Output
an epic list and hyper-detailed story files **for the target project**; these seed the project's runtime tracker that the Supervisor consumes.

## Postconditions
FR coverage map complete (every FR → ≥1 story); every story has testable
Given/When/Then AC; every story links to PRD + architecture; source-tree paths
named.

## What NOT to do
Do not write stories with vague AC · do not omit source paths/references · do not
leave any FR uncovered · do not copy the epic text into the story (engineer the
story to be self-contained).

Template: `assets/epic-story-template.md`.
