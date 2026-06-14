/**
 * codex-login.ts — bind a Codex (ChatGPT subscription) account to THIS project.
 *
 * ▶ RUN THIS YOURSELF. It opens YOUR browser and uses YOUR ChatGPT login — an
 *   interactive secret/network action that an agent must not perform for you:
 *       node --experimental-strip-types scripts/codex-login.ts          # bind (login)
 *       node --experimental-strip-types scripts/codex-login.ts status   # show binding
 *       node --experimental-strip-types scripts/codex-login.ts logout   # unbind (local)
 *   In Claude Code, run it via the `!` prefix:  ! node codeharness/scripts/codex-login.ts
 *
 * Security (honors codeharness/CLAUDE.md secret policy):
 *   • OAuth tokens are written ONLY to ~/.codex/auth.json (gitignored, mode 0600 —
 *     the Secret Broker store, a protected path). They never enter this repo, logs,
 *     traces, or any agent context.
 *   • This project's config.json holds ONLY non-secret binding metadata
 *     (provider, account_id, a POINTER to the token store, timestamps). Never a token.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { login, loadAuth, CODEX_OAUTH, type AuthTokens } from '@codeharness/codex-auth';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

/** Write the NON-SECRET binding record. No access_token / refresh_token / id_token — ever. */
function writeBinding(tokens: AuthTokens): void {
  const binding = {
    provider: 'codex',
    auth_mode: 'oauth',
    bound_to_project: 'codeharness',
    account_id: tokens.account_id ?? null,
    token_store: CODEX_OAUTH.tokenStore,            // pointer to ~/.codex/auth.json, NOT the token
    inference_endpoint: CODEX_OAUTH.inferenceEndpoint,
    token_expires_at: tokens.expires_at,            // epoch seconds — not a secret
    bound_at: new Date().toISOString(),
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(binding, null, 2) + '\n');
}

async function status(): Promise<void> {
  const t = await loadAuth();
  if (!t) {
    console.log('codex: NOT bound. Run:  node --experimental-strip-types scripts/codex-login.ts');
    process.exit(1);
  }
  const expiresIn = Math.round(t.expires_at - Date.now() / 1000);
  console.log(`codex: bound  (account_id=${t.account_id ?? 'n/a'}, access token expires in ~${expiresIn}s; auto-refreshes)`);
  console.log(`  token store : ${CODEX_OAUTH.tokenStore}`);
  console.log(`  binding meta: ${path.relative(process.cwd(), CONFIG_PATH)}${fs.existsSync(CONFIG_PATH) ? '' : ' (missing — run login to (re)create)'}`);
}

async function logout(): Promise<void> {
  const resolved = CODEX_OAUTH.tokenStore.startsWith('~/')
    ? path.join(process.env.HOME ?? '', CODEX_OAUTH.tokenStore.slice(2))
    : CODEX_OAUTH.tokenStore;
  if (fs.existsSync(resolved)) fs.rmSync(resolved);
  if (fs.existsSync(CONFIG_PATH)) fs.rmSync(CONFIG_PATH);
  console.log('codex: unbound (removed local token store + binding metadata).');
}

async function bind(): Promise<void> {
  console.log('Opening your browser to log in to ChatGPT (Codex)…');
  const tokens = await login();   // interactive PKCE flow; saves token to ~/.codex/auth.json (0600)
  writeBinding(tokens);
  await loadAuth();               // verify the store is readable (no token is printed)
  console.log('✓ Codex account bound to this project.');
  console.log(`  token store : ${CODEX_OAUTH.tokenStore}  (gitignored, mode 0600)`);
  console.log(`  binding meta: ${path.relative(process.cwd(), CONFIG_PATH)}  (no secrets)`);
  console.log('  Enabling a real provider for live model calls is a separate human-gated step.');
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'login';
  if (cmd === 'status') return status();
  if (cmd === 'logout') return logout();
  if (cmd === 'login') return bind();
  console.error(`unknown command: ${cmd}  (use: login | status | logout)`);
  process.exit(2);
}

main().catch((e: unknown) => {
  // codex-auth errors are already secret-safe (they never include response bodies).
  console.error('codex-login failed:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
