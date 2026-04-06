import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRuntimeEnv } from '../src/config/env.js';
import { createRuntime } from '../src/kernel/runtime.js';

async function withManagedAndRemoteServer() {
  const server = createServer((req, res) => {
    if (req.url === '/settings') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        features: { autoMode: true },
        voice: { model: 'managed-model' },
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('managed settings sync updates the active runtime env', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-managed-settings-'));
  const server = await withManagedAndRemoteServer();
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
      session: { cwd: root, goal: 'managed-settings' },
      envConfig,
    });

    const result = await runtime.dispatchCommand('settings-sync');
    assert.equal(result.ok, true);
    assert.equal(runtime.env.features.autoMode, true);
    assert.equal(runtime.env.voice.model, 'managed-model');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('remote bridge websocket mode receives commands and returns results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-remote-bridge-'));
  const OriginalWebSocket = globalThis.WebSocket;
  const instances = [];

  class FakeWebSocket {
    static OPEN = 1;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.OPEN;
      this.sent = [];
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      instances.push(this);
      queueMicrotask(() => this.onopen?.());
    }

    send(message) {
      this.sent.push(JSON.parse(message));
    }

    close() {
      this.readyState = 3;
      this.onclose?.();
    }

    emitMessage(payload) {
      this.onmessage?.({ data: JSON.stringify(payload) });
    }
  }

  globalThis.WebSocket = FakeWebSocket;
  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_REMOTE_BRIDGE_URL: 'ws://remote.example/bridge',
        STARKHARNESS_REMOTE_BRIDGE_CLIENT_ID: 'remote-client',
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'remote-bridge' },
      envConfig,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const socket = instances[0];
    assert.ok(socket);
    assert.equal(socket.sent.some((entry) => entry.type === 'hello'), true);

    socket.emitMessage({ type: 'command', name: 'status', requestId: 'req-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = socket.sent.find((entry) => entry.type === 'result' && entry.requestId === 'req-1');
    assert.ok(result);
    assert.equal(result.result.session.goal, 'remote-bridge');
    await runtime.shutdown();
  } finally {
    globalThis.WebSocket = OriginalWebSocket;
  }
});
