import { useState } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

export interface OneTimeChoice {
  project_type: 'greenfield' | 'brownfield' | 'patch';
  stack:        'node-ts' | 'python' | 'go' | 'rust' | 'unknown';
}

export interface SetupWizardProps {
  onComplete:       (choices: OneTimeChoice) => void;
  locked?:          boolean;
  lockedValues?:    OneTimeChoice;
  onUnlockRequest?: () => void;
}

const baseSelect: React.CSSProperties = {
  background:   '#0E1620',
  border:       '1px solid rgba(230,237,243,.18)',
  borderRadius: 6,
  color:        '#E6EDF3',
  padding:      '6px 10px',
  fontSize:     13,
  marginBottom: 10,
  display:      'block',
  width:        '100%',
  boxSizing:    'border-box',
};

const badge: React.CSSProperties = {
  ...mono,
  fontSize:     11,
  background:   'rgba(91,214,192,.12)',
  color:        '#5BD6C0',
  border:       '1px solid rgba(91,214,192,.25)',
  borderRadius: 4,
  padding:      '2px 8px',
  marginRight:  8,
};

export function SetupWizard({ onComplete, locked, lockedValues, onUnlockRequest }: SetupWizardProps): JSX.Element {
  const [projectType, setProjectType] = useState<OneTimeChoice['project_type'] | ''>('');
  const [stack, setStack]             = useState<OneTimeChoice['stack'] | ''>('');

  const canSave = projectType !== '' && stack !== '';

  function handleUnlock(): void {
    const confirmed = window.confirm(
      'Changing project type or stack after the first checkpoint may affect in-progress stories. Confirm?'
    );
    if (confirmed) onUnlockRequest?.();
  }

  if (locked && lockedValues) {
    return (
      <div data-testid="setup-wizard" style={{ ...mono, fontSize: 13, padding: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={badge}>{lockedValues.project_type}</span>
          <span style={badge}>{lockedValues.stack}</span>
        </div>
        <button
          type="button"
          onClick={handleUnlock}
          style={{
            ...mono,
            fontSize:     12,
            background:   'rgba(230,237,243,.08)',
            border:       '1px solid rgba(230,237,243,.2)',
            borderRadius: 6,
            color:        '#E6EDF3',
            padding:      '5px 14px',
            cursor:       'pointer',
          }}
        >
          Change…
        </button>
      </div>
    );
  }

  return (
    <div data-testid="setup-wizard" style={{ ...mono, fontSize: 13, maxWidth: 420, padding: 16 }}>
      <label style={{ display: 'block', marginBottom: 4, opacity: 0.7, fontSize: 11 }}>
        Project type
      </label>
      <select
        data-testid="select-project-type"
        value={projectType}
        onChange={e => setProjectType(e.target.value as OneTimeChoice['project_type'])}
        style={baseSelect}
      >
        <option value="">— select —</option>
        <option value="greenfield">greenfield</option>
        <option value="brownfield">brownfield</option>
        <option value="patch">patch</option>
      </select>

      <label style={{ display: 'block', marginBottom: 4, opacity: 0.7, fontSize: 11 }}>
        Stack
      </label>
      <select
        data-testid="select-stack"
        value={stack}
        onChange={e => setStack(e.target.value as OneTimeChoice['stack'])}
        style={baseSelect}
      >
        <option value="">— select —</option>
        <option value="node-ts">node-ts</option>
        <option value="python">python</option>
        <option value="go">go</option>
        <option value="rust">rust</option>
        <option value="unknown">unknown</option>
      </select>

      <button
        type="button"
        disabled={!canSave}
        onClick={() => onComplete({ project_type: projectType as OneTimeChoice['project_type'], stack: stack as OneTimeChoice['stack'] })}
        style={{
          ...mono,
          fontSize:     12,
          background:   canSave ? '#5BD6C0' : 'rgba(91,214,192,.2)',
          color:        canSave ? '#0E1620' : 'rgba(230,237,243,.4)',
          border:       'none',
          borderRadius: 6,
          padding:      '7px 20px',
          cursor:       canSave ? 'pointer' : 'default',
          marginTop:    6,
        }}
      >
        Save choices
      </button>
    </div>
  );
}
