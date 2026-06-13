import type { JSX } from 'react';

export type WorkerStatus = 'idle' | 'running' | 'reviewing' | 'done' | 'blocked';

export interface WorkerCell {
  worker_id: string;
  story_id?: string;
  status: WorkerStatus;
  cycle_phase?: 'develop' | 'validate' | 'review' | 'admit';
}

export interface WorkerGridProps {
  maxWorkers: number;
  workers: WorkerCell[];
  selectedWorkerId?: string;
  onSelectWorker?: (worker_id: string) => void;
}

const STATUS_COLOR: Record<WorkerStatus, string> = {
  idle:      '#9FB0BF',
  running:   '#8AB4F8',
  reviewing: '#78909C',
  done:      '#7EE081',
  blocked:   '#E06B75',
};

const CYCLE_PHASES = ['develop', 'validate', 'review', 'admit'] as const;

function CycleFlow({ current }: { current: WorkerCell['cycle_phase'] }) {
  const idx = current ? CYCLE_PHASES.indexOf(current) : -1;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
        {CYCLE_PHASES.map((phase, i) => (
          <div
            key={phase}
            title={phase}
            style={{
              width: 18,
              height: 6,
              borderRadius: 3,
              background: i === idx ? '#8AB4F8' : i < idx ? '#5BD6C0' : '#2a2a3a',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#8AB4F8',
          background: '#8AB4F822',
          border: '1px solid #8AB4F8',
          borderRadius: 4,
          padding: '1px 6px',
        }}
      >
        {current}
      </span>
    </div>
  );
}

function WorkerCellView({
  cell,
  zoomed,
  onClick,
}: {
  cell: WorkerCell;
  zoomed: boolean;
  onClick?: () => void;
}) {
  const color = STATUS_COLOR[cell.status];
  return (
    <div
      data-testid={`cell-${cell.worker_id}`}
      data-zoomed={zoomed ? 'true' : undefined}
      onClick={onClick}
      style={{
        background: '#1a1a2e',
        border: `2px solid ${zoomed ? '#8AB4F8' : '#2a2a3a'}`,
        borderRadius: 8,
        padding: zoomed ? 14 : 8,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s',
        gridColumn: zoomed ? 'span 2' : undefined,
        gridRow: zoomed ? 'span 2' : undefined,
        minHeight: zoomed ? 120 : 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#c9d1d9' }}>
          {cell.worker_id}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color,
            background: color + '22',
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '1px 5px',
          }}
        >
          {cell.status}
        </span>
      </div>
      {cell.story_id && (
        <span style={{ fontSize: 11, color: '#7a8a9a' }}>{cell.story_id}</span>
      )}
      {cell.status === 'running' && cell.cycle_phase && (
        <CycleFlow current={cell.cycle_phase} />
      )}
    </div>
  );
}

export function WorkerGrid({
  maxWorkers,
  workers,
  selectedWorkerId,
  onSelectWorker,
}: WorkerGridProps): JSX.Element {
  const cols = Math.ceil(Math.sqrt(maxWorkers));

  const workerMap = new Map(workers.map((w) => [w.worker_id, w]));

  const cells: Array<WorkerCell | null> = Array.from({ length: maxWorkers }, (_, i) => {
    const w = workers[i];
    return w ?? null;
  });

  return (
    <div
      data-testid="worker-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 8,
        padding: 12,
        background: '#0d1117',
        borderRadius: 10,
      }}
    >
      {cells.map((cell, idx) => {
        if (!cell) {
          return (
            <div
              key={`empty-${idx}`}
              style={{
                background: '#111120',
                border: '1px dashed #2a2a3a',
                borderRadius: 8,
                minHeight: 60,
                opacity: 0.4,
              }}
            />
          );
        }
        const zoomed = cell.worker_id === selectedWorkerId;
        return (
          <WorkerCellView
            key={cell.worker_id}
            cell={cell}
            zoomed={zoomed}
            onClick={onSelectWorker ? () => onSelectWorker(cell.worker_id) : undefined}
          />
        );
      })}
    </div>
  );
}
