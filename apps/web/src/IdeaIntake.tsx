import { useState } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
const dim  = { color: 'rgba(230,237,243,.34)' } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AmbiguityQuestion {
  id: string;
  text: string;
  type: 'text' | 'choice';
  options?: string[];
  required: boolean;
}

// ── Input sanitization ────────────────────────────────────────────────────────

function sanitize(value: string): string {
  return value.replace(/[<>&]/g, '');
}

// ── IdeaForm ──────────────────────────────────────────────────────────────────

export interface IdeaFormProps {
  onSubmit: (idea: { title: string; description: string }) => void;
}

export function IdeaForm({ onSubmit }: IdeaFormProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const canSubmit = title.trim().length > 0 && description.trim().length > 0;

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

  return (
    <div style={{ maxWidth: 560 }}>
      <input
        type="text"
        placeholder="Title"
        maxLength={100}
        value={title}
        onChange={e => setTitle(e.target.value)}
        style={baseInput}
      />
      <textarea
        placeholder="Description"
        maxLength={2000}
        value={description}
        onChange={e => setDescription(e.target.value)}
        rows={4}
        style={{ ...baseInput, resize: 'vertical', fontFamily: 'inherit' }}
      />
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit({ title: sanitize(title), description: sanitize(description) })}
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
        Submit
      </button>
    </div>
  );
}

// ── AmbiguityQA ───────────────────────────────────────────────────────────────

export interface AmbiguityQAProps {
  questions: AmbiguityQuestion[];
  onSubmitAnswers: (answers: Record<string, string>) => void;
}

export function AmbiguityQA({ questions, onSubmitAnswers }: AmbiguityQAProps): JSX.Element {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const allRequiredAnswered = questions
    .filter(q => q.required)
    .every(q => (answers[q.id] ?? '').trim().length > 0);

  function setAnswer(id: string, value: string) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  return (
    <div style={{ maxWidth: 560 }}>
      {questions.map(q => (
        <div key={q.id} style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 6px', fontSize: 13 }}>{q.text}</p>
          {q.type === 'text' && (
            <input
              type="text"
              value={answers[q.id] ?? ''}
              onChange={e => setAnswer(q.id, e.target.value)}
              style={{
                width: '100%',
                background: '#0E1620',
                border: '1px solid rgba(230,237,243,.18)',
                borderRadius: 6,
                color: '#E6EDF3',
                padding: '7px 10px',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          )}
          {q.type === 'choice' && (q.options ?? []).map(opt => (
            <label
              key={opt}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 13, cursor: 'pointer' }}
            >
              <input
                type="radio"
                name={q.id}
                value={opt}
                checked={(answers[q.id] ?? '') === opt}
                onChange={() => setAnswer(q.id, opt)}
              />
              {opt}
            </label>
          ))}
        </div>
      ))}
      <button
        type="button"
        disabled={!allRequiredAnswered}
        onClick={() => onSubmitAnswers(answers)}
        style={{
          background: allRequiredAnswered ? '#5BD6C0' : 'rgba(91,214,192,.2)',
          color: allRequiredAnswered ? '#0E1620' : 'rgba(230,237,243,.4)',
          border: 'none',
          borderRadius: 6,
          padding: '7px 20px',
          ...mono,
          fontSize: 12,
          cursor: allRequiredAnswered ? 'pointer' : 'default',
        }}
      >
        Submit answers
      </button>
    </div>
  );
}

// ── IdeaIntake composite ──────────────────────────────────────────────────────

export type IntakePhase = 'idea' | 'questions' | 'submitted';

export interface IdeaIntakeProps {
  questions?: AmbiguityQuestion[];
  onIdeaSubmit: (idea: { title: string; description: string }) => void;
  onAnswersSubmit?: (answers: Record<string, string>) => void;
}

export function IdeaIntake({ questions, onIdeaSubmit, onAnswersSubmit }: IdeaIntakeProps): JSX.Element {
  const [phase, setPhase] = useState<IntakePhase>('idea');

  function handleIdeaSubmit(idea: { title: string; description: string }) {
    onIdeaSubmit(idea);
    if (questions && questions.length > 0) {
      setPhase('questions');
    } else {
      setPhase('submitted');
    }
  }

  function handleAnswersSubmit(ans: Record<string, string>) {
    onAnswersSubmit?.(ans);
    setPhase('submitted');
  }

  return (
    <div>
      {phase === 'idea' && <IdeaForm onSubmit={handleIdeaSubmit} />}
      {phase === 'questions' && questions && (
        <AmbiguityQA questions={questions} onSubmitAnswers={handleAnswersSubmit} />
      )}
      {phase === 'submitted' && (
        <p style={{ fontSize: 13, color: '#7EE081' }}>
          Submitted — bundle generation unblocked.
        </p>
      )}
    </div>
  );
}
