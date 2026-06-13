import React, { useState } from 'react';

export type InputOwner = 'supervisor' | 'planning_steward';

export interface NewStoryCard {
  story_id: string;
  title: string;
}

export interface ConsoleInputProps {
  currentOwner: InputOwner;
  ambiguityQuestions?: string[];
  newStories?: NewStoryCard[];
  onSubmit: (text: string, owner: InputOwner) => void;
  onAmbiguityAnswer?: (answers: Record<string, string>) => void;
}

const OWNER_COLOR: Record<InputOwner, string> = {
  supervisor:       'var(--role-supervisor)',
  planning_steward: 'var(--role-developer)',
};

const OWNER_LABEL: Record<InputOwner, string> = {
  supervisor:       '[Supervisor]',
  planning_steward: '[Planning Steward]',
};

const mono: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
};

export function ConsoleInput({
  currentOwner,
  ambiguityQuestions = [],
  newStories = [],
  onSubmit,
  onAmbiguityAnswer,
}: ConsoleInputProps): JSX.Element {
  const [text, setText] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const accentColor = OWNER_COLOR[currentOwner];

  function handleSubmit() {
    if (text.trim() === '') return;
    onSubmit(text, currentOwner);
    setText('');
    if (ambiguityQuestions.length > 0 && onAmbiguityAnswer) {
      onAmbiguityAnswer(answers);
    }
  }

  function handleAnswerChange(question: string, value: string) {
    const next = { ...answers, [question]: value };
    setAnswers(next);
  }

  return (
    <div
      data-testid="console-input"
      data-owner={currentOwner}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px 10px',
        borderTop: `2px solid ${accentColor}`,
        background: '#0E1620',
        ...mono,
        fontSize: 12,
      }}
    >
      {/* Ambiguity Q&A rows */}
      {ambiguityQuestions.map(q => (
        <div key={q} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label style={{ color: accentColor, fontSize: 11 }}>{q}</label>
          <input
            style={{
              background: 'rgba(255,255,255,.06)',
              border: `1px solid ${accentColor}`,
              borderRadius: 3,
              color: '#E6EDF3',
              padding: '3px 6px',
              fontSize: 12,
              ...mono,
            }}
            value={answers[q] ?? ''}
            onChange={e => handleAnswerChange(q, e.target.value)}
            placeholder="Answer…"
          />
        </div>
      ))}

      {/* New story summary cards */}
      {newStories.map(card => (
        <div
          key={card.story_id}
          style={{
            border: `1px solid ${accentColor}`,
            borderRadius: 4,
            padding: '4px 8px',
            color: '#E6EDF3',
            fontSize: 11,
          }}
        >
          <span style={{ color: accentColor, fontWeight: 700 }}>{card.story_id}</span>
          {' — '}
          {card.title}
        </div>
      ))}

      {/* Badge + main input row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            color: accentColor,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            fontSize: 11,
          }}
        >
          {OWNER_LABEL[currentOwner]}
        </span>
        <input
          style={{
            flex: 1,
            background: 'rgba(255,255,255,.06)',
            border: `1px solid ${accentColor}`,
            borderRadius: 3,
            color: '#E6EDF3',
            padding: '4px 8px',
            fontSize: 12,
            ...mono,
            outline: 'none',
          }}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Type a message…"
        />
        <button
          onClick={handleSubmit}
          style={{
            background: accentColor,
            border: 'none',
            borderRadius: 3,
            color: '#0E1620',
            padding: '4px 12px',
            fontWeight: 700,
            cursor: 'pointer',
            ...mono,
            fontSize: 12,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
