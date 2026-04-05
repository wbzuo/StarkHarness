import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { createRuntime } from '../src/kernel/runtime.js';
import { createHttpBridge } from '../src/bridge/http.js';

async function makeBridge() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'bridge-test' },
  });
  const bridge = await createHttpBridge(runtime, { port: 0, host: '127.0.0.1' });
  return { runtime, bridge };
}

async function closeBridge({ runtime, bridge }) {
  await bridge.close();
  await runtime.shutdown();
}

function parseSsePayloads(raw) {
  return raw
    .split('\n\n')
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const event = frame
        .split('\n')
        .find((line) => line.startsWith('event:'))
        ?.slice('event:'.length)
        .trim() ?? null;
      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data:'));
      const data = dataLine ? JSON.parse(dataLine.slice('data:'.length).trim()) : null;
      return { event, data };
    });
}

test('HTTP bridge serves health endpoint', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/health`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.sessionId);
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge lists providers', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/providers`);
    const providers = await res.json();
    assert.ok(Array.isArray(providers));
    assert.ok(providers.length >= 3);
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge lists tools', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/tools`);
    const tools = await res.json();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((tool) => tool.name === 'read_file'));
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge dispatches command', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/command/doctor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const result = await res.json();
    assert.equal(result.ok, true);
    assert.ok(result.providers >= 3);
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge returns 400 for empty prompt', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 400);
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge runs stub prompt', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    const result = await res.json();
    assert.ok(result.finalText);
    assert.ok(result.traceId);
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge streams SSE chunks and completion', async () => {
  const ctx = await makeBridge();
  try {
    const res = await fetch(`${ctx.bridge.url}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello bridge' }),
    });
    const raw = await res.text();
    const events = parseSsePayloads(raw);
    assert.ok(events.some((entry) => entry.data?.type === 'chunk'));
    assert.ok(events.some((entry) => entry.data?.type === 'complete'));
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge emits SSE error events when runtime.run fails', async () => {
  const ctx = await makeBridge();
  const originalRun = ctx.runtime.run;
  ctx.runtime.run = async () => {
    throw new Error('boom');
  };
  try {
    const res = await fetch(`${ctx.bridge.url}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'explode' }),
    });
    const raw = await res.text();
    const events = parseSsePayloads(raw);
    assert.ok(events.some((entry) => entry.event === 'error'));
    assert.ok(events.some((entry) => entry.data?.error === 'boom'));
  } finally {
    ctx.runtime.run = originalRun;
    await closeBridge(ctx);
  }
});

test('HTTP bridge upgrades websocket clients and sends connected event', async () => {
  const ctx = await makeBridge();
  try {
    const { hostname, port, pathname } = new URL(ctx.bridge.wsUrl);
    const key = randomBytes(16).toString('base64');
    const result = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: hostname, port: Number(port) });
      let response = '';
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('ws-timeout'));
      }, 1000);

      socket.on('data', (chunk) => {
        response += chunk.toString('latin1');
        if (response.includes('\r\n\r\n') && response.includes('"type":"connected"')) {
          clearTimeout(timer);
          socket.end();
          resolve(response);
        }
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.write(`GET ${pathname} HTTP/1.1\r\nHost: ${hostname}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });

    assert.ok(result.includes('101 Switching Protocols'));
    assert.ok(result.includes('"type":"connected"'));
  } finally {
    await closeBridge(ctx);
  }
});
