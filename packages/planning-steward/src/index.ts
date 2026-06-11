export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';

export interface IdeaInput {
  title: string;
  description: string;
  source?: 'user' | 'oss_reference' | 'brownfield_repo' | 'bug_report';
  idea_id?: string;
  goals?: string[];
  non_goals?: string[];
  constraints?: string[];
  target_users?: string[];
  source_refs?: string[];
}

export function classifyIdea(input: IdeaInput): IdeaMode {
  const text = `${input.title} ${input.description}`.toLowerCase();
  if (input.source === 'oss_reference' || text.includes('github.com')) return 'research_spike';
  if (text.includes('checkpoint') || text.includes('freeze')) return 'checkpoint';
  if (input.source === 'bug_report' || text.includes('bug') || text.includes('fix')) return 'patch';
  if (input.source === 'brownfield_repo' || text.includes('integrate') || text.includes('existing')) return 'brownfield';
  return 'greenfield';
}

export function requiredPlanningFiles(): string[] {
  return [
    '00_idea_record.md',
    '01_classification.md',
    '02_required_documents.md',
    '03_epic_story_graph.md',
    '04_parallelism_plan.md',
    '05_integration_plan.md',
    '06_rollback_plan.md',
    '07_context_compaction_plan.md',
    '08_supervisor_contract_draft.md',
    '09_acceptance_checklist.md'
  ];
}

// ── bundle assembly + graph (deterministic parts real; authoring is later) ───
export interface ValidationResult { ok: boolean; errors: string[] }

/** A planning bundle is complete only if every required file is present. */
export function validatePlanningBundle(presentFiles: string[]): ValidationResult {
  const missing = requiredPlanningFiles().filter(f => !presentFiles.includes(f)).map(f => `missing bundle file: ${f}`);
  return { ok: missing.length === 0, errors: missing };
}

export interface StoryNode { story_id: string; depends_on: string[]; allowed_write_set: string[]; parallelism_class?: string }
/** Two stories conflict for parallel run if their write-sets intersect (glob prefix check). */
export function detectParallelismConflict(a: StoryNode, b: StoryNode): boolean {
  const norm = (g: string) => g.replace(/\*+$/, '');
  return a.allowed_write_set.some(x => b.allowed_write_set.some(y =>
    norm(x).startsWith(norm(y)) || norm(y).startsWith(norm(x))));
}
/** Topological readiness: stories whose deps are all in `done`. */
export function selectableStories(stories: StoryNode[], done: Set<string>): StoryNode[] {
  return stories.filter(s => s.depends_on.every(d => done.has(d)));
}

// ── PlanningBundle types ─────────────────────────────────────────────────────

export interface PlanningBundlePrd {
  title: string;
  problem_statement: string;
  users: string[];
  goals: string[];
  non_goals: string[];
}

export interface PlanningBundleArchitecture {
  summary: string;
  components: string[];
  constraints: string[];
  risks: string[];
}

export interface OpenDecision {
  id: string;
  question: string;
  options: Array<{ option_id: string; tradeoff: string }>;
}

export interface PlanningBundle {
  bundle_id: string;
  idea_id: string;
  prd: PlanningBundlePrd;
  architecture: PlanningBundleArchitecture;
  open_decisions: OpenDecision[];
  source_refs: string[];
}

// ── createPlanningBundle implementation ─────────────────────────────────────

const SECRET_RE = /\b(?:password|api[-_]key|secret[-_]key|auth[-_]token|access[-_]key|private[-_]key|bearer)\s*[:=]/i;

function collectInputStrings(input: IdeaInput): string[] {
  return [
    input.title,
    input.description,
    ...(input.goals ?? []),
    ...(input.non_goals ?? []),
    ...(input.constraints ?? []),
    ...(input.target_users ?? []),
    ...(input.source_refs ?? []),
  ];
}

function rejectSecrets(fields: string[]): void {
  for (const f of fields) {
    if (SECRET_RE.test(f)) {
      throw new Error(`planning bundle: input contains secret-like content`);
    }
  }
}

function deriveIdeaId(title: string): string {
  const id = title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id || 'unnamed';
}

