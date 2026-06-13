// Context Manager (skeleton).
// Implements 2-level adaptive compression (MUSE), sliding window + periodic
// re-injection (ReCAP), and state-dependent strategy routing (AgentSwing).
// Parameters come from configs/context_manager.yaml; load them at runtime.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { selectSkillsForRole, sortByDependencyOrder, readSkillContent, } from '@codeharness/skill-runtime';
export const DEFAULT_CONFIG = {
    level1NodeTokenThreshold: 4000,
    level2ChainTokenThreshold: 60000,
    keepFirstTurns: 3,
    keepLastTurns: 5,
    compressionRateFloor: 0.3,
    slidingWindowMaxTurns: 20,
    reInjectContractEveryNCalls: 10,
    reInjectRulesEveryNCalls: 20,
    budgets: { planning_steward: 32000, supervisor: 16000, developer: 128000, debugger: 32000, reviewer: 16000 },
};
// ── Strategy routing (AgentSwing) ─────────────────────────────────────────────
export function pickStrategy(phase) {
    const m = { search: 'keep_last_n', terminal: 'summarize_chain', stuck: 'aggressive_discard' };
    return m[phase];
}
/** Map a lifecycle phase to a compression trajectory phase for strategy routing. */
export function lifecycleToTrajectory(phase) {
    switch (phase) {
        case 'debugging': return 'stuck';
        case 'checkpointing':
        case 'done': return 'terminal';
        default: return 'search';
    }
}
export function detectPhase(sigOrWindow, cfg) {
    if ('turns' in sigOrWindow && cfg !== undefined) {
        const window = sigOrWindow;
        const pinnedCount = window.turns.filter(t => t.pinned).length;
        if (pinnedCount >= cfg.keepLastTurns)
            return 'terminal';
        if (window.totalTokens < cfg.level2ChainTokenThreshold * 0.5)
            return 'search';
        return 'stuck';
    }
    const signals = sigOrWindow;
    if (signals.phase !== undefined)
        return signals.phase;
    if (signals.checkpointMarker === true || signals.storyStatus === 'checkpointed')
        return 'checkpointing';
    if (signals.storyStatus === 'done')
        return 'done';
    if (signals.escalationRequired === true ||
        signals.storyStatus === 'escalated' ||
        signals.storyStatus === 'blocked')
        return 'escalating';
    if ((signals.failureCount !== undefined && signals.failureCount > 0) ||
        signals.validationPassed === false ||
        signals.storyStatus === 'debugging')
        return 'debugging';
    if (signals.validationPassed === true ||
        signals.storyStatus === 'validating' ||
        signals.storyStatus === 'passed')
        return 'validating';
    if (signals.storyStatus === 'in_progress')
        return 'developing';
    if (signals.storyStatus === 'todo')
        return 'planning';
    return 'unknown';
}
// ── Re-injection (ReCAP anti rule-amnesia) ───────────────────────────────────
/** Inject the story contract + AVOID genes + hard rules on the Nth call. */
export function shouldReinject(callCount, cfg) {
    return {
        contract: callCount % cfg.reInjectContractEveryNCalls === 0,
        failureGenes: callCount % cfg.reInjectContractEveryNCalls === 0,
        hardRules: callCount % cfg.reInjectRulesEveryNCalls === 0,
    };
}
// ── Required sections per role ────────────────────────────────────────────────
export function requiredContextSections(role) {
    switch (role) {
        case 'planning_steward': return ['raw_idea', 'known_constraints', 'source_type'];
        case 'supervisor': return ['project_status', 'story_goal', 'codegraph_summary', 'invariants'];
        case 'developer': return ['story_contract', 'relevant_files', 'allowed_write_set', 'validation_commands', 'failure_genes'];
        case 'debugger': return ['failed_logs', 'current_patch', 'affected_codegraph', 'debug_attempts', 'matching_failure_genes'];
        case 'reviewer': return ['failing_test_output', 'acceptance_criteria', 'diff_under_review', 'gene_signals'];
    }
}
/** Select ONLY the sections this role requires, by reference; everything else is excluded.
 *  This is how secrets/unrelated logs/full repo stay out — by not selecting them. */
