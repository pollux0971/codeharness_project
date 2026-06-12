import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdeaForm, AmbiguityQA, IdeaIntake,
         type AmbiguityQuestion } from './IdeaIntake';

const textQ = (id: string, required = true): AmbiguityQuestion =>
  ({ id, text: `Question ${id}`, type: 'text', required });
const choiceQ = (id: string): AmbiguityQuestion =>
  ({ id, text: `Choose ${id}`, type: 'choice', options: ['A', 'B'], required: true });

describe('idea-intake', () => {
  it('idea_form_submits_to_planning_steward', () => {
    const onSubmit = vi.fn();
    render(<IdeaForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'My idea' } });
    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'Do the thing' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(onSubmit).toHaveBeenCalledWith({ title: 'My idea', description: 'Do the thing' });
  });

  it('idea_form_disabled_until_complete', () => {
    render(<IdeaForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'Title only' } });
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
  });

  it('idea_text_sanitized_before_submit', () => {
    const onSubmit = vi.fn();
    render(<IdeaForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByPlaceholderText(/title/i),
      { target: { value: '<script>alert(1)</script>' } });
    fireEvent.change(screen.getByPlaceholderText(/description/i),
      { target: { value: 'Safe description' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    const { title } = onSubmit.mock.calls[0][0];
    expect(title).not.toContain('<');
    expect(title).not.toContain('>');
  });

  it('ambiguity_questions_render_as_forms', () => {
    render(<AmbiguityQA questions={[textQ('q1'), choiceQ('q2')]} onSubmitAnswers={vi.fn()} />);
    expect(screen.getByText(/Question q1/)).toBeTruthy();
    expect(screen.getByText(/Choose q2/)).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'A' })).toBeTruthy();
  });

  it('answers_unblock_bundle_generation', () => {
    const onSubmit = vi.fn();
    render(<AmbiguityQA questions={[textQ('q1')]} onSubmitAnswers={onSubmit} />);
    const submitBtn = screen.getByRole('button', { name: /submit answers/i });
    expect(submitBtn).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my answer' } });
    expect(submitBtn).not.toBeDisabled();
  });

  it('intake_phase_transitions', () => {
    const questions = [textQ('q1')];
    render(<IdeaIntake questions={questions} onIdeaSubmit={vi.fn()} onAnswersSubmit={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/title/i), { target: { value: 'My idea' } });
    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'Desc' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByText(/Question q1/)).toBeTruthy();
  });
});
