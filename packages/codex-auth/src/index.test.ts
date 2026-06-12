import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import {
  makePkce, buildAuthorizeUrl,
  startCallbackServerAndOpenBrowser,
  exchangeCode, refresh,
  loadAuth, saveAuth,
  CODEX_OAUTH, type AuthTokens,
} from './index';

// ---- pure functions (already pass — must not regress) ----
describe('codex-auth pure', () => {
  it('pkce_verifier_and_challenge_differ', () => {
    const { verifier, challenge } = makePkce();
    expect(verifier).not.toBe(challenge);
    expect(challenge.length).toBeGreaterThan(10);
  });
  it('authorize_url_contains_required_params', () => {
    const url = buildAuthorizeUrl('ch', 'st');
    expect(url).toContain('code_challenge=ch');
    expect(url).toContain('state=st');
    expect(url).toContain(CODEX_OAUTH.clientId);
  });
});

// ---- oauth_flow_round_trips_with_local_callback ----
describe('codex-auth callback server', () => {
  it('oauth_flow_round_trips_with_local_callback', async () => {
    // Use port 0 so the OS assigns a free port — CI-safe even when 1455 is occupied.
    // The actual port is passed to openBrowser so the mock can redirect to it.
    const browserOpen = (_url: string, port: number) => {
      setTimeout(() => {
        http.get(`http://localhost:${port}/auth/callback?code=test-code-123`);
      }, 30);
    };
    const code = await startCallbackServerAndOpenBrowser('http://fake-auth', browserOpen, 0);
    expect(code).toBe('test-code-123');
  }, 5000);
});

// ---- tokens_persisted_via_secret_handles (token store) ----
describe('codex-auth token store', () => {
  const tmpStore = join(tmpdir(), `codex-auth-test-${process.pid}.json`);
  const fakeTokens: AuthTokens = {
    access_token: 'at-fake', refresh_token: 'rt-fake',
    expires_at: Math.floor(Date.now() / 1000) + 3600, account_id: 'acc-1',
  };

  it('tokens_persisted_via_secret_handles', async () => {
    await saveAuth(fakeTokens, tmpStore);
    const loaded = await loadAuth(tmpStore);
    expect(loaded?.access_token).toBe('at-fake');
    expect(loaded?.refresh_token).toBe('rt-fake');
    if (existsSync(tmpStore)) unlinkSync(tmpStore);
  });

  it('load_returns_null_when_file_missing', async () => {
    expect(await loadAuth('/nonexistent/path.json')).toBeNull();
  });
});

// ---- refresh_renews_expired_token ----
describe('codex-auth token exchange', () => {
  const fakeTokenResponse = {
    access_token: 'new-at', refresh_token: 'new-rt',
    expires_in: 3600, id_token: 'id',
  };
  const mockHttp = async (_url: string, _init: RequestInit): Promise<Response> =>
    new Response(JSON.stringify(fakeTokenResponse), { status: 200 });

  it('refresh_renews_expired_token', async () => {
    const old: AuthTokens = {
      access_token: 'old-at', refresh_token: 'old-rt',
      expires_at: Math.floor(Date.now() / 1000) - 100,
    };
    const renewed = await refresh(old, mockHttp);
    expect(renewed.access_token).toBe('new-at');
    expect(renewed.refresh_token).toBe('new-rt');
    expect(renewed.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('exchange_code_returns_auth_tokens', async () => {
    const tokens = await exchangeCode('code123', 'verifier456', mockHttp);
    expect(tokens.access_token).toBe('new-at');
    expect(tokens.expires_at).toBeGreaterThan(0);
  });
});

// ---- secret_values_absent_from_trace_and_context ----
describe('codex-auth secret hygiene', () => {
  it('secret_values_absent_from_trace_and_context', async () => {
    // Simulate a failed token exchange — error message must not contain token values
    const badHttp = async (_url: string, _init: RequestInit): Promise<Response> =>
      new Response('{"error":"access_token=SUPER_SECRET"}', { status: 400 });
    try {
      await exchangeCode('c', 'v', badHttp);
      expect.fail('should have thrown');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toContain('SUPER_SECRET');
      expect(msg).toMatch(/failed|error/i);
    }
  });
});
