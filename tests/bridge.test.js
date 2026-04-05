import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../src/kernel/runtime.js';
import { createHttpBridge } from '../src/bridge/http.js';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('HTTP bridge serves health endpoint', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/health`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.sessionId);
  } finally {
    await bridge.close();
  }
});

test('HTTP bridge lists providers', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/providers`);
    const providers = await res.json();
    assert.ok(Array.isArray(providers));
    assert.ok(providers.length >= 3);
  } finally {
    await bridge.close();
  }
});

test('HTTP bridge lists tools', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/tools`);
    const tools = await res.json();
    assert.ok(Array.isArray(tools));
    assert.ok(tools.some((t) => t.name === 'read_file'));
  } finally {
    await bridge.close();
  }
});

test('HTTP bridge dispatches command', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/command/doctor`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await res.json();
    assert.equal(result.ok, true);
    assert.ok(result.providers >= 3);
  } finally {
    await bridge.close();
  }
});

test('HTTP bridge returns 400 for empty prompt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
  } finally {
    await bridge.close();
  }
});

test('HTTP bridge runs stub prompt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-bridge-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'bridge-test' } });
  const bridge = await createHttpBridge(runtime, { port: 0 });
  try {
    const res = await fetch(`${bridge.url}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    const result = await res.json();
    assert.ok(result.finalText);
    assert.ok(result.traceId);
  } finally {
    await bridge.close();
  }
});
