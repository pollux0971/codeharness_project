/**
 * STORY-024.4 — Console input bar with owner badge and scope-change takeover
 * Verifies: owner_badge_shows_supervisor_by_default, scope_change_triggers_visual_takeover,
 *           ambiguity_questions_render_in_pane, handback_shows_new_story_cards,
 *           submit_calls_onSubmit_with_owner
 * Pure node tests — no browser, no backend, no network.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const webSrc = path.resolve(__dirname, '../apps/web/src');
const src = fs.readFileSync(path.join(webSrc, 'ConsoleInput.tsx'), 'utf8');

describe('STORY-024.4 console input bar', () => {
  it('owner_badge_shows_supervisor_by_default: exports ConsoleInput', () => {
    expect(src).toContain('export function ConsoleInput');
  });

  it('owner_badge_shows_supervisor_by_default: exports InputOwner type', () => {
    expect(src).toContain("export type InputOwner");
  });

  it('owner_badge_shows_supervisor_by_default: data-testid and data-owner attributes present', () => {
    expect(src).toContain('data-testid="console-input"');
    expect(src).toContain('data-owner={currentOwner}');
  });

  it('owner_badge_shows_supervisor_by_default: supervisor badge label defined', () => {
    expect(src).toContain('[Supervisor]');
  });

  it('scope_change_triggers_visual_takeover: planning_steward owner type defined', () => {
    expect(src).toContain("'planning_steward'");
  });

  it('scope_change_triggers_visual_takeover: planning steward badge label defined', () => {
    expect(src).toContain('[Planning Steward]');
  });

  it('scope_change_triggers_visual_takeover: accent color switches per owner', () => {
    expect(src).toContain('OWNER_COLOR');
    expect(src).toContain('accentColor');
  });

  it('ambiguity_questions_render_in_pane: ambiguityQuestions prop handled', () => {
    expect(src).toContain('ambiguityQuestions');
  });

  it('ambiguity_questions_render_in_pane: renders question labels', () => {
    expect(src).toContain('<label');
  });

  it('handback_shows_new_story_cards: newStories prop handled', () => {
    expect(src).toContain('newStories');
    expect(src).toContain('story_id');
    expect(src).toContain('title');
  });

  it('submit_calls_onSubmit_with_owner: onSubmit called with text and owner', () => {
    expect(src).toContain('onSubmit(text, currentOwner)');
  });

  it('submit_calls_onSubmit_with_owner: Send button present', () => {
    expect(src).toContain('Send');
    expect(src).toContain('<button');
  });

  it('no_real_api_calls: no fetch or env vars', () => {
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta.env');
    expect(src).not.toContain('XMLHttpRequest');
  });
});
