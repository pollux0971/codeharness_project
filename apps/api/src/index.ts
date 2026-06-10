import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');            // codeharness/
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'));
const readFixture = (p: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', p), 'utf8'));

const app = Fastify({ logger: true });
// permissive CORS for the cockpit (dev)
app.addHook('onRequest', (_req, reply, done) => { reply.header('access-control-allow-origin', '*'); reply.header('access-control-allow-headers', '*'); done(); });
app.options('/*', async (_req, reply) => reply.send());

app.get('/health', async () => ({ ok: true }));

// ── Skills: the agent skill catalog (display skills) ──────────────────────────
function loadSkills() {
  const manifest = read('skills/skill_manifest.json');
  return manifest.skills.map((s: any) => {
    let detail: any = {};
    try { detail = read(`${s.path}/skill.json`); } catch { /* template/older */ }
    return {
      skill_id: s.skill_id, agent_role: s.agent_role, status: detail.status ?? s.status,
      description: detail.description ?? '', version: detail.version ?? '',
      depends_on: detail.depends_on ?? [], enhances: detail.enhances ?? [], path: s.path,
    };
  });
}
app.get('/api/skills', async () => ({ skills: loadSkills() }));
app.get('/api/skills/:id', async (req: any, reply) => {
  const s = loadSkills().find((x: any) => x.skill_id === req.params.id);
  return s ?? reply.code(404).send({ error: 'skill not found' });
});

// ── Platform: agents, packages, state machine, plugins, summary ───────────────
const AGENTS = [
  { id: 'planning_steward', boundary: 'Human↔System', does: 'idea → PRD → architecture → epics/stories', never: 'write code, dispatch agents' },
  { id: 'supervisor', boundary: 'System↔Agents', does: 'decide next state, compose task packets, track state', never: 'edit code, run shell, apply/merge/promote, read secrets' },
  { id: 'developer', boundary: '—', does: 'minimal additive reversible patch + initial tests; decompose; pre-flight; spec-conformance', never: 'apply/merge/promote, widen scope, claim completion' },
  { id: 'debugger', boundary: '—', does: 'triage, minimal repair, emit failure gene', never: 'change story goal, delete tests, promote' },
];
const STATE_MACHINE = ['IDEA_INBOX','PLANNING_BUNDLE','SUPERVISOR_CONTRACT','DEVELOPER_PATCH_PROPOSAL','DEVELOPER_PREFLIGHT','SPEC_CONFORMANCE_REVIEW','WORKSPACE_APPLY','VALIDATION','DEBUG_LOOP','CHECKPOINT','HUMAN_GATE','PROMOTION_REVIEW','DONE'];

function loadPackages() {
  const dir = path.join(REPO, 'packages');
  return fs.readdirSync(dir).filter(d => fs.existsSync(path.join(dir, d, 'src', 'index.ts'))).map(d => {
    const src = fs.readFileSync(path.join(dir, d, 'src', 'index.ts'), 'utf8');
    const stubs = (src.match(/not implemented/g) || []).length;
    const hasTests = fs.existsSync(path.join(dir, d, 'src', 'index.test.ts'));
    return { name: `@codeharness/${d}`, stubs, tested: hasTests };
  });
}
app.get('/api/agents', async () => ({ agents: AGENTS }));
app.get('/api/packages', async () => ({ packages: loadPackages() }));
app.get('/api/state-machine', async () => ({ states: STATE_MACHINE }));
app.get('/api/plugins', async () => {
  // plugins.yaml is simple; ship a parsed view without a YAML dep
  return { plugins: [{ id: 'huashu-design', name: 'Huashu Design (花叔Design)', kind: 'design', external: true, source: 'skills.sh', license: 'MIT', install: 'npx skills add alchaincyf/huashu-design', description: 'HTML-native hi-fi design plugin — prototypes, slides, motion, infographics.' }] };
});

// ── Conversations: a run rendered as agent dialogue (display 對話內容) ─────────
app.get('/api/conversations', async () => {
  const c = readFixture('conversation.json');
  return { conversations: [{ run_id: c.run_id, story_id: c.story_id, sample: c.sample, messages: c.messages.length }] };
});
app.get('/api/conversations/:runId', async (req: any, reply) => {
  const c = readFixture('conversation.json');
  return req.params.runId === c.run_id ? c : reply.code(404).send({ error: 'run not found' });
});
app.get('/api/escalations', async () => readFixture('escalations.json'));

app.get('/api/platform', async () => ({
  name: 'CodeHarness', agents: AGENTS.length, packages: loadPackages().length,
  skills: loadSkills().length, states: STATE_MACHINE.length,
}));

app.listen({ port: 8787, host: '127.0.0.1' }).catch(err => { app.log.error(err); process.exit(1); });
