// Codex OAuth login + token lifecycle (skeleton).
// Mirrors the Codex CLI / OpenCode flow so agents can run on a ChatGPT
// subscription. Tokens are stored at ~/.codex/auth.json and managed by the
// Secret Broker; they must never enter agent context, logs, or traces.
//
// Personal developer use only. Shares ChatGPT rate limits. Not for resale.

import { createHash, randomBytes } from 'node:crypto';

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

// --- Network / server boundary (stubbed) ---
export async function startCallbackServerAndOpenBrowser(_authorizeUrl: string): Promise<string> {
  // Start http://localhost:1455, open the browser, resolve with the ?code= on callback.
  throw new Error('not implemented: local callback server on :1455 + browser open');
}
export async function exchangeCode(_code: string, _verifier: string): Promise<AuthTokens> {
  // POST tokenUrl with grant_type=authorization_code, code, redirect_uri, client_id, code_verifier.
  throw new Error('not implemented: token exchange at /oauth/token');
}
export async function refresh(_tokens: AuthTokens): Promise<AuthTokens> {
  // POST tokenUrl with grant_type=refresh_token, refresh_token, client_id.
  throw new Error('not implemented: refresh-token grant');
}

// --- Token store (stubbed; delegate to Secret Broker in the real impl) ---
export async function loadAuth(): Promise<AuthTokens | null> {
  throw new Error('not implemented: read ~/.codex/auth.json via Secret Broker');
}
export async function saveAuth(_t: AuthTokens): Promise<void> {
  throw new Error('not implemented: persist ~/.codex/auth.json via Secret Broker');
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
