import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generatePkcePair, buildAuthorizationUrl } from '../src/oauth/pkce.js';
import { exchangeAuthorizationCode, refreshAccessToken } from '../src/oauth/client.js';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadAppManifest } from '../src/app/manifest.js';
import { loadRuntimeEnv } from '../src/config/env.js';

async function withTokenServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('PKCE utilities generate verifier/challenge pairs and auth URLs', () => {
  const pkce = generatePkcePair();
  assert.ok(pkce.verifier);
  assert.ok(pkce.challenge);
  const url = buildAuthorizationUrl({
    authorizeUrl: 'https://example.com/oauth/authorize',
    clientId: 'client-1',
    redirectUri: 'http://127.0.0.1:9999/callback',
    scope: 'openid profile',
    state: pkce.state,
    codeChallenge: pkce.challenge,
  });
  assert.match(url, /code_challenge=/);
  assert.match(url, /scope=openid(\+|%20)profile/);
});

test('exchangeAuthorizationCode and refreshAccessToken talk to token endpoints', async () => {
  const server = await withTokenServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (body.includes('grant_type=authorization_code')) {
      res.end(JSON.stringify({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 }));
      return;
    }
    res.end(JSON.stringify({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 }));
  });

  try {
    const token = await exchangeAuthorizationCode({
      tokenUrl: `${server.url}/token`,
      clientId: 'client-1',
      code: 'code-1',
      redirectUri: 'http://127.0.0.1:9999/callback',
      codeVerifier: 'verifier',
    });
    assert.equal(token.access_token, 'access-1');

    const refreshed = await refreshAccessToken({
      tokenUrl: `${server.url}/token`,
      clientId: 'client-1',
      refreshToken: 'refresh-1',
    });
    assert.equal(refreshed.access_token, 'access-2');
  } finally {
    await server.close();
  }
});

test('oauth-refresh and oauth-status work with persisted auth profiles', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-oauth-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({ name: 'oauth-app' }), 'utf8');
  const server = await withTokenServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600 }));
  });

  try {
    const app = await loadAppManifest({ cwd: root });
    const envConfig = await loadRuntimeEnv({ cwd: root });
    const runtime = await createRuntime({
      app,
      envConfig,
      projectDir: root,
      session: { cwd: root, goal: 'oauth' },
    });
    await runtime.state.saveAuthProfile('openai', {
      mode: 'oauth',
      tokenUrl: `${server.url}/token`,
      clientId: 'client-1',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    const refreshed = await runtime.dispatchCommand('oauth-refresh', { provider: 'openai' });
    assert.equal(refreshed.ok, true);
    assert.equal(refreshed.profile.accessToken, 'access-2');

    const status = await runtime.dispatchCommand('oauth-status');
    assert.equal(status.openai.accessToken, true);
    assert.equal(status.openai.refreshToken, true);
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});
