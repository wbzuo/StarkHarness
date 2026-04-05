import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { createRuntime } from '../src/kernel/runtime.js';
import { createHttpBridge } from '../src/bridge/http.js';

async function makeBridge(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'bridge-test' },
  });
  const bridge = await createHttpBridge(runtime, { port: 0, host: '127.0.0.1', ...options });
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

function encodeClientFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const mask = randomBytes(4);
  const header = [0x81];
  if (payload.length < 126) {
    header.push(0x80 | payload.length);
  } else {
    throw new Error('test-frame-too-large');
  }
  const masked = Buffer.from(payload);
  for (let index = 0; index < masked.length; index += 1) {
    masked[index] ^= mask[index % 4];
  }
  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function decodeServerFrame(buffer) {
  if (buffer.length < 2) return null;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  if (buffer.length < offset + length) return null;
  return {
    text: buffer.slice(offset, offset + length).toString('utf8'),
    totalLength: offset + length,
  };
}

async function connectWs(wsUrl, { token } = {}) {
  const url = new URL(wsUrl);
  if (token) url.searchParams.set('token', token);
  const key = randomBytes(16).toString('base64');
  const socket = net.createConnection({ host: url.hostname, port: Number(url.port) });
  let buffer = Buffer.alloc(0);
  const queue = [];
  let waiter = null;

  function flush() {
    while (true) {
      const split = buffer.indexOf('\r\n\r\n');
      if (split >= 0) {
        buffer = buffer.slice(split + 4);
      }
      const frame = decodeServerFrame(buffer);
      if (!frame) break;
      buffer = buffer.slice(frame.totalLength);
      const payload = JSON.parse(frame.text);
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(payload);
      } else {
        queue.push(payload);
      }
    }
  }

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}:${url.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);

  return {
    async nextMessage(timeoutMs = 1000) {
      if (queue.length > 0) return queue.shift();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiter = null;
          reject(new Error('ws-timeout'));
        }, timeoutMs);
        waiter = (payload) => {
          clearTimeout(timer);
          resolve(payload);
        };
      });
    },
    async nextMessageOfType(type, timeoutMs = 1000) {
      const startedAt = Date.now();
      while (true) {
        const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt));
        const message = await this.nextMessage(remaining);
        if (message.type === type) return message;
      }
    },
    send(message) {
      socket.write(encodeClientFrame(JSON.stringify(message)));
    },
    close() {
      socket.end();
    },
  };
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

