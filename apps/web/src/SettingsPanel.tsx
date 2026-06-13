import { useState } from 'react';
import type { HarnessSettings } from '@codeharness/settings';

export type SettingsLayer = 'default' | 'workspace' | 'story';

export interface EffectiveSetting {
  key: string;
  value: unknown;
  layer: SettingsLayer;
  schema?: {
    type?: string;
    enum?: unknown[];
    minimum?: number;
    maximum?: number;
    description?: string;
  };
}

export interface SettingsPanelProps {
  effectiveSettings: HarnessSettings;
  defaultSettings: HarnessSettings;
  workspaceSettings?: Partial<HarnessSettings>;
  onSave?: (updated: Partial<HarnessSettings>) => void;
  readOnly?: boolean;
}

const GLOBAL_GATES = [
  'real_api_calls',
  'sudo_broker_runtime',
  'bypass_workspace_runtime',
  'stable_promotion',
];

interface FieldSchema {
  type: 'enum' | 'number' | 'boolean' | 'array';
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

const SCHEMA: Record<string, FieldSchema> = {
  'target.project_type':                 { type: 'enum', enum: ['greenfield', 'brownfield', 'patch'] },
  'target.stack':                         { type: 'enum', enum: ['node-ts', 'python', 'go', 'rust', 'unknown'] },
  'model.real_provider_scope':            { type: 'enum', enum: ['none', 'hybrid', 'all'] },
  'parallelism.max_parallel_stories':     { type: 'number', minimum: 1, maximum: 8 },
  'parallelism.enable_competitive_debug': { type: 'boolean' },
  'quality_bar.greenfield':               { type: 'array' },
  'quality_bar.brownfield_strictness':    { type: 'enum', enum: ['zero_new_failures', 'full_bar'] },
  'budget.max_calls_per_story':           { type: 'number', minimum: 1, maximum: 200 },
  'budget.max_tokens_per_story':          { type: 'number', minimum: 1000, maximum: 2000000 },
  'budget.max_calls_per_run':             { type: 'number', minimum: 1, maximum: 5000 },
  'delivery.promotion_target':            { type: 'enum', enum: ['local_stable', 'git_remote', 'artifact_registry'] },
  'delivery.human_gate_interface':        { type: 'enum', enum: ['cli', 'web', 'none'] },
  'failure_bank.scope':                   { type: 'enum', enum: ['project', 'global'] },
  'brownfield.recovery_depth':            { type: 'enum', enum: ['shallow', 'full'] },
};

function getNestedValue(obj: Record<string, unknown>, section: string, field: string): unknown {
  const sectionVal = obj[section];
  if (!sectionVal || typeof sectionVal !== 'object') return undefined;
  return (sectionVal as Record<string, unknown>)[field];
}

function flattenSettings(settings: HarnessSettings): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [section, sectionVal] of Object.entries(settings)) {
    if (sectionVal && typeof sectionVal === 'object') {
      for (const [field, val] of Object.entries(sectionVal as object)) {
        result[`${section}.${field}`] = val;
      }
    }
  }
  return result;
}

