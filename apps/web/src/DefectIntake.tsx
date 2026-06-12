import { useState } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

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

export interface DefectFormProps {
  onSubmit: (report: Omit<DefectReport, 'report_id' | 'reported_at'>) => void;
}

function sanitizeDefectText(text: string): string {
  return text
    .replace(/SYSTEM:|USER:|ASSISTANT:|<\|im_start\|>/gi, '')
    .replace(/[<>&]/g, '');
}

export function DefectForm({ onSubmit }: DefectFormProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [whatBroke, setWhatBroke] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [artifactVersion, setArtifactVersion] = useState('');
  const [severity, setSeverity] = useState<'critical' | 'high' | 'medium' | 'low' | ''>('');
  const [reproSteps, setReproSteps] = useState('');

  const canSubmit = Boolean(
    title.trim() && whatBroke.trim() && expected.trim() && actual.trim() && artifactVersion.trim()
  );

  const baseInput: React.CSSProperties = {
    width: '100%',
    background: '#0E1620',
    border: '1px solid rgba(230,237,243,.18)',
    borderRadius: 6,
    color: '#E6EDF3',
    padding: '7px 10px',
    fontSize: 13,
    boxSizing: 'border-box',
    marginBottom: 10,
  };

  function handleSubmit() {
    onSubmit({
      title: sanitizeDefectText(title),
      what_broke: sanitizeDefectText(whatBroke),
      expected_behaviour: sanitizeDefectText(expected),
      actual_behaviour: sanitizeDefectText(actual),
      artifact_version: sanitizeDefectText(artifactVersion),
      severity: (severity as 'critical' | 'high' | 'medium' | 'low') || null,
      reproduction_steps: reproSteps ? sanitizeDefectText(reproSteps) : null,
    });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <input
        type="text"
        placeholder="Title"
        maxLength={120}
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={baseInput}
      />
      <textarea
        placeholder="What broke"
        maxLength={2000}
        value={whatBroke}
        onChange={e => setWhatBroke(e.target.value)}
        rows={3}
        style={{ ...baseInput, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <textarea
        placeholder="Expected behaviour"
        maxLength={2000}
        value={expected}
        onChange={e => setExpected(e.target.value)}
        rows={3}
        style={{ ...baseInput, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <textarea
        placeholder="Actual behaviour"
        maxLength={2000}
        value={actual}
        onChange={e => setActual(e.target.value)}
        rows={3}
        style={{ ...baseInput, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <input
        type="text"
        placeholder="Artifact version"
        value={artifactVersion}
        onChange={e => setArtifactVersion(e.target.value)}
        style={baseInput}
      />
      <select
        value={severity}
        onChange={e => setSeverity(e.target.value as typeof severity)}
        style={{ ...baseInput, cursor: 'pointer' }}
      >
        <option value="">Severity (optional)</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <textarea
        placeholder="Reproduction steps (optional)"
        maxLength={5000}
        value={reproSteps}
        onChange={e => setReproSteps(e.target.value)}
        rows={4}
        style={{ ...baseInput, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <button
        type="button"
        disabled={!canSubmit}
        onClick={handleSubmit}
        style={{
          background: canSubmit ? '#5BD6C0' : 'rgba(91,214,192,.2)',
          color: canSubmit ? '#0E1620' : 'rgba(230,237,243,.4)',
          border: 'none',
          borderRadius: 6,
          padding: '7px 20px',
          ...mono,
          fontSize: 12,
          cursor: canSubmit ? 'pointer' : 'default',
        }}
      >
        Report
      </button>
    </div>
  );
}