export function buildRoleContextPacket(role, available) {
    const required = requiredContextSections(role);
    const sections = available.filter(a => required.includes(a.name));
    const excluded = available.filter(a => !required.includes(a.name)).map(a => a.name);
    return { role, sections, excluded };
}
const SECRET_IN_CONTEXT = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\.ssh\/id_rsa|auth\.json)/i;
/** A packet is valid only if it carries no secret material and every section has a source ref. */
export function validateContextPacket(packet) {
    const errors = [];
    for (const s of packet.sections) {
        if (!s.ref)
            errors.push(`section ${s.name} missing source_ref`);
        if (s.text && SECRET_IN_CONTEXT.test(s.text))
            errors.push(`secret material in section ${s.name}`);
    }
    return { ok: errors.length === 0, errors };
}
/** Keep context within budget by DROPPING low-priority artifact refs (never the raw trace).
 *  Returns the kept sections and the names deferred to on-demand fetch. */
export function enforceTokenBudgetByArtifactSelection(sections, budgetTokens) {
    const ordered = [...sections].sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5)); // lower priority number = keep first
    const kept = [];
    const deferred = [];
    let used = 0;
    for (const s of ordered) {
        const t = s.tokenCount ?? 0;
        if (used + t <= budgetTokens) {
            kept.push(s);
            used += t;
        }
        else {
            deferred.push(s.name);
        }
    }
    return { kept, deferred };
}
// ── Compression helpers (LLM-backed; not implemented until ROADMAP:phase-2) ──
// These private helpers are called by compressLargeNodes / compressChain.
// The scanner attributes them to enforceTokenBudgetByArtifactSelection (last export above).
/** Level-1: compress any single oversized node. Run first. */
export function compressLargeNodes(window, cfg) {
    const turns = window.turns.map((t, i) => {
        if (t.pinned)
            return t;
        const isFirst = i < cfg.keepFirstTurns;
        const isLast = i >= window.turns.length - cfg.keepLastTurns;
        if (isFirst || isLast)
            return { ...t, pinned: true };
        if (t.tokenCount > cfg.level1NodeTokenThreshold) {
            return summarizeTurn(t, cfg.compressionRateFloor);
        }
        return t;
    });
    return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}
/** Level-2: chain-compress the middle section when total still exceeds threshold. */
export function compressChain(window, cfg) {
    if (window.totalTokens <= cfg.level2ChainTokenThreshold)
        return window;
    const pinned = window.turns.filter(t => t.pinned);
    const unpinned = window.turns.filter(t => !t.pinned);
    const compressed = mergeAndSummarize(unpinned, cfg.compressionRateFloor);
    const turns = reorder(pinned, compressed, window.turns.length, cfg.keepFirstTurns, cfg.keepLastTurns);
    return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}
/** Main entry point: run Level-1 then Level-2 if still needed. */
export function adaptiveCompress(window, cfg = DEFAULT_CONFIG) {
    let w = compressLargeNodes(window, cfg);
    if (w.totalTokens > cfg.level2ChainTokenThreshold)
        w = compressChain(w, cfg);
    return applySlidingWindow(w, cfg);
}
/** Sliding window: drop oldest non-pinned turns beyond the max. */
export function applySlidingWindow(window, cfg) {
    const nonPinned = window.turns.filter(t => !t.pinned);
    const excess = nonPinned.length - cfg.slidingWindowMaxTurns;
    if (excess <= 0)
        return window;
    const toRemove = new Set(nonPinned.slice(0, excess).map((_, i) => i));
    let idx = 0;
    const turns = window.turns.filter(t => {
        if (t.pinned)
            return true;
        return !toRemove.has(idx++);
    });
    return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}
