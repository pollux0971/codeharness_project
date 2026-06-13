import { useState } from 'react';
import type { CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 12, marginBottom: 10 };
const dim: CSSProperties = { color: 'rgba(230,237,243,.34)' };

export interface SkillEntry {
  skill_id: string;
  agent_role: string;
  description: string;
  status: 'registered' | 'quarantined' | 'needs_tests' | 'draft';
  avoid_lines?: string[];
  test_count?: number;
  quarantine_reason?: string;
}

export interface ToolAllowlistEntry {
  role: string;
  allowed_tools: string[];
}

export interface SkillsPageProps {
  skills: SkillEntry[];
  toolAllowlist?: ToolAllowlistEntry[];
}

const STATUS_COLOR: Record<SkillEntry['status'], string> = {
  registered:   '#7EE081',
  quarantined:  '#E57373',
  needs_tests:  '#F2A65A',
  draft:        'rgba(230,237,243,.34)',
};

function SkillCard({ skill }: { skill: SkillEntry }): JSX.Element {
  const [avoidOpen, setAvoidOpen] = useState(false);
  // Show only the suffix after the role prefix to avoid duplicate text matches with role group headers.
  const displayName = skill.skill_id.startsWith(`${skill.agent_role}.`)
    ? skill.skill_id.slice(skill.agent_role.length + 1)
    : skill.skill_id;

  return (
    <div data-skillid={skill.skill_id} style={{ ...card, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ ...mono, fontSize: 12, fontWeight: 700 }}>{displayName}</span>
        <span style={{
          ...mono,
          fontSize: 10,
          color: STATUS_COLOR[skill.status],
          background: `${STATUS_COLOR[skill.status]}22`,
          borderRadius: 4,
          padding: '1px 6px',
        }}>
          {skill.status}
        </span>
        {skill.test_count !== undefined && (
          <span style={{ ...mono, fontSize: 10, ...dim }}>tests: {skill.test_count}</span>
        )}
      </div>

      <div style={{ fontSize: 12, marginBottom: 4 }}>{skill.description}</div>

      {skill.status === 'quarantined' && skill.quarantine_reason && (
        <div style={{ ...mono, fontSize: 11, color: '#E57373', marginTop: 4 }}>
          Quarantine: {skill.quarantine_reason}
        </div>
      )}

      {skill.avoid_lines && skill.avoid_lines.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <button
            onClick={() => setAvoidOpen(o => !o)}
            style={{ ...mono, fontSize: 10, background: 'none', border: 'none', cursor: 'pointer', ...dim, padding: 0 }}
          >
            {avoidOpen ? '▾' : '▸'} avoid ({skill.avoid_lines.length})
          </button>
          {avoidOpen && (
            <ul style={{ margin: '4px 0 0 12px', padding: 0, listStyle: 'disc' }}>
              {skill.avoid_lines.map((line, i) => (
                <li key={i} style={{ ...mono, fontSize: 11, color: '#F2A65A' }}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function RoleGroup({ role, skills }: { role: string; skills: SkillEntry[] }): JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ ...mono, fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', color: '#E6EDF3', padding: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{role}</span>
        <span style={{ ...mono, fontSize: 10, ...dim }}>({skills.length})</span>
      </button>
      {open && skills.map(s => <SkillCard key={s.skill_id} skill={s} />)}
    </div>
  );
}

function ToolAllowlistSection({ allowlist }: { allowlist: ToolAllowlistEntry[] }): JSX.Element {
  const th: CSSProperties = { ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(230,237,243,.1)' };
  const td: CSSProperties = { ...mono, fontSize: 11.5, padding: '5px 8px', borderBottom: '1px solid rgba(230,237,243,.06)' };

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Tool Allowlist</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Role</th>
            <th style={th}>Allowed Tools</th>
          </tr>
        </thead>
        <tbody>
          {allowlist.map(entry => (
            <tr key={entry.role}>
              <td style={td}>{entry.role}</td>
              <td style={td}>
                {entry.allowed_tools.map((tool, i) => (
                  <span key={tool}>{tool}{i < entry.allowed_tools.length - 1 ? ', ' : ''}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkillsPage({ skills, toolAllowlist }: SkillsPageProps): JSX.Element {
  const groups = new Map<string, SkillEntry[]>();
  for (const skill of skills) {
    if (!groups.has(skill.agent_role)) groups.set(skill.agent_role, []);
    groups.get(skill.agent_role)!.push(skill);
  }

  return (
    <div data-testid="skills-page-read-only" style={{ padding: 16, color: '#E6EDF3', background: '#0D1117', minHeight: '100vh' }}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 16 }}>
        Skills Catalog
      </div>

      {Array.from(groups.entries()).map(([role, roleSkills]) => (
        <RoleGroup key={role} role={role} skills={roleSkills} />
      ))}

      {toolAllowlist && toolAllowlist.length > 0 && (
        <ToolAllowlistSection allowlist={toolAllowlist} />
      )}
    </div>
  );
}
