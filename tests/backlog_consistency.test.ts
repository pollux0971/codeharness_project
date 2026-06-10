import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Locks the three backlog sources together so they can never silently drift:
//   builder/stories/STORY-*.md   (the contracts)
//   builder/epics/EPIC_LIST.md   (the stable backlog)
//   builder/tracker/tracker_state.json (the /goal loop's machine state)
// See builder/claude-code/03_TRACKER_UPDATE_RULES.md (invariants 2-4).

const here = path.dirname(fileURLToPath(import.meta.url));
const builderDir = path.join(here, '..', '..', 'builder');
const storiesDir = path.join(builderDir, 'stories');
const epicListPath = path.join(builderDir, 'epics', 'EPIC_LIST.md');
const trackerPath = path.join(builderDir, 'tracker', 'tracker_state.json');

const STORY_RE = /STORY-\d+\.\d+/g;

function storyFileIds(): Set<string> {
  return new Set(
    fs.readdirSync(storiesDir)
      .filter((f) => /^STORY-\d+\.\d+\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, '')),
  );
}

function epicListIds(): Set<string> {
  const text = fs.readFileSync(epicListPath, 'utf8');
  return new Set(text.match(STORY_RE) ?? []);
}

const tracker = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
const trackerIds = new Set<string>(tracker.stories.map((s: { story_id: string }) => s.story_id));

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

describe('backlog-consistency', () => {
  it('every_story_file_has_a_tracker_entry', () => {
    expect(diff(storyFileIds(), trackerIds)).toEqual([]);
  });

  it('every_tracker_entry_has_a_story_file', () => {
    expect(diff(trackerIds, storyFileIds())).toEqual([]);
  });

  it('every_story_file_is_listed_in_epic_list', () => {
    expect(diff(storyFileIds(), epicListIds())).toEqual([]);
  });

  it('epic_list_has_no_unknown_story', () => {
    expect(diff(epicListIds(), storyFileIds())).toEqual([]);
  });

  it('no_dangling_depends_on', () => {
    const dangling: string[] = [];
    for (const s of tracker.stories) {
      for (const dep of s.depends_on ?? []) {
        if (!trackerIds.has(dep)) dangling.push(`${s.story_id} -> ${dep}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('every_story_status_is_in_the_enum', () => {
    const valid = new Set<string>(tracker.status_enum);
    const bad = tracker.stories
      .filter((s: { status: string }) => !valid.has(s.status))
      .map((s: { story_id: string; status: string }) => `${s.story_id}:${s.status}`);
    expect(bad).toEqual([]);
  });
});
