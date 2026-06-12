// Codex OAuth login + token lifecycle (skeleton).
// Mirrors the Codex CLI / OpenCode flow so agents can run on a ChatGPT
// subscription. Tokens are stored at ~/.codex/auth.json and managed by the
// Secret Broker; they must never enter agent context, logs, or traces.
//
// Personal developer use only. Shares ChatGPT rate limits. Not for resale.

import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

export const CODEX_OAUTH = {
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',           // public Codex CLI client
  authorizeUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  redirectUri: 'http://localhost:1455/auth/callback',
  scope: 'openid profile email offline_access',        // offline_access → refresh token
  inferenceEndpoint: 'https://chatgpt.com/backend-api/codex/responses',
  callbackPort: 1455,
  tokenStore: '~/.codex/auth.json',
  refreshSkewSeconds: 300,                             // refresh when within 5 min of expiry
} as const;

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  expires_at: number;        // epoch seconds
  account_id?: string;
}

export type HttpClient = (url: string, init: RequestInit) => Promise<Response>;

// --- PKCE (pure, implemented) ---
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// --- Authorize URL (pure, implemented) ---
export function buildAuthorizeUrl(challenge: string, state: string): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_OAUTH.clientId,
    redirect_uri: CODEX_OAUTH.redirectUri,
    scope: CODEX_OAUTH.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${CODEX_OAUTH.authorizeUrl}?${p.toString()}`;
}

// --- Default browser opener ---
function defaultOpenBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

// --- Network / server boundary ---

export async function startCallbackServerAndOpenBrowser(
  authorizeUrl: string,
  openBrowser: (url: string, port: number) => void = (url) => defaultOpenBrowser(url),
  port: number = CODEX_OAUTH.callbackPort,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;
      const parsed = new URL(req.url ?? '', `http://localhost:${actualPort}`);
      if (parsed.pathname !== '/auth/callback') {
        res.writeHead(404).end();
        return;
      }

      const error = parsed.searchParams.get('error');
      if (error) {
        res.writeHead(400).end('Authentication error. You may close this tab.');
        server.close();
        clearTimeout(timer);
        reject(new Error('auth callback error'));
        return;
      }

      const code = parsed.searchParams.get('code');
      if (!code) {
        res.writeHead(400).end('Missing code parameter.');
        server.close();
        clearTimeout(timer);
        reject(new Error('auth callback missing code'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' }).end(
        '<html><body><p>Authentication successful. You may close this tab.</p></body></html>',
      );
      server.close();
      clearTimeout(timer);
      resolve(code);
    });

    const timer = setTimeout(() => {
      server.close();
      reject(new Error('auth timeout: no callback received'));
    }, 120_000);

    server.listen(port, () => {
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;
      openBrowser(authorizeUrl, actualPort);
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function exchangeCode(
  code: string,
  verifier: string,
  httpClient: HttpClient = fetch as HttpClient,
): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CODEX_OAUTH.redirectUri,
    client_id: CODEX_OAUTH.clientId,
    code_verifier: verifier,
  });

  const res = await httpClient(CODEX_OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    // Never include response body — it may contain tokens
    throw new Error(`token exchange failed (status ${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    id_token?: string;
    expires_in: number;
    account_id?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    account_id: data.account_id,
  };
}

export async function refresh(
  tokens: AuthTokens,
  httpClient: HttpClient = fetch as HttpClient,
): Promise<AuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: CODEX_OAUTH.clientId,
  });

  const res = await httpClient(CODEX_OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`token refresh failed (status ${res.status})`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    id_token?: string;
    expires_in: number;
    account_id?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    account_id: data.account_id,
  };
}

// --- Token store ---

function resolveStorePath(storePath?: string): string {
  const p = storePath ?? CODEX_OAUTH.tokenStore;
  return p.startsWith('~/') ? join(homedir(), p.slice(2)) : p;
}

export async function loadAuth(storePath?: string): Promise<AuthTokens | null> {
  const resolved = resolveStorePath(storePath);
  if (!existsSync(resolved)) return null;

  let raw: string;
  try {
    raw = await readFile(resolved, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('auth file corrupt');
  }

  const t = parsed as Record<string, unknown>;
  if (!t.access_token || !t.refresh_token || !t.expires_at) {
    throw new Error('auth file corrupt');
  }

  return parsed as AuthTokens;
}

export async function saveAuth(tokens: AuthTokens, storePath?: string): Promise<void> {
  const resolved = resolveStorePath(storePath);
  const dir = dirname(resolved);
  await mkdir(dir, { recursive: true });

  const tmp = `${resolved}.tmp`;
  // Write to .tmp then rename for atomicity; never log token fields
  await writeFile(tmp, JSON.stringify(tokens, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(tmp, resolved);
}

// --- Orchestration ---
export async function login(): Promise<AuthTokens> {
  const { verifier, challenge } = makePkce();
  const state = b64url(randomBytes(16));
  const code = await startCallbackServerAndOpenBrowser(buildAuthorizeUrl(challenge, state));
  const tokens = await exchangeCode(code, verifier);
  await saveAuth(tokens);
  return tokens;
}
export async function getValidAccessToken(): Promise<string> {
  const t = await loadAuth();
  if (!t) throw new Error('not logged in: run `codeharness auth login`');
  const fresh = (t.expires_at - CODEX_OAUTH.refreshSkewSeconds) > Date.now() / 1000 ? t : await refresh(t);
  if (fresh !== t) await saveAuth(fresh);
  return fresh.access_token;
}
