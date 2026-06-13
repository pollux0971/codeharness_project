export const DEFAULT_SETTINGS = {
    target: { project_type: 'greenfield', stack: 'node-ts' },
    model: { real_provider_scope: 'none' },
    parallelism: { max_parallel_stories: 2, enable_competitive_debug: false },
    quality_bar: { greenfield: ['build', 'test', 'typecheck'], brownfield_strictness: 'zero_new_failures' },
    budget: { max_calls_per_story: 30, max_tokens_per_story: 400_000, max_calls_per_run: 1000 },
    delivery: { promotion_target: 'local_stable', human_gate_interface: 'cli' },
    failure_bank: { scope: 'project' },
    brownfield: { recovery_depth: 'shallow' },
};
const GLOBAL_GATE_KEYS = new Set([
    'real_api_calls',
    'sudo_broker_runtime',
    'bypass_workspace_runtime',
    'stable_promotion',
]);
const ALLOWED_TOP_LEVEL = new Set([
    'target', 'model', 'parallelism', 'quality_bar',
    'budget', 'delivery', 'failure_bank', 'brownfield',
]);
const ALLOWED_NESTED = {
    target: new Set(['project_type', 'stack']),
    model: new Set(['real_provider_scope']),
    parallelism: new Set(['max_parallel_stories', 'enable_competitive_debug']),
    quality_bar: new Set(['greenfield', 'brownfield_strictness']),
    budget: new Set(['max_calls_per_story', 'max_tokens_per_story', 'max_calls_per_run']),
    delivery: new Set(['promotion_target', 'human_gate_interface']),
    failure_bank: new Set(['scope']),
    brownfield: new Set(['recovery_depth']),
};
const ENUM_VALUES = {
    target: { project_type: ['greenfield', 'brownfield', 'patch'], stack: ['node-ts', 'python', 'go', 'rust', 'unknown'] },
    model: { real_provider_scope: ['none', 'hybrid', 'all'] },
    quality_bar: { brownfield_strictness: ['zero_new_failures', 'full_bar'] },
    delivery: { promotion_target: ['local_stable', 'git_remote', 'artifact_registry'], human_gate_interface: ['cli', 'web', 'none'] },
    failure_bank: { scope: ['project', 'global'] },
    brownfield: { recovery_depth: ['shallow', 'full'] },
};
const INT_RANGES = {
    parallelism: { max_parallel_stories: [1, 8] },
    budget: {
        max_calls_per_story: [1, 200],
        max_tokens_per_story: [1000, 2_000_000],
        max_calls_per_run: [1, 5000],
    },
};
export function isGlobalGateKey(key) {
    return GLOBAL_GATE_KEYS.has(key);
}
const TOP_LEVEL_SECTIONS = [
    'target', 'model', 'parallelism', 'quality_bar',
    'budget', 'delivery', 'failure_bank', 'brownfield',
];
/**
 * Resolves effective settings with three-layer precedence:
 * storyOverride > workspaceSettings > defaults
 * All inputs are pre-loaded (no file I/O here).
 * Throws if the resolved result fails validation.
 */
export function resolveSettings(defaults, workspaceSettings, storyOverride) {
    const resolved = { ...defaults };
    for (const section of TOP_LEVEL_SECTIONS) {
        const key = section;
        const ws = workspaceSettings?.[key];
        const so = storyOverride?.[key];
        if (ws !== undefined || so !== undefined) {
            resolved[key] = {
                ...(defaults[key] ?? {}),
                ...(ws ?? {}),
                ...(so ?? {}),
            };
        }
    }
    const result = validateSettings(resolved);
    if (!result.ok) {
        throw new Error(`settings_resolution_failed: ${result.errors.join('; ')}`);
    }
    return resolved;
}
// ── YAML loading ──────────────────────────────────────────────────────────────
import { parse as parseYaml } from 'yaml';
/**
 * Parse YAML text, validate against schema, and return typed settings.
 * Returns null if text is empty. Throws if the YAML is invalid.
 * Callers handle file I/O; this function only parses and validates.
 */
export function loadWorkspaceSettings(yamlText) {
    const trimmed = yamlText.trim();
    if (!trimmed)
        return null;
    const parsed = parseYaml(trimmed);
    if (parsed === null || parsed === undefined)
        return null;
    const result = validateSettings(parsed);
    if (!result.ok) {
        throw new Error(`invalid workspace settings: ${result.errors.join('; ')}`);
    }
    return parsed;
}
// ── .gitignore helper ─────────────────────────────────────────────────────────
/**
 * Returns lines to add to .gitignore to ensure workspace settings.yaml is ignored.
 * Pure function — callers handle writing the file.
 */
export function ensureGitignored(existingGitignore) {
    if (/(?:^|\n)settings\.yaml(?:\r?\n|$)/.test(existingGitignore)) {
        return existingGitignore;
    }
    return existingGitignore.endsWith('\n')
        ? existingGitignore + 'settings.yaml\n'
        : existingGitignore + '\nsettings.yaml\n';
}
export function validateSettings(settings) {
    const errors = [];
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
        return { ok: false, errors: ['settings must be a non-null object'] };
    }
    const obj = settings;
    for (const key of Object.keys(obj)) {
        if (GLOBAL_GATE_KEYS.has(key)) {
            errors.push(`"${key}" is a global gate and is not representable in settings`);
        }
        else if (!ALLOWED_TOP_LEVEL.has(key)) {
            errors.push(`unknown additional key: "${key}"`);
        }
    }
    if (errors.length > 0)
        return { ok: false, errors };
    for (const [section, allowed] of Object.entries(ALLOWED_NESTED)) {
        const sectionVal = obj[section];
        if (sectionVal === undefined)
            continue;
        if (typeof sectionVal !== 'object' || sectionVal === null || Array.isArray(sectionVal)) {
            errors.push(`"${section}" must be an object`);
            continue;
        }
        const sectionObj = sectionVal;
        for (const key of Object.keys(sectionObj)) {
            if (!allowed.has(key)) {
                errors.push(`unknown additional key: "${section}.${key}"`);
                continue;
            }
            const val = sectionObj[key];
            const enumVals = ENUM_VALUES[section]?.[key];
            if (enumVals !== undefined) {
                if (!enumVals.includes(val)) {
                    errors.push(`"${section}.${key}" must be one of [${enumVals.join(', ')}], got: ${JSON.stringify(val)}`);
                }
                continue;
            }
            const range = INT_RANGES[section]?.[key];
            if (range !== undefined) {
                const [min, max] = range;
                if (typeof val !== 'number' || !Number.isInteger(val) || val < min || val > max) {
                    errors.push(`"${section}.${key}" must be an integer between ${min} and ${max}, got: ${JSON.stringify(val)}`);
                }
                continue;
            }
            if (key === 'enable_competitive_debug') {
                if (typeof val !== 'boolean') {
                    errors.push(`"${section}.${key}" must be a boolean, got: ${JSON.stringify(val)}`);
                }
                continue;
            }
            if (key === 'greenfield') {
                if (!Array.isArray(val)) {
                    errors.push(`"${section}.${key}" must be an array`);
                }
                else {
                    const validItems = ['build', 'test', 'typecheck', 'coverage'];
                    for (const item of val) {
                        if (!validItems.includes(item)) {
                            errors.push(`"${section}.${key}" items must be one of [${validItems.join(', ')}], got: ${JSON.stringify(item)}`);
                        }
                    }
                }
            }
        }
    }
    return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
//# sourceMappingURL=index.js.map