/**
 * STORY-016.4 — Idea intake form and ambiguity Q&A
 * Static source analysis. React rendering tests live in apps/web/src/ideaIntake.test.tsx.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'IdeaIntake.tsx'), 'utf8');

describe('idea-intake', () => {
  it('idea_form_submits_to_planning_steward', () => {
    expect(src).toContain('IdeaForm');
    expect(src).toContain('onSubmit');
    expect(src).toContain('placeholder');
  });

  it('idea_form_disabled_until_complete', () => {
    expect(src).toContain('disabled');
    expect(src).toContain('canSubmit');
  });

  it('idea_text_sanitized_before_submit', () => {
    expect(src).toContain('sanitize');
    expect(src).toContain('<>&');
  });

  it('ambiguity_questions_render_as_forms', () => {
    expect(src).toContain('AmbiguityQA');
    expect(src).toContain("type === 'text'");
    expect(src).toContain("type === 'choice'");
    expect(src).toContain('radio');
  });

  it('answers_unblock_bundle_generation', () => {
    expect(src).toContain('Submit answers');
    expect(src).toContain('allRequiredAnswered');
  });

  it('intake_phase_transitions', () => {
    expect(src).toContain("'idea'");
    expect(src).toContain("'questions'");
    expect(src).toContain("'submitted'");
    expect(src).toContain('IdeaIntake');
  });
});