const ARCH_BY_MODE: Record<IdeaMode, { summary: string; components: string[]; risks: string[] }> = {
  greenfield: {
    summary: 'New standalone system; independent module boundaries apply.',
    components: ['core-module', 'api-layer', 'test-harness'],
    risks: ['scope creep on unplanned dependencies'],
  },
  brownfield: {
    summary: 'Integration with existing system; adapter layer required.',
    components: ['adapter-layer', 'integration-tests', 'migration-script'],
    risks: ['integration surface may require migration', 'existing test coverage unknown'],
  },
  patch: {
    summary: 'Targeted fix within existing module; minimal change surface.',
    components: ['target-module', 'regression-tests'],
    risks: ['fix may introduce regressions in adjacent code'],
  },
  checkpoint: {
    summary: 'State snapshot and promotion gate; no new feature surface.',
    components: ['checkpoint-validator', 'promotion-gate'],
    risks: ['promotion gate failure may block downstream stories'],
  },
  research_spike: {
    summary: 'Time-boxed investigation; output is a report, not production code.',
    components: ['research-document', 'prototype-optional'],
    risks: ['findings may not translate directly to implementation'],
  },
};

/**
 * STORY-009.1: Deterministic planning bundle builder.
 * Takes a structured idea input and produces a PRD + architecture sketch.
 * Emits ambiguities as structured open decisions (escalation schema).
 * No LLM, no external API, no secret reads; caller may inject idea_id for full determinism.
 */
export function createPlanningBundle(input: IdeaInput): PlanningBundle {
  if (!input.title?.trim()) throw new Error('planning bundle: title is required');
  if (!input.description?.trim()) throw new Error('planning bundle: description is required');

  rejectSecrets(collectInputStrings(input));

  const mode = classifyIdea(input);
  const idea_id = (input.idea_id ?? '').trim() || deriveIdeaId(input.title);
  const bundle_id = `bundle-${idea_id}`;

  // Sort all array fields for deterministic output ordering
  const goals = [...(input.goals ?? [])].sort();
  const non_goals = [...(input.non_goals ?? [])].sort();
  const constraints = [...(input.constraints ?? [])].sort();
  const target_users = [...(input.target_users ?? [])].sort();
  const source_refs = [...(input.source_refs ?? [])].sort();

  const arch = ARCH_BY_MODE[mode];

  // Detect ambiguities → structured open decisions (escalation-schema option_id+tradeoff)
  const open_decisions: OpenDecision[] = [];
  if (goals.length === 0) {
    open_decisions.push({
      id: 'od-1',
      question: 'What are the primary goals for this idea?',
      options: [
        { option_id: 'defer', tradeoff: 'Defer goal authoring to Planning Steward PRD review.' },
        { option_id: 'freeform', tradeoff: 'Author free-form goals in idea fixture before story generation.' },
      ],
    });
  }
  if (target_users.length === 0) {
    open_decisions.push({
      id: 'od-2',
      question: 'Who are the target users or actors?',
      options: [
        { option_id: 'defer', tradeoff: 'Defer user identification to PRD author.' },
        { option_id: 'freeform', tradeoff: 'Specify users in idea fixture before story generation.' },
      ],
    });
  }
  if (constraints.length === 0) {
    open_decisions.push({
      id: 'od-3',
      question: 'What technical or business constraints apply?',
      options: [
        { option_id: 'none', tradeoff: 'No constraints at this stage; accept risks.' },
        { option_id: 'defer', tradeoff: 'Defer constraint analysis to architecture review.' },
      ],
    });
  }

  return {
    bundle_id,
    idea_id,
    prd: {
      title: input.title.trim(),
      problem_statement: input.description.trim(),
      users: target_users,
      goals,
      non_goals,
    },
    architecture: {
      summary: arch.summary,
      components: [...arch.components],
      constraints,
      risks: [...arch.risks],
    },
    open_decisions,
    source_refs,
  };
}

/** Build the epic/story DAG with edges + parallelism classes. Later phase. */
export function buildStoryGraph(_bundle: Record<string, string>): StoryNode[] {
  throw new Error('not implemented: buildStoryGraph');
}
