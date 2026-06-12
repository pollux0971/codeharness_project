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

// ── STORY-019.4: Prompt-injection detection ───────────────────────────────────

export interface InjectionDetectionResult {
  detected: boolean;
  signals: string[];
}

const INJECTION_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'role_prefix_SYSTEM',      re: /SYSTEM:/i },
  { label: 'role_prefix_USER',        re: /USER:/i },
  { label: 'role_prefix_ASSISTANT',   re: /ASSISTANT:/i },
  { label: 'special_token_im_start',  re: /<\|im_start\|>/i },
  { label: 'special_token_im_end',    re: /<\|im_end\|>/i },
  { label: 'special_token_endoftext', re: /<\|endoftext\|>/i },
  { label: 'ignore_previous',         re: /ignore\s+previous\s+instructions/i },
  { label: 'ignore_all_previous',     re: /ignore\s+all\s+previous/i },
  { label: 'disregard_above',         re: /disregard\s+above/i },
  { label: 'roleplay_pretend',        re: /pretend\s+you\s+are/i },
  { label: 'roleplay_act_as',         re: /act\s+as\s+if\s+you\s+are/i },
  { label: 'roleplay_you_are_now',    re: /you\s+are\s+now/i },
  { label: 'write_set_widening',      re: /write\s+to\s+\//i },
  { label: 'bypass_workspace',        re: /bypass_workspace/i },
  { label: 'policy_write_set',        re: /allowed_write_set:/i },
];

export function detectPromptInjection(text: string): InjectionDetectionResult {
  const signals: string[] = [];
  for (const { label, re } of INJECTION_PATTERNS) {
    if (re.test(text)) signals.push(label);
  }
  return { detected: signals.length > 0, signals };
}

