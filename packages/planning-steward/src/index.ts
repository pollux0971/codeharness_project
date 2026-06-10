export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';

export interface IdeaInput {
  title: string;
  description: string;
  source?: 'user' | 'oss_reference' | 'brownfield_repo' | 'bug_report';
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

/** Render the full planning bundle from an idea (PRD→architecture→stories). Later phase. */
export function createPlanningBundle(_idea: IdeaInput): Record<string, string> {
  throw new Error('not implemented: createPlanningBundle (authors the 10 bundle files)');
}
/** Build the epic/story DAG with edges + parallelism classes. Later phase. */
export function buildStoryGraph(_bundle: Record<string, string>): StoryNode[] {
  throw new Error('not implemented: buildStoryGraph');
}
