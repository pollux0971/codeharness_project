# Skill: Architecture Design  (Planning Steward · Architect function)

Adapted from BMAD-METHOD `bmad-create-architecture` (MIT). Produces architecture
decisions that make AI-agent implementation **consistent** and prevent conflicts.

## When to use
AFTER the PRD, BEFORE epics/stories. (BMAD V6: architecture decisions — database,
API patterns, tech stack — directly shape how work is later broken down, so they
come first.)

## Standard operating procedure
Collaborative, step-by-step, append-only. You are a facilitator, not a vendor.
For each decision area, make ONE explicit decision with rationale, append it to
the decision doc, and pause for approval before the next:
1. Tech stack & languages
2. Data model & storage
3. API / interface patterns
4. Module boundaries & dependency direction
5. Integration points (incl. external services, MCP servers like CodeGraph)
6. Testing standards & quality gates
7. Cross-cutting: security, secrets, observability

Never proceed past a step whose approval gate has not been cleared.

## Output
`docs/architecture/` decision document(s), one decision per section with rationale.

## Postconditions
Each decision recorded with rationale; stack/data/API/boundaries/testing all
covered; no open conflicts; decisions are specific enough that two different
agents would implement the same way.

## What NOT to do
Do not bundle multiple decisions into one unreviewed dump · do not leave a
decision without rationale · do not contradict the PRD glossary/terms.

Template: `assets/architecture-decision-template.md`.