test('HTTP bridge websocket subscriptions gate broadcast traffic', async () => {
  const ctx = await makeBridge();
  try {
    const passive = await connectWs(ctx.bridge.wsUrl);
    assert.equal((await passive.nextMessage()).type, 'connected');

    const res = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello over http' }),
    });
    await res.json();
    const passiveResult = await Promise.race([
      passive.nextMessage(50).then(() => 'message').catch(() => 'timeout'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 75)),
    ]);
    assert.equal(passiveResult, 'timeout');
    passive.close();

    const subscriber = await connectWs(ctx.bridge.wsUrl);
    assert.equal((await subscriber.nextMessage()).type, 'connected');
    subscriber.send({ type: 'subscribe', topics: ['runs'] });
    const subscribed = await subscriber.nextMessageOfType('subscribed');
    assert.equal(subscribed.type, 'subscribed');
    assert.deepEqual(subscribed.topics, ['runs']);

    const subscribedRun = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello over http' }),
    });
    const result = await subscribedRun.json();
    const firstEvent = await subscriber.nextMessageOfType('chunk');
    const secondEvent = await subscriber.nextMessageOfType('complete');

    assert.equal(result.traceId != null, true);
    assert.equal(firstEvent.type, 'chunk');
    assert.equal(secondEvent.type, 'complete');
    assert.equal(secondEvent.traceId, result.traceId);
    subscriber.close();
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge websocket clients can issue run commands directly', async () => {
  const ctx = await makeBridge();
  try {
    const client = await connectWs(ctx.bridge.wsUrl);
    assert.equal((await client.nextMessage()).type, 'connected');
    client.send({ type: 'run', prompt: 'hello websocket', requestId: 'req-1' });
    const chunk = await client.nextMessageOfType('chunk');
    const complete = await client.nextMessageOfType('complete');
    assert.equal(chunk.type, 'chunk');
    assert.equal(chunk.requestId, 'req-1');
    assert.equal(complete.type, 'complete');
    assert.equal(complete.requestId, 'req-1');
    client.close();
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge enforces optional auth token on HTTP and websocket routes', async () => {
  const ctx = await makeBridge({ authToken: 'secret-token' });
  try {
    const unauthorized = await fetch(`${ctx.bridge.url}/providers`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${ctx.bridge.url}/providers`, {
      headers: { Authorization: 'Bearer secret-token' },
    });
    assert.equal(authorized.status, 200);

    const client = await connectWs(ctx.bridge.wsUrl, { token: 'secret-token' });
    const connected = await client.nextMessage();
    assert.equal(connected.type, 'connected');
    client.close();
  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge supports token-to-profile mapping (Authz)', async () => {
  const ctx = await makeBridge({
    tokenProfiles: {
      'admin-token': 'permissive',
      'viewer-token': 'locked',
    },
  });
  try {
    // Admin token should allow shell execution
    const adminRes = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token',
      },
      body: JSON.stringify({ prompt: 'run shell echo hello' }),
    });
    const adminBody = await adminRes.json();
    // We don't need it to actually succeed at execution (requires LLM),
    // but the contextual permissions passed to runtime.run should match 'permissive'.
    // We can verify this by checking if the trace log for the turn uses 'permissive' policy.

    // Viewer token should immediately deny via locked profile if we try a restricted command directly
    const viewerRes = await fetch(`${ctx.bridge.url}/command/doctor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer viewer-token',
      },
      body: JSON.stringify({}),
    });
    const viewerBody = await viewerRes.json();
    // Profile 'locked' should be visible in the doctor response if we passed it correctly
    assert.equal(viewerBody.policy.write, 'deny');
    assert.equal(viewerBody.policy.exec, 'deny');

    const adminDoctorRes = await fetch(`${ctx.bridge.url}/command/doctor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer admin-token',
      },
      body: JSON.stringify({}),
    });
    const adminDoctorBody = await adminDoctorRes.json();
    assert.equal(adminDoctorBody.policy.write, 'allow');
    assert.equal(adminDoctorBody.policy.exec, 'allow');

  } finally {
    await closeBridge(ctx);
  }
});

test('HTTP bridge supports fine-grained WebSocket filtering by traceId', async () => {
  const ctx = await makeBridge();
  try {
    const subscriber = await connectWs(ctx.bridge.wsUrl);
    await subscriber.nextMessage(); // connected

    // First run to get a traceId
    const run1 = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'first run' }),
    });
    const { traceId: traceId1 } = await run1.json();

    // Subscribe ONLY to traceId1
    subscriber.send({ type: 'subscribe', topics: ['runs'], filters: { traceId: traceId1 } });
    await subscriber.nextMessageOfType('subscribed');

    // Second run (different trace)
    const run2 = await fetch(`${ctx.bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'second run' }),
    });
    const { traceId: traceId2 } = await run2.json();

    // Check that we did NOT receive chunks from traceId2
    const eventResult = await Promise.race([
      subscriber.nextMessage(100).then(() => 'message').catch(() => 'timeout'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 150)),
    ]);
    assert.equal(eventResult, 'timeout');

    // Trigger another event for traceId1 (mocked or re-run)
    // For this test, we just verify the isolation. 
    // In a real scenario, we might have concurrent agents.

    subscriber.close();
  } finally {
    await closeBridge(ctx);
  }
});
