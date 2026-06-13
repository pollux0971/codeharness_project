export interface TargetSettings {
  project_type?: 'greenfield' | 'brownfield' | 'patch';
  stack?: 'node-ts' | 'python' | 'go' | 'rust' | 'unknown';
}
export interface ModelSettings {
  real_provider_scope?: 'none' | 'hybrid' | 'all';
}
export interface ParallelismSettings {
  max_parallel_stories?: number;
  enable_competitive_debug?: boolean;
}
export interface QualityBarSettings {
  greenfield?: ('build' | 'test' | 'typecheck' | 'coverage')[];
  brownfield_strictness?: 'zero_new_failures' | 'full_bar';
}
export interface BudgetSettings {
  max_calls_per_story?: number;
  max_tokens_per_story?: number;
  max_calls_per_run?: number;
}
export interface DeliverySettings {
  promotion_target?: 'local_stable' | 'git_remote' | 'artifact_registry';
  human_gate_interface?: 'cli' | 'web' | 'none';
}
export interface FailureBankSettings { scope?: 'project' | 'global'; }
export interface BrownfieldSettings  { recovery_depth?: 'shallow' | 'full'; }
export interface ReviewSettings {
  trigger?:        'on_second_failure' | 'on_every_failure' | 'off' | 'on_cycle_complete';
  cross_model?:    boolean;
  max_directions?: number;
}