function summarizeTurn(t, floor) {
    const targetLen = Math.max(50, Math.floor(t.content.length * floor));
    const truncated = t.content.slice(0, targetLen);
    const summary = truncated.endsWith(' ') ? truncated.trimEnd() : truncated;
    return {
        ...t,
        content: summary + ' [compacted]',
        tokenCount: Math.ceil((summary.length + 12) / 4),
    };
}
function mergeAndSummarize(turns, floor) {
    if (turns.length === 0)
        return [];
    const combined = turns.map(t => t.content).join(' ');
    const targetLen = Math.max(100, Math.floor(combined.length * floor));
    return [{
            role: 'system',
            content: combined.slice(0, targetLen) + ' [chain-compacted]',
            tokenCount: Math.ceil((targetLen + 18) / 4),
            pinned: false,
        }];
}
function reorder(pinned, compressed, _total, _first, _last) {
    return [...pinned, ...compressed];
}
// ── STORY-027.4: Never-compress zone ─────────────────────────────────────────
export const AUTO_PINNED_NAMES = [
    'arch_decisions',
    'story_invariants',
    'global_gate_statuses',
];
export function buildPinnedZone(sections) {
    return sections.map(s => ({
        name: s.name,
        ref: `pinned_zone:${s.name}`,
        text: s.text,
        tokenCount: Math.ceil(s.text.length / 4),
        priority: 0,
    }));
}
/** Orchestrate the full compaction pipeline: Level-1 then Level-2 if still needed. */
export function compactContextWindow(window, cfg = DEFAULT_CONFIG, pinnedSections) {
    let w = window;
    if (pinnedSections && pinnedSections.length > 0) {
        const syntheticPinned = pinnedSections.map(s => ({
            role: 'system',
            content: s.text,
            tokenCount: Math.ceil(s.text.length / 4),
            pinned: true,
        }));
        w = {
            turns: [...syntheticPinned, ...window.turns],
            totalTokens: syntheticPinned.reduce((sum, t) => sum + t.tokenCount, 0) + window.totalTokens,
        };
    }
    let result = compressLargeNodes(w, cfg);
    if (result.totalTokens > cfg.level2ChainTokenThreshold)
        result = compressChain(result, cfg);
    return applySlidingWindow(result, cfg);
}
// ── STORY-015.4: project conventions memory (per-target profile) ──────────────
/** Pattern for redacting secret-looking strings before they enter context. */
const SECRET_PATTERN = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\.ssh\/id_rsa|auth\.json)/i;
/**
 * Extract project conventions from a target repo directory via static analysis.
 * Reads only file/directory names and package.json devDependencies — never leaks
 * file contents and redacts any secret-looking strings before writing the summary.
 */
export function extractProjectProfile(projectRoot) {
    const entries = (() => { try {
        return fs.readdirSync(projectRoot);
    }
    catch {
        return [];
    } })();
    const src_dir = ['src', 'lib', 'source'].find(d => entries.includes(d)) ?? 'src';
    const test_dir = ['test', 'tests', '__tests__', 'spec'].find(d => entries.includes(d)) ?? 'test';
    let pkg = {};
    if (entries.includes('package.json')) {
        try {
            pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
        }
        catch { /* ignore */ }
    }
    const devDeps = pkg.devDependencies ?? {};
    const deps = pkg.dependencies ?? {};
    const allDeps = { ...deps, ...devDeps };
    const framework = 'vitest' in devDeps ? 'vitest' :
        'jest' in devDeps ? 'jest' :
            'mocha' in devDeps ? 'mocha' : 'unknown';
    const build_tool = 'vite' in allDeps ? 'vite' :
        'tsc' in allDeps ? 'tsc' :
            'webpack' in allDeps ? 'webpack' :
                'esbuild' in allDeps ? 'esbuild' :
                    'rollup' in allDeps ? 'rollup' : 'unknown';
    const lint_tool = 'eslint' in allDeps ? 'eslint' :
        'biome' in allDeps ? 'biome' :
            'tslint' in allDeps ? 'tslint' : 'none';
    const formatter = 'prettier' in allDeps ? 'prettier' :
        'biome' in allDeps ? 'biome' : 'none';
    const language = ('typescript' in allDeps || '@types/node' in allDeps) ? 'typescript' : 'javascript';
    const test_pattern = framework === 'mocha' ? '**/*.spec.ts' :
        (framework === 'vitest' || framework === 'jest') ? '**/*.test.ts' : '**/*.test.*';
    const co_located = test_dir === src_dir;
    const lintGlobs = ['.eslintrc', 'eslint.config', 'biome.json', '.prettierrc', 'prettier.config'];
    const lint_config_files = entries.filter(e => lintGlobs.some(g => e.startsWith(g)));
    const pkgName = typeof pkg.name === 'string' ? pkg.name : '';
    const convention = /[a-z]+-[a-z]/.test(pkgName) ? 'kebab-case' :
        /[a-z][A-Z]/.test(pkgName) ? 'camelCase' :
            /^[A-Z]/.test(pkgName) ? 'PascalCase' :
                /[a-z]_[a-z]/.test(pkgName) ? 'snake_case' : 'unknown';
    const rawSummary = `Project: ${language}, ${framework} tests, ${lint_tool} lint, src=${src_dir}`;
    const summary = rawSummary.replace(SECRET_PATTERN, '[REDACTED]').slice(0, 200);
    return {
        project_root: projectRoot,
        extracted_at: new Date().toISOString(),
        naming: { convention, src_dir, test_dir },
        test_layout: { framework, test_pattern, co_located },
        toolchain: { language, build_tool, lint_tool, formatter },
        lint_config_files,
        summary,
    };
}
/**
 * Inject the project profile as a `project_conventions` ArtifactRef into a
 * developer or debugger context packet. Returns the packet unchanged for all
 * other roles.
 */