export function classifyIdea(input: IdeaInput): IdeaMode {
  const combined = `${input.title} ${input.description}`;
  if (detectPromptInjection(combined).detected) {
    throw new Error('idea_rejected: prompt injection detected');
  }
  const text = combined.toLowerCase();
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

// ── STORY-009.2: generateBacklogFromPlanningBundle ───────────────────────────

export type GeneratedEpic = {
  epic_id: string;
  title: string;
  objective: string;
  depends_on: string[];
  exit_criteria: string[];
};

export type GeneratedStory = {
  story_id: string;
  epic_id: string;
  title: string;
  objective: string;
  depends_on: string[];
  parallelism_class: 'parallel_safe' | 'parallel_with_barrier' | 'sequential';
  allowed_write_set: string[];
  forbidden_actions: string[];
  acceptance_criteria: Record<string, unknown>;
  validation_commands: string[];
  rollback_notes: string[];
};

export type GeneratedBacklog = {
  source_bundle_id: string;
  epics: GeneratedEpic[];
  stories: GeneratedStory[];
};

const STANDARD_FORBIDDEN_ACTIONS = [
  'No reading secrets, .env, or credential files',
  'No sudo or privilege escalation',
  'No real provider or network API calls (scripted/fixture only)',
  'No deleting or weakening existing tests',
  'No writes outside the allowed write-set',
];

const BUNDLE_SECRET_RE = /\b(?:password|api[-_]key|secret[-_]key|auth[-_]token|access[-_]key|private[-_]key|bearer)\s*[:=]/i;

function checkBundleForSecrets(bundle: PlanningBundle): void {
  const fields: string[] = [
    bundle.bundle_id,
    bundle.idea_id,
    bundle.prd.title,
    bundle.prd.problem_statement,
    ...bundle.prd.users,
    ...bundle.prd.goals,
    ...bundle.prd.non_goals,
    bundle.architecture.summary,
    ...bundle.architecture.components,
    ...bundle.architecture.constraints,
    ...bundle.architecture.risks,
    ...bundle.source_refs,
    ...bundle.open_decisions.map(od => od.question),
  ];
  for (const f of fields) {
    if (BUNDLE_SECRET_RE.test(f)) {
      throw new Error('generateBacklog: input contains secret-like content');
    }
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * STORY-009.2: Deterministic backlog generator.
 * Expands a PlanningBundle into schema-valid GeneratedEpic[] and GeneratedStory[].
 * No LLM, no external API, no secret reads. Caller may inject bundle_id for
 * full determinism. Output ordering and IDs are fully deterministic.
 */
export function generateBacklogFromPlanningBundle(bundle: PlanningBundle): GeneratedBacklog {
  if (!bundle?.bundle_id?.trim()) throw new Error('generateBacklog: bundle_id is required');
  if (!bundle?.prd?.title?.trim()) throw new Error('generateBacklog: prd.title is required');
  if (!Array.isArray(bundle?.architecture?.components) || bundle.architecture.components.length === 0) {
    throw new Error('generateBacklog: architecture.components must have at least one entry');
  }
  // ambiguity_blocks_until_answered (STORY-009.3): open decisions must be resolved before emission
  if (Array.isArray(bundle.open_decisions) && bundle.open_decisions.length > 0) {
    throw new Error(`generateBacklog: bundle has ${bundle.open_decisions.length} unresolved open decision(s) — resolve before backlog emission`);
  }

  checkBundleForSecrets(bundle);

  const prefix = bundle.bundle_id;
  const components = [...bundle.architecture.components].sort();
  const baseProject = prefix.replace(/^bundle-/, '');
  const projectRoot = `packages/${baseProject}`;

  const epics: GeneratedEpic[] = [];
  const stories: GeneratedStory[] = [];

  // Epic 01: Foundation
  const foundEpicId = `${prefix}-epic-${pad2(1)}`;
  const foundStoryId = `${prefix}-story-${pad2(1)}.1`;

  epics.push({
    epic_id: foundEpicId,
    title: `Foundation — ${bundle.prd.title}`,
    objective: `Establish project structure and shared types for: ${bundle.prd.problem_statement.slice(0, 120)}`,
    depends_on: [],
    exit_criteria: ['project_structure_exists', 'shared_types_defined', 'build_passes'],
  });

  stories.push({
    story_id: foundStoryId,
    epic_id: foundEpicId,
    title: 'Set up project structure and shared types',
    objective: 'Create the package scaffold, TypeScript config, and shared type definitions.',
    depends_on: [],
    parallelism_class: 'sequential',
    allowed_write_set: [`${projectRoot}/`],
    forbidden_actions: [...STANDARD_FORBIDDEN_ACTIONS],
    acceptance_criteria: {
      files_must_exist: [`${projectRoot}/package.json`, `${projectRoot}/tsconfig.json`],
      behaviors_must_pass: ['project_structure_exists', 'typecheck_passes'],
      commands_must_pass: ['pnpm typecheck'],
    },
    validation_commands: ['pnpm typecheck', 'pnpm test'],
    rollback_notes: [`Delete ${projectRoot}/ directory to revert project scaffold.`],
  });

  // Epics 02…N+1: one per architecture component (sorted for determinism)
  const componentTestStoryIds: string[] = [];

  components.forEach((component, idx) => {
    const epicNum = pad2(idx + 2);
    const compEpicId = `${prefix}-epic-${epicNum}`;
    const implStoryId = `${prefix}-story-${epicNum}.1`;
    const testStoryId = `${prefix}-story-${epicNum}.2`;

    epics.push({
      epic_id: compEpicId,
      title: `Implement ${component}`,
      objective: `Build and test the ${component} module for ${bundle.prd.title}.`,
      depends_on: [foundEpicId],
      exit_criteria: [
        `${component}_implements_contract`,
        `${component}_tests_pass`,
      ],
    });

    stories.push({
      story_id: implStoryId,
      epic_id: compEpicId,
      title: `Implement ${component} core`,
      objective: `Implement the primary logic and public interface for ${component}.`,
      depends_on: [foundStoryId],
      parallelism_class: 'sequential',
      allowed_write_set: [`${projectRoot}/${component}/src/`],
      forbidden_actions: [...STANDARD_FORBIDDEN_ACTIONS],
      acceptance_criteria: {
        behaviors_must_pass: [`${component}_core_implemented`, `${component}_types_exported`],
        commands_must_pass: ['pnpm typecheck'],
      },
      validation_commands: [`pnpm test --filter ${component}`, 'pnpm typecheck'],
      rollback_notes: [`Revert changes in ${projectRoot}/${component}/src/.`],
    });

    stories.push({
      story_id: testStoryId,
      epic_id: compEpicId,
      title: `Test ${component}`,
      objective: `Add unit tests covering all AC behaviors for ${component}.`,
      depends_on: [implStoryId],
      parallelism_class: 'parallel_safe',
      allowed_write_set: [`${projectRoot}/${component}/src/`],
      forbidden_actions: [...STANDARD_FORBIDDEN_ACTIONS],
      acceptance_criteria: {
        behaviors_must_pass: [`${component}_tests_added`, `${component}_ac_covered`],
        commands_must_pass: [`pnpm test --filter ${component}`, 'pnpm typecheck'],
      },
      validation_commands: [`pnpm test --filter ${component}`, 'pnpm typecheck'],
      rollback_notes: [`Revert test additions in ${projectRoot}/${component}/.`],
    });

    componentTestStoryIds.push(testStoryId);
  });

  // Final epic: Integration
  const integrationEpicNum = pad2(components.length + 2);
  const integrationEpicId = `${prefix}-epic-${integrationEpicNum}`;
  const integrationStoryId = `${prefix}-story-${integrationEpicNum}.1`;

  epics.push({
    epic_id: integrationEpicId,
    title: `Integration — ${bundle.prd.title}`,
    objective: 'Integrate all components and verify end-to-end behavior.',
    depends_on: epics.slice(1).map(e => e.epic_id),
    exit_criteria: ['all_components_integrated', 'e2e_validation_passes'],
  });

  stories.push({
    story_id: integrationStoryId,
    epic_id: integrationEpicId,
    title: 'Integration tests and end-to-end validation',
    objective: 'Add integration tests verifying all components work together as specified in the PRD.',
    depends_on: [...componentTestStoryIds],
    parallelism_class: 'sequential',
    allowed_write_set: [`${projectRoot}/`],
    forbidden_actions: [...STANDARD_FORBIDDEN_ACTIONS],
    acceptance_criteria: {
      behaviors_must_pass: ['all_components_integrated', 'e2e_tests_pass'],
      commands_must_pass: ['pnpm test', 'pnpm typecheck'],
    },
    validation_commands: ['pnpm test', 'pnpm typecheck'],
    rollback_notes: ['Revert integration test files.'],
  });

  return {
    source_bundle_id: prefix,
    epics,
    stories,
  };
}

/** Build the story DAG from a planning bundle. Returns StoryNode[] for scheduler use. */
export function buildStoryGraph(bundle: PlanningBundle): StoryNode[] {
  const backlog = generateBacklogFromPlanningBundle(bundle);
  return backlog.stories.map(s => ({
    story_id: s.story_id,
    depends_on: s.depends_on,
    allowed_write_set: s.allowed_write_set,
    parallelism_class: s.parallelism_class,
  }));
}

// ── STORY-019.1: DefectReport schema, validation, and sanitization ────────────

export interface DefectReport {
  report_id: string;
  title: string;
  what_broke: string;
  expected_behaviour: string;
  actual_behaviour: string;
  artifact_version: string;
  reported_at: string;
  story_id?: string | null;
  reproduction_steps?: string | null;
  severity?: 'critical' | 'high' | 'medium' | 'low' | null;
}

const REQUIRED_DEFECT_FIELDS = [
  'report_id', 'title', 'what_broke', 'expected_behaviour',
  'actual_behaviour', 'artifact_version', 'reported_at',
] as const;

const DEFECT_FIELD_LIMITS: Record<string, number> = {
  title: 120,
  what_broke: 2000,
  expected_behaviour: 2000,
  actual_behaviour: 2000,
  reproduction_steps: 5000,
};

export function validateDefectReport(report: unknown): ValidationResult {
  if (typeof report !== 'object' || report === null) {
    return { ok: false, errors: ['defect report must be a non-null object'] };
  }
  const r = report as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of REQUIRED_DEFECT_FIELDS) {
    if (typeof r[field] !== 'string' || !(r[field] as string).trim()) {
      errors.push(`missing or empty required field: ${field}`);
    }
  }

  for (const [field, limit] of Object.entries(DEFECT_FIELD_LIMITS)) {
    if (typeof r[field] === 'string' && (r[field] as string).length > limit) {
      errors.push(`field ${field} exceeds ${limit} character limit`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function sanitizeDefectText(text: string): string {
  return text
    .replace(/SYSTEM:|USER:|ASSISTANT:|<\|im_start\|>/gi, '')
    .replace(/[<>&]/g, '');
}
