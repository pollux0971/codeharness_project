import * as fs from 'node:fs';
import * as path from 'node:path';
import { computeImpactSet, NULL_CLIENT } from '@codeharness/codegraph-adapter';
import { extractProjectProfile } from '@codeharness/context-manager';
const INJECTION_PATTERNS = [
    { label: 'role_prefix_SYSTEM', re: /SYSTEM:/i },
    { label: 'role_prefix_USER', re: /USER:/i },
    { label: 'role_prefix_ASSISTANT', re: /ASSISTANT:/i },
    { label: 'special_token_im_start', re: /<\|im_start\|>/i },
    { label: 'special_token_im_end', re: /<\|im_end\|>/i },
    { label: 'special_token_endoftext', re: /<\|endoftext\|>/i },
    { label: 'ignore_previous', re: /ignore\s+previous\s+instructions/i },
    { label: 'ignore_all_previous', re: /ignore\s+all\s+previous/i },
    { label: 'disregard_above', re: /disregard\s+above/i },
    { label: 'roleplay_pretend', re: /pretend\s+you\s+are/i },
    { label: 'roleplay_act_as', re: /act\s+as\s+if\s+you\s+are/i },
    { label: 'roleplay_you_are_now', re: /you\s+are\s+now/i },
    { label: 'write_set_widening', re: /write\s+to\s+\//i },
    { label: 'bypass_workspace', re: /bypass_workspace/i },
    { label: 'policy_write_set', re: /allowed_write_set:/i },
];
export function detectPromptInjection(text) {
    const signals = [];
    for (const { label, re } of INJECTION_PATTERNS) {
        if (re.test(text))
            signals.push(label);
    }
    return { detected: signals.length > 0, signals };
}
export function classifyIdea(input) {
    const combined = `${input.title} ${input.description}`;
    if (detectPromptInjection(combined).detected) {
        throw new Error('idea_rejected: prompt injection detected');
    }
    const text = combined.toLowerCase();
    if (input.source === 'oss_reference' || text.includes('github.com'))
        return 'research_spike';
    if (text.includes('checkpoint') || text.includes('freeze'))
        return 'checkpoint';
    if (input.source === 'bug_report' || text.includes('bug') || text.includes('fix'))
        return 'patch';
    if (input.source === 'brownfield_repo' || text.includes('integrate') || text.includes('existing'))
        return 'brownfield';
    return 'greenfield';
}
export function requiredPlanningFiles() {
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
/** A planning bundle is complete only if every required file is present. */
export function validatePlanningBundle(presentFiles) {
    const missing = requiredPlanningFiles().filter(f => !presentFiles.includes(f)).map(f => `missing bundle file: ${f}`);
    return { ok: missing.length === 0, errors: missing };
}
/** Two stories conflict for parallel run if their write-sets intersect (glob prefix check). */
export function detectParallelismConflict(a, b) {
    const norm = (g) => g.replace(/\*+$/, '');
    return a.allowed_write_set.some(x => b.allowed_write_set.some(y => norm(x).startsWith(norm(y)) || norm(y).startsWith(norm(x))));
}
/** Topological readiness: stories whose deps are all in `done`. */
export function selectableStories(stories, done) {
    return stories.filter(s => s.depends_on.every(d => done.has(d)));
}
/**
 * STORY-020.2: Emit structured ambiguity questions for brownfield stories whose
 * deltas affect symbols that already exist in the codebase.
 */
export function emitAmbiguityQuestions(story, existingSymbols) {
    if (story.task_class !== 'brownfield')
        return [];
    const symbolSet = new Set(existingSymbols);
    const questions = [];
    for (const delta of story.brownfield_deltas ?? []) {
        for (const sym of delta.affected_symbols) {
            if (symbolSet.has(sym)) {
                questions.push({
                    id: `ambiguity_${sym}`,
                    text: `Is the current behavior of ${sym} intentional? The patch may change it.`,
                    type: 'text',
                    required: true,
                });
            }
        }
    }
    return questions;
}
// ── createPlanningBundle implementation ─────────────────────────────────────
const SECRET_RE = /\b(?:password|api[-_]key|secret[-_]key|auth[-_]token|access[-_]key|private[-_]key|bearer)\s*[:=]/i;
function collectInputStrings(input) {
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
function rejectSecrets(fields) {
    for (const f of fields) {
        if (SECRET_RE.test(f)) {
            throw new Error(`planning bundle: input contains secret-like content`);
        }
    }
}
function deriveIdeaId(title) {
    const id = title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return id || 'unnamed';
}
const ARCH_BY_MODE = {
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
export function createPlanningBundle(input) {
    if (!input.title?.trim())
        throw new Error('planning bundle: title is required');
    if (!input.description?.trim())
        throw new Error('planning bundle: description is required');
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
    const open_decisions = [];
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
const STANDARD_FORBIDDEN_ACTIONS = [
    'No reading secrets, .env, or credential files',
    'No sudo or privilege escalation',
    'No real provider or network API calls (scripted/fixture only)',
    'No deleting or weakening existing tests',
    'No writes outside the allowed write-set',
];
const BUNDLE_SECRET_RE = /\b(?:password|api[-_]key|secret[-_]key|auth[-_]token|access[-_]key|private[-_]key|bearer)\s*[:=]/i;
function checkBundleForSecrets(bundle) {
    const fields = [
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
function pad2(n) {
    return String(n).padStart(2, '0');
}
/**
 * STORY-009.2: Deterministic backlog generator.
 * Expands a PlanningBundle into schema-valid GeneratedEpic[] and GeneratedStory[].
 * No LLM, no external API, no secret reads. Caller may inject bundle_id for
 * full determinism. Output ordering and IDs are fully deterministic.
 */
export function generateBacklogFromPlanningBundle(bundle) {
    if (!bundle?.bundle_id?.trim())
        throw new Error('generateBacklog: bundle_id is required');
    if (!bundle?.prd?.title?.trim())
        throw new Error('generateBacklog: prd.title is required');
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
    const epics = [];
    const stories = [];
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
    const componentTestStoryIds = [];
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
export function buildStoryGraph(bundle) {
    const backlog = generateBacklogFromPlanningBundle(bundle);
    return backlog.stories.map(s => ({
        story_id: s.story_id,
        depends_on: s.depends_on,
        allowed_write_set: s.allowed_write_set,
        parallelism_class: s.parallelism_class,
    }));
}
const REQUIRED_DEFECT_FIELDS = [
    'report_id', 'title', 'what_broke', 'expected_behaviour',
    'actual_behaviour', 'artifact_version', 'reported_at',
];
const DEFECT_FIELD_LIMITS = {
    title: 120,
    what_broke: 2000,
    expected_behaviour: 2000,
    actual_behaviour: 2000,
    reproduction_steps: 5000,
};
export function validateDefectReport(report) {
    if (typeof report !== 'object' || report === null) {
        return { ok: false, errors: ['defect report must be a non-null object'] };
    }
    const r = report;
    const errors = [];
    for (const field of REQUIRED_DEFECT_FIELDS) {
        if (typeof r[field] !== 'string' || !r[field].trim()) {
            errors.push(`missing or empty required field: ${field}`);
        }
    }
    for (const [field, limit] of Object.entries(DEFECT_FIELD_LIMITS)) {
        if (typeof r[field] === 'string' && r[field].length > limit) {
            errors.push(`field ${field} exceeds ${limit} character limit`);
        }
    }
    return { ok: errors.length === 0, errors };
}
export function sanitizeDefectText(text) {
    return text
        .replace(/SYSTEM:|USER:|ASSISTANT:|<\|im_start\|>/gi, '')
        .replace(/[<>&]/g, '');
}
const SHA_RE = /^[0-9a-f]{7,}$/i;
export function classifyDefect(report) {
    const version = (report.artifact_version ?? '').trim();
    const broke = (report.what_broke ?? '').toLowerCase();
    const expected = (report.expected_behaviour ?? '').toLowerCase();
    if (/environment|config|env var/i.test(broke))
        return 'environment';
    if (/documentation|misunderstood/i.test(broke) || /documentation|misunderstood/i.test(expected))
        return 'user_error';
    if (SHA_RE.test(version))
        return 'regression';
    return 'unknown';
}
export async function attemptReproduction(_report, command, runner) {
    const run_at = new Date().toISOString();
    try {
        const result = await runner.run(command);
        return {
            status: result.ok ? 'non_reproducible' : 'confirmed',
            output: result.output,
            run_at,
        };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { status: 'error', output: msg, run_at };
    }
}
export function buildRepairStory(opts) {
    if (opts.reproduction.status === 'non_reproducible') {
        throw new Error('repair_story_blocked: defect is non_reproducible');
    }
    const writeSet = opts.impactedFiles && opts.impactedFiles.length > 0
        ? [...new Set(opts.impactedFiles)].sort()
        : ['src/**'];
    return {
        story_id: 'STORY-REPAIR-' + opts.report.report_id,
        depends_on: [],
        parallelism_class: 'sequential',
        allowed_write_set: writeSet,
        task_class: 'brownfield',
    };
}
export async function triageDefect(report, command, runner, impactedFiles) {
    const defect_class = classifyDefect(report);
    const reproduction = await attemptReproduction(report, command, runner);
    if (reproduction.status === 'non_reproducible') {
        return {
            report,
            defect_class,
            reproduction,
            repair_story: null,
            triage_blocked: true,
            triage_blocked_reason: 'non_reproducible',
        };
    }
    const repair_story = buildRepairStory({ report, defectClass: defect_class, reproduction, impactedFiles });
    return { report, defect_class, reproduction, repair_story, triage_blocked: false };
}
function discoverEntryPoints(repoPath) {
    const candidates = [];
    try {
        const pkgRaw = fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8');
        const pkg = JSON.parse(pkgRaw);
        if (typeof pkg.main === 'string')
            candidates.push(pkg.main);
        if (typeof pkg.bin === 'string')
            candidates.push(pkg.bin);
        if (typeof pkg.bin === 'object' && pkg.bin !== null) {
            candidates.push(...Object.values(pkg.bin).filter((v) => typeof v === 'string'));
        }
    }
    catch { /* no package.json or parse error */ }
    for (const f of ['src/index.ts', 'src/main.ts', 'src/cli.ts', 'app.ts']) {
        candidates.push(f);
    }
    return [...new Set(candidates)].filter(f => {
        try {
            return fs.existsSync(path.join(repoPath, f));
        }
        catch {
            return false;
        }
    });
}
function classifyLayers(repoPath) {
    const layers = [];
    const testPaths = ['test', 'tests', '__tests__'].filter(d => {
        try {
            return fs.existsSync(path.join(repoPath, d));
        }
        catch {
            return false;
        }
    }).map(d => d + '/');
    if (testPaths.length > 0)
        layers.push({ name: 'test', paths: testPaths });
    const configDirs = ['configs'].filter(d => {
        try {
            return fs.existsSync(path.join(repoPath, d));
        }
        catch {
            return false;
        }
    }).map(d => d + '/');
    const configFiles = [];
    try {
        for (const e of fs.readdirSync(repoPath)) {
            const full = path.join(repoPath, e);
            try {
                if (fs.statSync(full).isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            if (e.startsWith('.env') || e.endsWith('.yaml') || e.endsWith('.yml') || /\.config\./.test(e)) {
                configFiles.push(e);
            }
        }
    }
    catch { /* ignore */ }
    const configPaths = [...configDirs, ...configFiles];
    if (configPaths.length > 0)
        layers.push({ name: 'config', paths: configPaths });
    const apiDirs = ['routes', 'api', 'controllers', 'handlers'].filter(d => {
        try {
            return fs.existsSync(path.join(repoPath, 'src', d));
        }
        catch {
            return false;
        }
    }).map(d => `src/${d}/`);
    if (apiDirs.length > 0)
        layers.push({ name: 'api', paths: apiDirs });
    const domainDirs = ['domain', 'services', 'models', 'core'].filter(d => {
        try {
            return fs.existsSync(path.join(repoPath, 'src', d));
        }
        catch {
            return false;
        }
    }).map(d => `src/${d}/`);
    if (domainDirs.length > 0)
        layers.push({ name: 'domain', paths: domainDirs });
    const infraDirs = ['db', 'cache', 'queue', 'storage'].filter(d => {
        try {
            return fs.existsSync(path.join(repoPath, 'src', d));
        }
        catch {
            return false;
        }
    }).map(d => `src/${d}/`);
    if (infraDirs.length > 0)
        layers.push({ name: 'infra', paths: infraDirs });
    const hasSrc = (() => { try {
        return fs.existsSync(path.join(repoPath, 'src'));
    }
    catch {
        return false;
    } })();
    if (hasSrc)
        layers.push({ name: 'root', paths: ['src/'] });
    return layers;
}
function buildArchitectureMd(entry_points, layers) {
    const lines = ['# As-Is Architecture', '', '## Entry Points'];
    if (entry_points.length > 0) {
        lines.push(...entry_points.map(e => `- ${e}`));
    }
    else {
        lines.push('_No entry points detected_');
    }
    lines.push('', '## Layers');
    for (const layer of layers) {
        lines.push(`### ${layer.name}`);
        lines.push(...layer.paths.map(p => `- ${p}`));
        lines.push('');
    }
    return lines.join('\n');
}
function buildConventionsMd(conventions) {
    const lines = ['# As-Is Conventions', ''];
    for (const [k, v] of Object.entries(conventions)) {
        lines.push(`- **${k}**: ${v}`);
    }
    return lines.join('\n');
}
export async function importBrownfieldRepo(opts) {
    const resolvedRepo = path.resolve(opts.repoPath);
    const resolvedOutput = path.resolve(opts.outputPath);
    if (resolvedOutput === resolvedRepo || resolvedOutput.startsWith(resolvedRepo + path.sep)) {
        throw new Error('brownfield_import_error: output must not be inside source repo');
    }
    const profile = opts.extractProfile
        ? opts.extractProfile(opts.repoPath)
        : extractProjectProfile(opts.repoPath);
    const entry_points = discoverEntryPoints(opts.repoPath);
    const layers = classifyLayers(opts.repoPath);
    const client = opts.codegraphClient ?? NULL_CLIENT;
    const impactResult = await computeImpactSet([opts.repoPath], client);
    const dependency_map = {};
    for (const f of impactResult.impactedFiles) {
        dependency_map[f] = [];
    }
    const conventions = {
        framework: profile.test_layout.framework,
        language: profile.toolchain.language,
        lint: profile.toolchain.lint_tool,
    };
    const asisDir = path.join(opts.outputPath, 'as-is');
    fs.mkdirSync(asisDir, { recursive: true });
    fs.writeFileSync(path.join(asisDir, 'ARCHITECTURE.md'), buildArchitectureMd(entry_points, layers), 'utf8');
    fs.writeFileSync(path.join(asisDir, 'CONVENTIONS.md'), buildConventionsMd(conventions), 'utf8');
    return {
        intake_id: `bf-${Date.now().toString(36)}`,
        repo_path: opts.repoPath,
        intake_at: new Date().toISOString(),
        entry_points,
        layers,
        dependency_map,
        conventions,
        recovery_docs_path: path.join(opts.outputPath, 'as-is'),
    };
}
function deriveStoryIdFromMessage(text) {
    const slug = text.trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    return `STORY-SC-${slug || 'unnamed'}`;
}
function validateStoryNodes(stories) {
    const errors = [];
    for (const s of stories) {
        if (!s.story_id)
            errors.push('story_id is required');
        if (!s.allowed_write_set || s.allowed_write_set.length === 0) {
            errors.push(`allowed_write_set must be non-empty for story ${s.story_id}`);
        }
        if (!s.parallelism_class)
            errors.push(`parallelism_class is required for story ${s.story_id}`);
    }
    return errors;
}
export async function processScopeChange(messageText, opts) {
    // Step 1: injection check
    const injectionResult = detectPromptInjection(messageText);
    if (injectionResult.detected) {
        return {
            new_stories: [],
            epic_list_additions: [],
            source_message: messageText,
            validated: false,
            validation_errors: [`scope_change_rejected: prompt injection detected: ${injectionResult.signals.join(', ')}`],
        };
    }
    // Step 2: classify the idea
    let mode;
    try {
        mode = classifyIdea({ title: 'scope change', description: messageText });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { new_stories: [], epic_list_additions: [], source_message: messageText, validated: false, validation_errors: [msg] };
    }
    // Step 3: build a stub StoryNode (1 per idea)
    const storyId = deriveStoryIdFromMessage(messageText);
    const epicId = `EPIC-SC-${mode}`;
    const taskClass = mode === 'patch' ? 'patch' : mode === 'brownfield' ? 'brownfield' : 'greenfield';
    const storyNode = {
        story_id: storyId,
        depends_on: [],
        allowed_write_set: ['src/**'],
        parallelism_class: 'sequential',
        task_class: taskClass,
    };
    // Ambiguity detection (brownfield only — greenfield returns [])
    emitAmbiguityQuestions(storyNode, []);
    // Step 4: bundle gate — validate story nodes
    const validation_errors = validateStoryNodes([storyNode]);
    if (validation_errors.length > 0) {
        return { new_stories: [], epic_list_additions: [], source_message: messageText, validated: false, validation_errors };
    }
    // Step 5: preemption guard — no new story may replace the running story
    if (opts.runningStoryId && storyNode.story_id === opts.runningStoryId) {
        return {
            new_stories: [],
            epic_list_additions: [],
            source_message: messageText,
            validated: false,
            validation_errors: [`scope_change_rejected: story_id '${storyNode.story_id}' would preempt running story`],
        };
    }
    return {
        new_stories: [storyNode],
        epic_list_additions: [epicId],
        source_message: messageText,
        validated: true,
        validation_errors: [],
    };
}
const REQUIRED_INTAKE_FIELDS = [
    'intake_id', 'repo_path', 'intake_at', 'entry_points',
    'layers', 'dependency_map', 'conventions', 'recovery_docs_path',
];
export function validateBrownfieldIntake(intake) {
    if (typeof intake !== 'object' || intake === null) {
        return { ok: false, errors: ['brownfield intake must be a non-null object'] };
    }
    const r = intake;
    const errors = [];
    for (const field of REQUIRED_INTAKE_FIELDS) {
        if (!(field in r) || r[field] === undefined || r[field] === null) {
            errors.push(`missing required field: ${field}`);
        }
    }
    for (const field of ['intake_id', 'repo_path', 'intake_at', 'recovery_docs_path']) {
        if (field in r && typeof r[field] === 'string' && !r[field].trim()) {
            errors.push(`field ${field} must be non-empty`);
        }
    }
    if (typeof r.recovery_docs_path === 'string' &&
        typeof r.repo_path === 'string' &&
        r.recovery_docs_path.trim() &&
        r.recovery_docs_path === r.repo_path) {
        errors.push('recovery_docs_path must differ from repo_path');
    }
    return { ok: errors.length === 0, errors };
}
//# sourceMappingURL=index.js.map