export function determineLayer(
  key: string,
  effective: HarnessSettings,
  defaults: HarnessSettings,
  workspace?: Partial<HarnessSettings>
): SettingsLayer {
  const [section, field] = key.split('.');
  const effectiveVal = JSON.stringify(getNestedValue(effective as Record<string, unknown>, section, field));
  const defaultVal   = JSON.stringify(getNestedValue(defaults  as Record<string, unknown>, section, field));

  if (effectiveVal !== defaultVal) {
    const workspaceVal = workspace
      ? JSON.stringify(getNestedValue(workspace as Record<string, unknown>, section, field))
      : undefined;
    if (workspaceVal !== undefined && effectiveVal === workspaceVal) return 'workspace';
    return 'story';
  }
  return 'default';
}

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const { effectiveSettings, defaultSettings, workspaceSettings, onSave, readOnly } = props;
  const [edits, setEdits]   = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const effectiveFlat = flattenSettings(effectiveSettings);
  const currentValues: Record<string, unknown> = { ...effectiveFlat, ...edits };

  function handleChange(key: string, value: unknown): void {
    if (readOnly) return;
    const schema = SCHEMA[key];
    const newErrors = { ...errors };

    if (schema?.type === 'number') {
      const num = Number(value);
      if (schema.minimum !== undefined && num < schema.minimum) {
        newErrors[key] = `Must be at least ${schema.minimum}`;
      } else if (schema.maximum !== undefined && num > schema.maximum) {
        newErrors[key] = `Must be at most ${schema.maximum}`;
      } else {
        delete newErrors[key];
      }
    } else {
      delete newErrors[key];
    }

    setErrors(newErrors);
    setEdits(prev => ({ ...prev, [key]: value }));
  }

  const hasChanges = Object.keys(edits).some(
    k => JSON.stringify(edits[k]) !== JSON.stringify(effectiveFlat[k])
  );

  function handleSave(): void {
    if (!onSave || !hasChanges) return;
    const result: Record<string, Record<string, unknown>> = {};
    for (const [key, val] of Object.entries(edits)) {
      if (JSON.stringify(val) === JSON.stringify(effectiveFlat[key])) continue;
      const [section, field] = key.split('.');
      if (!result[section]) result[section] = {};
      result[section][field] = val;
    }
    onSave(result as Partial<HarnessSettings>);
  }

  const style = {
    panel:  { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, padding: 16 } as const,
    row:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } as const,
    label:  { minWidth: 280, opacity: 0.8 } as const,
    badge:  { fontSize: 10, opacity: 0.5, padding: '1px 5px', border: '1px solid rgba(230,237,243,.2)', borderRadius: 4 } as const,
    error:  { color: '#F2A65A', fontSize: 11, display: 'block' as const, marginTop: 2 },
    gateRow:{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 } as const,
  };

  return (
    <div data-testid="settings-panel" style={style.panel}>
      <h2 style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Harness Settings</h2>

      {Object.keys(SCHEMA).map(key => {
        const schema = SCHEMA[key];
        const value  = currentValues[key];
        const layer  = determineLayer(key, effectiveSettings, defaultSettings, workspaceSettings);

        return (
          <div key={key} data-layer={layer} style={{ marginBottom: 10 }}>
            <div style={style.row}>
              <span style={style.label}>{key}</span>
              <span data-badge="layer" style={style.badge}>{layer}</span>

              {schema.type === 'enum' && !readOnly ? (
                <select
                  data-setting-key={key}
                  value={String(value ?? '')}
                  onChange={e => handleChange(key, e.target.value)}
                >
                  {schema.enum?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : schema.type === 'number' && !readOnly ? (
                <input
                  type="number"
                  data-setting-key={key}
                  value={String(value ?? '')}
                  min={schema.minimum}
                  max={schema.maximum}
                  onChange={e => handleChange(key, e.target.value)}
                  style={errors[key] ? { borderColor: '#F2A65A' } : {}}
                />
              ) : schema.type === 'boolean' && !readOnly ? (
                <input
                  type="checkbox"
                  data-setting-key={key}
                  checked={Boolean(value)}
                  onChange={e => handleChange(key, e.target.checked)}
                />
              ) : (
                <span data-setting-key={key} style={{ opacity: 0.7 }}>
                  {Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '')}
                </span>
              )}
            </div>
            {errors[key] && (
              <span data-error={key} style={style.error}>{errors[key]}</span>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button
          type="button"
          disabled={!hasChanges || Object.keys(errors).length > 0}
          onClick={handleSave}
          style={{ marginTop: 12, padding: '4px 14px', cursor: hasChanges ? 'pointer' : 'default' }}
        >
          Save settings
        </button>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, opacity: 0.5 }}>
          Global gates — human-only
        </h3>
        {GLOBAL_GATES.map(gate => (
          <div key={gate} style={style.gateRow}>
            <span style={style.label}>{gate}</span>
            <span style={style.badge}>read-only: human gate</span>
          </div>
        ))}
      </div>
    </div>
  );
}