export function injectProjectProfile(packet, profile) {
    if (packet.role !== 'developer' && packet.role !== 'debugger')
        return packet;
    const ref = {
        name: 'project_conventions',
        ref: 'project_profile',
        text: profile.summary,
        tokenCount: Math.ceil(profile.summary.length / 4),
        priority: 4,
    };
    return { ...packet, sections: [...packet.sections, ref] };
}
export function buildModeAwarePacket(role, opts) {
    let packet = buildRoleContextPacket(role, []);
    if (opts.profile) {
        packet = injectProjectProfile(packet, opts.profile);
    }
    if ((opts.mode === 'brownfield' || opts.mode === 'patch') && opts.asIsDocsPath) {
        const archPath = path.join(opts.asIsDocsPath, 'as-is', 'ARCHITECTURE.md');
        const convPath = path.join(opts.asIsDocsPath, 'as-is', 'CONVENTIONS.md');
        const asIsSections = [];
        try {
            const content = fs.readFileSync(archPath, 'utf8');
            asIsSections.push({
                name: 'as-is/ARCHITECTURE.md', ref: archPath, text: content,
                priority: 1, tokenCount: Math.ceil(content.length / 4),
            });
        }
        catch (_e) { /* skip gracefully if file absent */ }
        try {
            const content = fs.readFileSync(convPath, 'utf8');
            asIsSections.push({
                name: 'as-is/CONVENTIONS.md', ref: convPath, text: content,
                priority: 1, tokenCount: Math.ceil(content.length / 4),
            });
        }
        catch (_e) { /* skip gracefully if file absent */ }
        packet = { ...packet, sections: [...packet.sections, ...asIsSections] };
    }
    if (opts.mode === 'patch' && opts.impactedFiles && opts.impactedFiles.length > 0) {
        const summary = opts.impactedFiles.join(', ');
        packet = {
            ...packet,
            sections: [...packet.sections, {
                    name: 'impact-set', ref: 'codegraph-impact',
                    text: `Impacted files: ${summary}`,
                    priority: 2, tokenCount: Math.ceil(summary.length / 4),
                }],
        };
    }
    return packet;
}
export function assertDocWriteSafe(outputPath, allowedWriteSet) {
    const norm = (g) => g.replace(/\*+$/, '');
    const safe = allowedWriteSet.some(g => outputPath.startsWith(norm(g)));
    if (!safe) {
        throw new Error('doc_write_blocked: path not in write-set');
    }
}
// ── STORY-022.3: role-scoped context profile for Reviewer ────────────────────
export const REVIEWER_DENIED_SECTIONS = [
    'implementation_history',
    'agent_reasoning',
    'rejected_approach_rationale',
];
export function buildReviewerContextPacket(input) {
    const sections = [];
    sections.push({
        name: 'failing_test_output',
        ref: `story:${input.story_id}:failing_test_output`,
        text: input.failing_test_output,
        tokenCount: Math.ceil(input.failing_test_output.length / 4),
        priority: 3,
    });
    sections.push({
        name: 'acceptance_criteria',
        ref: `story:${input.story_id}:acceptance_criteria`,
        text: input.acceptance_criteria,
        tokenCount: Math.ceil(input.acceptance_criteria.length / 4),
        priority: 3,
    });
    sections.push({
        name: 'diff_under_review',
        ref: `story:${input.story_id}:diff_under_review`,
        text: input.diff_under_review,
        tokenCount: Math.ceil(input.diff_under_review.length / 4),
        priority: 3,
    });
    const geneText = input.matching_genes.map(g => g.matching_signal).join('\n');
    sections.push({
        name: 'gene_signals',
        ref: `story:${input.story_id}:gene_signals`,
        text: geneText,
        tokenCount: Math.ceil(geneText.length / 4),
        priority: 3,
    });
    if (input.story_objective !== undefined) {
        sections.push({
            name: 'story_objective',
            ref: `story:${input.story_id}:story_objective`,
            text: input.story_objective,
            tokenCount: Math.ceil(input.story_objective.length / 4),
            priority: 3,
        });
    }
    if (input.allowed_write_set !== undefined && input.allowed_write_set.length > 0) {
        const wsText = `FOR SCOPE REFERENCE ONLY — reviewer holds no write-set\n${input.allowed_write_set.join('\n')}`;
        sections.push({
            name: 'write_set_scope',
            ref: `story:${input.story_id}:write_set_scope`,
            text: wsText,
            tokenCount: Math.ceil(wsText.length / 4),
            priority: 3,
        });
    }
    return { role: 'reviewer', sections, excluded: [] };
}
export function assertReviewerContextClean(packet) {
    const denied = new Set(REVIEWER_DENIED_SECTIONS);
    return packet.sections.filter(s => denied.has(s.name)).map(s => s.name);
}
/**
 * Select registered skills for the role, sort by dependency order, read content,
 * and inject as ArtifactRef sections into the packet — within the token budget.
 * Quarantined skills are excluded from loading but their AVOID lines are still injected.
 */
