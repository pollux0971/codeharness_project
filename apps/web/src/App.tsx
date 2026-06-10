import { useEffect, useState } from 'react';

const API = (import.meta as any).env?.VITE_API ?? 'http://127.0.0.1:8787';
const ROLE: Record<string, string> = {
  planning_steward: '#8AB4F8', supervisor: '#C792EA', developer: '#5BD6C0',
  debugger: '#F2A65A', shared: '#9FB0BF', harness: '#9FB0BF', validator: '#7EE081',
  permission_gateway: '#E0C36B', human: '#E6EDF3',
};
const j = (p: string) => fetch(API + p).then(r => r.json());

/** Cockpit shell: renders placeholder panels immediately; populates with live data when
 *  @codeharness/api is reachable. Panels A (Skills & Agents), B (Conversation — agent
 *  dialogue), and C (Platform) are always visible — loading state shows placeholders. */
export function App() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string>('');
  useEffect(() => {
    (async () => {
      try {
        const [platform, skills, agents, packages, plugins, escalations] = await Promise.all([
          j('/api/platform'), j('/api/skills'), j('/api/agents'),
          j('/api/packages'), j('/api/plugins'), j('/api/escalations'),
        ]);
        const convs = await j('/api/conversations');
        const conv = convs.conversations[0] ? await j('/api/conversations/' + convs.conversations[0].run_id) : { messages: [] };
        setD({ platform, skills: skills.skills, agents: agents.agents, packages: packages.packages, plugins: plugins.plugins, escalations: escalations.escalations, conv });
      } catch (e: any) { setErr('Cannot reach the CodeHarness API at ' + API + '. Start it with: pnpm --filter @codeharness/api dev'); }
    })();
  }, []);

  const wrap = { fontFamily: 'Inter, system-ui, sans-serif', background: '#0E1620', color: '#E6EDF3', minHeight: '100vh' } as const;
  const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
  const dim = { color: 'rgba(230,237,243,.34)' } as const;

  return (
    <main style={wrap} data-testid="cockpit-shell">
      <header style={{ padding: '14px 22px', borderBottom: '1px solid rgba(230,237,243,.1)' }}>
        <span style={{ fontWeight: 700 }}>Code<span style={{ color: '#5BD6C0' }}>Harness</span> · Cockpit</span>
        {d && (
          <span style={{ ...mono, marginLeft: 16, fontSize: 12, color: 'rgba(230,237,243,.56)' }}>
            {d.platform.agents} agents · {d.platform.packages} packages · {d.platform.skills} skills · {d.platform.states} states
          </span>
        )}
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 360px' }}>
        {/* Panel A — Skills & Agents */}
        <section data-panel="skills-agents" style={{ padding: 18, borderRight: '1px solid rgba(230,237,243,.1)' }}>
          <Eyebrow n="A" t="Skills &amp; Agents" />
          {!d && !err && <Placeholder label="skills &amp; agents" />}
          {err && <p style={{ fontSize: 12, ...dim }}>{err}</p>}
          {d && d.agents.map((a: any) => (
            <div key={a.id} style={{ background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 11, marginBottom: 8 }}>
              <div style={{ ...mono, fontWeight: 600, color: ROLE[a.id] }}>{a.id}</div>
              <div style={{ fontSize: 11.5, marginTop: 5 }}><span style={dim}>can </span>{a.does}</div>
              <div style={{ fontSize: 11.5, marginTop: 3 }}><span style={dim}>never </span><span style={{ color: '#F2A65A' }}>{a.never}</span></div>
            </div>
          ))}
          {d && d.skills.map((s: any) => (
            <div key={s.skill_id} style={{ background: '#141E2A', borderLeft: `2px solid ${ROLE[s.agent_role] || '#9FB0BF'}`, border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ ...mono, fontSize: 12 }}>{s.skill_id}</div>
              {s.description && <div style={{ fontSize: 12, color: 'rgba(230,237,243,.56)', marginTop: 5, lineHeight: 1.5 }}>{s.description}</div>}
              <div style={{ ...mono, fontSize: 10, marginTop: 7, color: s.status === 'registered' ? '#7EE081' : '#F2A65A' }}>{s.status}</div>
            </div>
          ))}
        </section>
        {/* Panel B — Conversation */}
        <section data-panel="conversation" style={{ padding: 18, borderRight: '1px solid rgba(230,237,243,.1)' }}>
          <Eyebrow n="B" t="Conversation — agent dialogue" />
          {!d && !err && <Placeholder label="conversation" />}
          {d && d.conv.messages.map((m: any) => (
            <div key={m.seq} style={{ borderLeft: '1px solid rgba(230,237,243,.1)', paddingLeft: 16, paddingBottom: 15, marginLeft: 6 }}>
              <div style={{ ...mono, fontSize: 11.5 }}>
                <span style={dim}>#{m.seq} </span>
                <b style={{ color: ROLE[m.from] || '#9FB0BF' }}>{m.from}</b>
                {m.to && <span style={{ color: 'rgba(230,237,243,.56)' }}> → {m.to}</span>}
                <span style={{ float: 'right', fontSize: 9.5, textTransform: 'uppercase', ...dim, border: '1px solid rgba(230,237,243,.1)', borderRadius: 5, padding: '1px 6px' }}>{m.type}</span>
              </div>
              <div style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.55 }}>{m.summary}</div>
            </div>
          ))}
        </section>
        {/* Panel C — Platform */}
        <section data-panel="platform" style={{ padding: 18 }}>
          <Eyebrow n="C" t="Platform" />
          {!d && !err && <Placeholder label="platform" />}
          {d && <>
            <Group t="Escalations — agent asked, not guessed" />
            {d.escalations.map((e: any, i: number) => (
              <div key={i} style={{ background: '#141E2A', border: '1px solid rgba(242,166,90,.28)', borderRadius: 9, padding: 11, marginBottom: 9 }}>
                <div style={{ ...mono, fontSize: 11, color: '#F2A65A', fontWeight: 600 }}>{e.type}</div>
                <div style={{ fontSize: 12, color: 'rgba(230,237,243,.56)', margin: '6px 0', lineHeight: 1.5 }}>{e.reason}</div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>{e.requested_decision}</div>
              </div>
            ))}
            <Group t="External plugins" />
            {d.plugins.map((p: any) => (
              <div key={p.id} style={{ background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 11 }}>
                <b>{p.name}</b> <span style={{ ...mono, fontSize: 9.5, color: '#C792EA' }}>external</span>
                <div style={{ fontSize: 11.5, color: 'rgba(230,237,243,.56)', margin: '6px 0', lineHeight: 1.5 }}>{p.description}</div>
                {p.install && <code style={{ ...mono, fontSize: 11, color: '#5BD6C0' }}>{p.install}</code>}
              </div>
            ))}
          </>}
        </section>
      </div>
    </main>
  );
}
const Eyebrow = ({ n, t }: { n: string; t: string }) => (
  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(230,237,243,.34)', marginBottom: 12 }}>
    <span style={{ color: '#5BD6C0' }}>{n}</span> &nbsp;{t}
  </div>
);
const Group = ({ t }: { t: string }) => (
  <h3 style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', margin: '18px 0 8px' }}>{t}</h3>
);
const Placeholder = ({ label }: { label: string }) => (
  <div data-placeholder={label} style={{ fontSize: 12, color: 'rgba(230,237,243,.24)', fontStyle: 'italic', padding: '10px 0' }}>
    — {label} placeholder —
  </div>
);