export interface HarnessSettings {
  target?:       TargetSettings;
  model?:        ModelSettings;
  parallelism?:  ParallelismSettings;
  quality_bar?:  QualityBarSettings;
  budget?:       BudgetSettings;
  delivery?:     DeliverySettings;
  failure_bank?: FailureBankSettings;
  brownfield?:   BrownfieldSettings;
  review?:       ReviewSettings;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export const DEFAULT_SETTINGS: HarnessSettings = {
  target:       { project_type: 'greenfield', stack: 'node-ts' },
  model:        { real_provider_scope: 'none' },
  parallelism:  { max_parallel_stories: 2, enable_competitive_debug: false },
  quality_bar:  { greenfield: ['build', 'test', 'typecheck'], brownfield_strictness: 'zero_new_failures' },
  budget:       { max_calls_per_story: 30, max_tokens_per_story: 400_000, max_calls_per_run: 1000 },
  delivery:     { promotion_target: 'local_stable', human_gate_interface: 'cli' },
  failure_bank: { scope: 'project' },
  brownfield:   { recovery_depth: 'shallow' },
  review:       { trigger: 'on_second_failure', cross_model: false, max_directions: 2 },
};

const GLOBAL_GATE_KEYS = new Set([
  'real_api_calls',
  'sudo_broker_runtime',
  'bypass_workspace_runtime',
  'stable_promotion',
]);

const ALLOWED_TOP_LEVEL = new Set([
  'target', 'model', 'parallelism', 'quality_bar',
  'budget', 'delivery', 'failure_bank', 'brownfield', 'review',
]);

const ALLOWED_NESTED: Record<string, Set<string>> = {
  target:       new Set(['project_type', 'stack']),
  model:        new Set(['real_provider_scope']),
  parallelism:  new Set(['max_parallel_stories', 'enable_competitive_debug']),
  quality_bar:  new Set(['greenfield', 'brownfield_strictness']),
  budget:       new Set(['max_calls_per_story', 'max_tokens_per_story', 'max_calls_per_run']),
  delivery:     new Set(['promotion_target', 'human_gate_interface']),
  failure_bank: new Set(['scope']),
  brownfield:   new Set(['recovery_depth']),
  review:       new Set(['trigger', 'cross_model', 'max_directions']),
};

type EnumMap = Record<string, readonly string[]>;

const ENUM_VALUES: Record<string, EnumMap> = {
  target:       { project_type: ['greenfield', 'brownfield', 'patch'], stack: ['node-ts', 'python', 'go', 'rust', 'unknown'] },
  model:        { real_provider_scope: ['none', 'hybrid', 'all'] },
  quality_bar:  { brownfield_strictness: ['zero_new_failures', 'full_bar'] },
  delivery:     { promotion_target: ['local_stable', 'git_remote', 'artifact_registry'], human_gate_interface: ['cli', 'web', 'none'] },
  failure_bank: { scope: ['project', 'global'] },
  brownfield:   { recovery_depth: ['shallow', 'full'] },
  review:       { trigger: ['on_second_failure', 'on_every_failure', 'off', 'on_cycle_complete'] },
};

const INT_RANGES: Record<string, Record<string, [number, number]>> = {
  parallelism: { max_parallel_stories: [1, 8] },
  budget: {
    max_calls_per_story:  [1, 200],
    max_tokens_per_story: [1000, 2_000_000],
    max_calls_per_run:    [1, 5000],
  },
  review: { max_directions: [1, 5] },
};

export function isGlobalGateKey(key: string): boolean {
  return GLOBAL_GATE_KEYS.has(key);
}

// ── Precedence resolution ─────────────────────────────────────────────────────

export type SettingsOverride = Partial<HarnessSettings>;

const TOP_LEVEL_SECTIONS = [
  'target', 'model', 'parallelism', 'quality_bar',
  'budget', 'delivery', 'failure_bank', 'brownfield', 'review',
] as const;

type SectionKey = typeof TOP_LEVEL_SECTIONS[number];

/**
 * Resolves effective settings with three-layer precedence:
 * storyOverride > workspaceSettings > defaults
 * All inputs are pre-loaded (no file I/O here).
 * Throws if the resolved result fails validation.
 */
export function resolveSettings(
  defaults: HarnessSettings,
  workspaceSettings?: SettingsOverride,
  storyOverride?: SettingsOverride
): HarnessSettings {
  const resolved: HarnessSettings = { ...defaults };

  for (const section of TOP_LEVEL_SECTIONS) {
    const key = section as SectionKey;
    const ws = workspaceSettings?.[key];
    const so = storyOverride?.[key];
    if (ws !== undefined || so !== undefined) {
      resolved[key] = {
        ...(defaults[key] as object ?? {}),
        ...(ws as object ?? {}),
        ...(so as object ?? {}),
      } as HarnessSettings[typeof key];
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
export function loadWorkspaceSettings(yamlText: string): HarnessSettings | null {
  const trimmed = yamlText.trim();
  if (!trimmed) return null;

  const parsed = parseYaml(trimmed) as unknown;
  if (parsed === null || parsed === undefined) return null;

  const result = validateSettings(parsed);
  if (!result.ok) {
    throw new Error(`invalid workspace settings: ${result.errors.join('; ')}`);
  }

  return parsed as HarnessSettings;
}

// ── .gitignore helper ─────────────────────────────────────────────────────────

/**
 * Returns lines to add to .gitignore to ensure workspace settings.yaml is ignored.
 * Pure function — callers handle writing the file.
 */
export function ensureGitignored(existingGitignore: string): string {
  if (/(?:^|\n)settings\.yaml(?:\r?\n|$)/.test(existingGitignore)) {
    return existingGitignore;
  }
  return existingGitignore.endsWith('\n')
    ? existingGitignore + 'settings.yaml\n'
    : existingGitignore + '\nsettings.yaml\n';
}

export function validateSettings(settings: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
    return { ok: false, errors: ['settings must be a non-null object'] };
  }

  const obj = settings as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (GLOBAL_GATE_KEYS.has(key)) {
      errors.push(`"${key}" is a global gate and is not representable in settings`);
    } else if (!ALLOWED_TOP_LEVEL.has(key)) {
      errors.push(`unknown additional key: "${key}"`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  for (const [section, allowed] of Object.entries(ALLOWED_NESTED)) {
    const sectionVal = obj[section];
    if (sectionVal === undefined) continue;

    if (typeof sectionVal !== 'object' || sectionVal === null || Array.isArray(sectionVal)) {
      errors.push(`"${section}" must be an object`);
      continue;
    }

    const sectionObj = sectionVal as Record<string, unknown>;

    for (const key of Object.keys(sectionObj)) {
      if (!allowed.has(key)) {
        errors.push(`unknown additional key: "${section}.${key}"`);
        continue;
      }

      const val = sectionObj[key];
      const enumVals = ENUM_VALUES[section]?.[key];
      if (enumVals !== undefined) {
        if (!enumVals.includes(val as string)) {
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

      if (key === 'enable_competitive_debug' || key === 'cross_model') {
        if (typeof val !== 'boolean') {
          errors.push(`"${section}.${key}" must be a boolean, got: ${JSON.stringify(val)}`);
        }
        continue;
      }

      if (key === 'greenfield') {
        if (!Array.isArray(val)) {
          errors.push(`"${section}.${key}" must be an array`);
        } else {
          const validItems = ['build', 'test', 'typecheck', 'coverage'];
          for (const item of val) {
            if (!validItems.includes(item as string)) {
              errors.push(`"${section}.${key}" items must be one of [${validItems.join(', ')}], got: ${JSON.stringify(item)}`);
            }
          }
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true, errors: [] } : { ok: false, errors };
}