export async function injectSkillsIntoPacket(packet, opts) {
    const budget = opts.budgetTokens ?? DEFAULT_CONFIG.budgets[opts.role];
    // Registered skills for this role, in dependency order
    const selected = selectSkillsForRole(opts.manifests, opts.role);
    const ordered = sortByDependencyOrder(selected);
    const skillRefs = [];
    const avoidRefs = [];
    for (const skill of ordered) {
        const content = readSkillContent(skill, opts.skillsRoot);
        const tokenCount = content.token_estimate;
        skillRefs.push({
            name: `skill_${skill.skill_id}`,
            ref: skill.skill_id,
            text: content.skill_md,
            tokenCount,
            priority: 3,
        });
        if (content.avoid_lines.length > 0) {
            const avoidText = content.avoid_lines.join('\n');
            avoidRefs.push({
                name: `skill_avoid_${skill.skill_id}`,
                ref: `${skill.skill_id}_avoid`,
                text: avoidText,
                tokenCount: Math.ceil(avoidText.length / 4),
                priority: 1,
            });
        }
    }
    // Quarantined skills: inject their AVOID lines only (as warnings)
    const quarantined = opts.manifests.filter(m => m.agent_role === opts.role && m.status === 'quarantined');
    for (const skill of quarantined) {
        const content = readSkillContent(skill, opts.skillsRoot);
        if (content.avoid_lines.length > 0) {
            const avoidText = content.avoid_lines.join('\n');
            avoidRefs.push({
                name: `skill_avoid_${skill.skill_id}`,
                ref: `${skill.skill_id}_avoid`,
                text: avoidText,
                tokenCount: Math.ceil(avoidText.length / 4),
                priority: 1,
            });
        }
    }
    // Apply token budget to skill sections (avoid refs are priority 1 — always kept)
    const { kept, deferred } = enforceTokenBudgetByArtifactSelection(skillRefs, budget);
    return {
        ...packet,
        sections: [...packet.sections, ...avoidRefs, ...kept],
        excluded: [...packet.excluded, ...deferred],
    };
}
// ── STORY-023.4: Developer own-story compacted summary ───────────────────────
const DENIED_CONTENT_PATTERNS = [
    /agent[_\s]reasoning/i,
    /implementation[_\s]history/i,
    /rejected[_\s]approach[_\s]rationale/i,
];
export function injectOwnPreviousStorySummary(packet, opts) {
    if (opts.role !== 'developer')
        return packet;
    const floor = opts.summaryFloor ?? 0.3;
    const filteredTurns = opts.previousStory.window.turns.filter(t => !DENIED_CONTENT_PATTERNS.some(p => p.test(t.content)));
    const filteredWindow = {
        turns: filteredTurns,
        totalTokens: filteredTurns.reduce((s, t) => s + t.tokenCount, 0),
    };
    const compactCfg = {
        ...DEFAULT_CONFIG,
        level1NodeTokenThreshold: 0,
        level2ChainTokenThreshold: Number.MAX_SAFE_INTEGER,
        keepFirstTurns: 0,
        keepLastTurns: 0,
        compressionRateFloor: floor,
        slidingWindowMaxTurns: Number.MAX_SAFE_INTEGER,
    };
    const compacted = compactContextWindow(filteredWindow, compactCfg);
    const text = compacted.turns.map(t => t.content).join(' ');
    const ref = {
        name: 'own_previous_story_summary',
        ref: opts.previousStory.story_id,
        text,
        tokenCount: Math.ceil(text.length / 4),
        priority: 2,
    };
    return { ...packet, sections: [...packet.sections, ref] };
}
//# sourceMappingURL=index.js.map