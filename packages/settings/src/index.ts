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

export interface HarnessSettings {
  target?:       TargetSettings;
  model?:        ModelSettings;
  parallelism?:  ParallelismSettings;
  quality_bar?:  QualityBarSettings;
  budget?:       BudgetSettings;
  delivery?:     DeliverySettings;
  failure_bank?: FailureBankSettings;
  brownfield?:   BrownfieldSettings;
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

const ALLOWED_NESTED: Record<string, Set<string>> = {
  target:       new Set(['project_type', 'stack']),
  model:        new Set(['real_provider_scope']),
  parallelism:  new Set(['max_parallel_stories', 'enable_competitive_debug']),
  quality_bar:  new Set(['greenfield', 'brownfield_strictness']),
  budget:       new Set(['max_calls_per_story', 'max_tokens_per_story', 'max_calls_per_run']),
  delivery:     new Set(['promotion_target', 'human_gate_interface']),
  failure_bank: new Set(['scope']),
  brownfield:   new Set(['recovery_depth']),
};

type EnumMap = Record<string, readonly string[]>;

const ENUM_VALUES: Record<string, EnumMap> = {
  target:       { project_type: ['greenfield', 'brownfield', 'patch'], stack: ['node-ts', 'python', 'go', 'rust', 'unknown'] },
  model:        { real_provider_scope: ['none', 'hybrid', 'all'] },
  quality_bar:  { brownfield_strictness: ['zero_new_failures', 'full_bar'] },
  delivery:     { promotion_target: ['local_stable', 'git_remote', 'artifact_registry'], human_gate_interface: ['cli', 'web', 'none'] },
  failure_bank: { scope: ['project', 'global'] },
  brownfield:   { recovery_depth: ['shallow', 'full'] },
};

const INT_RANGES: Record<string, Record<string, [number, number]>> = {
  parallelism: { max_parallel_stories: [1, 8] },
  budget: {
    max_calls_per_story:  [1, 200],
    max_tokens_per_story: [1000, 2_000_000],
    max_calls_per_run:    [1, 5000],
  },
};

export function isGlobalGateKey(key: string): boolean {
  return GLOBAL_GATE_KEYS.has(key);
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

      if (key === 'enable_competitive_debug') {
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
