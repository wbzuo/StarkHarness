import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';

async function withServer(handler) {
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

test('managed settings sync updates runtime env configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-settings-'));
  const server = await withServer((req, res) => {
    if (req.url === '/settings') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        features: { debug: true },
        plugins: { registryUrl: 'https://registry.example.com' },
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_MANAGED_SETTINGS_URL: `${server.url}/settings`,
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'settings' },
      envConfig,
    });

    const synced = await runtime.dispatchCommand('settings-sync');
    assert.equal(synced.snapshot.features.debug, true);
    assert.equal(runtime.env.features.debug, true);
    assert.equal(runtime.env.plugins.registryUrl, 'https://registry.example.com');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('remote bridge polling executes remote commands and acknowledges them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-remote-'));
  const events = [];
  const server = await withServer((req, res) => {
    if (req.url?.startsWith('/bridge/next')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'command', name: 'status', args: {} }));
      return;
    }
    if (req.url === '/bridge/ack' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        events.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(204);
    res.end();
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_REMOTE_BRIDGE_URL: `${server.url}/bridge`,
        STARKHARNESS_REMOTE_BRIDGE_CLIENT_ID: 'client-1',
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'remote' },
      envConfig,
    });

    const status = await runtime.dispatchCommand('remote-status');
    assert.equal(status.enabled, true);

    const result = await runtime.dispatchCommand('remote-poll');
    assert.equal(result.ok, true);
    assert.equal(events.length, 1);
    assert.equal(events[0].name, 'status');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('remote bridge status falls back to the session id when no explicit client id is configured', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-remote-status-'));
  const envConfig = await loadRuntimeEnv({
    cwd: root,
    env: {
      ...process.env,
      STARKHARNESS_REMOTE_BRIDGE_URL: 'https://remote.example/bridge',
    },
  });
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'remote-status' },
    envConfig,
  });

  try {
    const status = await runtime.dispatchCommand('remote-status');
    assert.equal(status.clientId, runtime.session.id);
  } finally {
    await runtime.shutdown();
  }
});

test('remote bridge polling acknowledges execution failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-remote-fail-'));
  const events = [];
  const server = await withServer((req, res) => {
    if (req.url?.startsWith('/bridge/next')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 'command', name: 'missing-command', args: {} }));
      return;
    }
    if (req.url === '/bridge/ack' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        events.push(JSON.parse(body));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    res.writeHead(204);
    res.end();
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_REMOTE_BRIDGE_URL: `${server.url}/bridge`,
        STARKHARNESS_REMOTE_BRIDGE_CLIENT_ID: 'client-fail',
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'remote-fail' },
      envConfig,
    });

    await assert.rejects(() => runtime.dispatchCommand('remote-poll'), /Unknown command/);
    assert.equal(events.length, 1);
    assert.equal(events[0].ok, false);
    assert.equal(events[0].name, 'missing-command');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});
