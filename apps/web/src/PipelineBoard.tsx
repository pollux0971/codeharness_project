import type { ProjectStoryEntry, StoryStatus } from '@codeharness/harness-core';
import { computeCriticalPath as _computeCriticalPath } from './criticalPath';

export { computeCriticalPath } from './criticalPath';

type StoryWithDeps = ProjectStoryEntry & { depends_on?: string[] };

export interface PipelineBoardProps {
  stories: StoryWithDeps[];
  onSelectStory?: (story_id: string) => void;
  selectedStoryId?: string;
}

const LANES: StoryStatus[] = [
  'todo', 'in_progress', 'validating', 'debugging',
  'passed', 'checkpointed', 'done', 'blocked', 'escalated',
];

const STATUS_COLOR: Record<string, string> = {
  todo:         '#9FB0BF',
  in_progress:  '#8AB4F8',
  validating:   '#C792EA',
  debugging:    '#F2A65A',
  passed:       '#7EE081',
  checkpointed: '#5BD6C0',
  done:         '#7EE081',
  blocked:      '#E06B75',
  escalated:    '#E0C36B',
};

// ── DAG SVG ──────────────────────────────────────────────────────────────────

function DagView({ stories, criticalSet, selectedStoryId }: {
  stories: StoryWithDeps[];
  criticalSet: Set<string>;
  selectedStoryId?: string;
}) {
  if (stories.length === 0) return null;

  // Compute levels (longest chain from any root to each node)
  const storyMap = new Map(stories.map(s => [s.story_id, s]));
  const level: Record<string, number> = {};
  const visited = new Set<string>();
  const order: string[] = [];
  function dfs(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    const s = storyMap.get(id);
    for (const dep of (s?.depends_on ?? [])) {
      if (storyMap.has(dep)) dfs(dep);
    }
    order.push(id);
  }
  for (const s of stories) dfs(s.story_id);
  for (const id of order) {
    const s = storyMap.get(id)!;
    let maxDepLevel = -1;
    for (const dep of (s?.depends_on ?? [])) {
      if (level[dep] !== undefined && level[dep] > maxDepLevel) maxDepLevel = level[dep];
    }
    level[id] = maxDepLevel + 1;
  }

  // Group by level
  const byLevel: string[][] = [];
  for (const s of stories) {
    const l = level[s.story_id] ?? 0;
    while (byLevel.length <= l) byLevel.push([]);
    byLevel[l].push(s.story_id);
  }

  // Node positions
  const XSTEP = 160;
  const YSTEP = 56;
  const PAD = 50;
  const pos: Record<string, { x: number; y: number }> = {};
  for (let l = 0; l < byLevel.length; l++) {
    const col = byLevel[l];
    for (let i = 0; i < col.length; i++) {
      pos[col[i]] = { x: PAD + l * XSTEP, y: PAD + i * YSTEP };
    }
  }

  const maxX = PAD + byLevel.length * XSTEP;
  const maxY = PAD + Math.max(...byLevel.map(c => c.length)) * YSTEP + 30;

  // Build edges
  const edges: { from: string; to: string }[] = [];
  for (const s of stories) {
    for (const dep of (s.depends_on ?? [])) {
      if (pos[dep] && pos[s.story_id]) edges.push({ from: dep, to: s.story_id });
    }
  }

  return (
    <svg
      width={maxX}
      height={maxY}
      style={{ display: 'block', margin: '12px 0', overflow: 'visible' }}
      aria-label="dependency-dag"
    >
      {edges.map(e => {
        const isCritical = criticalSet.has(e.from) && criticalSet.has(e.to);
        const fx = pos[e.from].x + 54;
        const fy = pos[e.from].y + 14;
        const tx = pos[e.to].x;
        const ty = pos[e.to].y + 14;
        return (
          <line
            key={`${e.from}->${e.to}`}
            x1={fx} y1={fy} x2={tx} y2={ty}
            stroke={isCritical ? '#F0C040' : 'rgba(230,237,243,.3)'}
            strokeWidth={isCritical ? 2 : 1}
          />
        );
      })}
      {stories.map(s => {
        const p = pos[s.story_id];
        if (!p) return null;
        const isCrit = criticalSet.has(s.story_id);
        const isSel = s.story_id === selectedStoryId;
        const fill = STATUS_COLOR[s.status] ?? '#9FB0BF';
        return (
          <g key={s.story_id} transform={`translate(${p.x},${p.y})`}>
            <rect
              width={120} height={28} rx={5}
              fill={fill}
              fillOpacity={0.18}
              stroke={isSel ? '#5BD6C0' : isCrit ? '#F0C040' : fill}
              strokeWidth={isSel ? 2.5 : isCrit ? 2 : 1}
            />
            <text
              x={60} y={18}
              textAnchor="middle"
              fontSize={10}
              fill={isCrit ? '#F0C040' : '#E6EDF3'}
              fontFamily="JetBrains Mono, monospace"
              aria-hidden="true"
            >
              {`·${s.story_id}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function PipelineBoard({ stories, onSelectStory, selectedStoryId }: PipelineBoardProps): JSX.Element {
  const criticalPath = _computeCriticalPath(stories);
  const criticalSet = new Set(criticalPath);

  const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
  const dim = { color: 'rgba(230,237,243,.34)' } as const;

  return (
    <div style={{ padding: '16px 0' }}>
      {/* Kanban lanes */}
      <div style={{ display: 'flex', overflowX: 'auto', gap: 10, paddingBottom: 8 }}>
        {LANES.map(lane => {
          const cards = stories.filter(s => s.status === lane);
          return (
            <div
              key={lane}
              data-testid={`lane-${lane}`}
              style={{
                minWidth: 148,
                background: '#0D1B26',
                border: '1px solid rgba(230,237,243,.1)',
                borderRadius: 8,
                padding: '8px 10px',
              }}
            >
              <div style={{ ...mono, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.12em', color: STATUS_COLOR[lane], marginBottom: 8 }}>
                {lane.replace('_', ' ')}
                {' '}
                <span style={dim}>({cards.length})</span>
              </div>
              {cards.map(s => (
                <div
                  key={s.story_id}
                  data-testid={`card-${s.story_id}`}
                  data-selected={s.story_id === selectedStoryId ? 'true' : undefined}
                  onClick={() => onSelectStory?.(s.story_id)}
                  style={{
                    background: '#18242F',
                    border: s.story_id === selectedStoryId
                      ? '1.5px solid #5BD6C0'
                      : criticalSet.has(s.story_id)
                        ? '1.5px solid #F0C040'
                        : '1px solid rgba(230,237,243,.1)',
                    borderRadius: 6,
                    padding: '7px 9px',
                    marginBottom: 6,
                    cursor: onSelectStory ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ ...mono, fontSize: 11, fontWeight: 600, color: criticalSet.has(s.story_id) ? '#F0C040' : '#E6EDF3' }}>
                    {s.story_id}
                  </div>
                  <div style={{ ...mono, fontSize: 9.5, color: STATUS_COLOR[s.status], marginTop: 3 }}>
                    {s.status}
                  </div>
                  <div style={{ fontSize: 10.5, ...dim, marginTop: 3 }}>
                    {s.attempts}/{s.attempt_budget}
                  </div>
                </div>
              ))}
              {cards.length === 0 && (
                <div style={{ fontSize: 10.5, ...dim, paddingTop: 4 }}>—</div>
              )}
            </div>
          );
        })}
      </div>
      {/* DAG */}
      <div style={{ marginTop: 10, overflowX: 'auto' }}>
        <DagView stories={stories} criticalSet={criticalSet} selectedStoryId={selectedStoryId} />
      </div>
    </div>
  );
}
