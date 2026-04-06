import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

async function withJsonServer(handler) {
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

test('voice-status and voice_transcribe use the configured transcription endpoint', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-voice-'));
  const clipPath = path.join(root, 'clip.wav');
  await writeFile(clipPath, 'fake audio bytes', 'utf8');

  const server = await withJsonServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/audio/transcriptions');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: 'transcribed hello', language: 'en' }));
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_VOICE_BASE_URL: server.url,
        STARKHARNESS_VOICE_API_KEY: 'voice-key',
        STARKHARNESS_VOICE_MODEL: 'gpt-4o-mini-transcribe',
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'voice' },
      envConfig,
      permissions: { network: 'allow' },
    });

    const status = await runtime.dispatchCommand('voice-status');
    assert.equal(status.ready, true);
    assert.equal(status.provider, 'openai');

    const result = await runHarnessTurn(runtime, {
      tool: 'voice_transcribe',
      input: { path: 'clip.wav' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, 'transcribed hello');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('swarm-start creates a scoped swarm and completes its tasks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-swarm-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'swarm' },
  });

  const result = await runtime.dispatchCommand('swarm-start', {
    roles: 'executor,executor',
    tasksJson: JSON.stringify([
      'Inspect the first slice',
      'Inspect the second slice',
    ]),
  });

  assert.ok(result.id.startsWith('swarm-'));
  assert.equal(result.agents.length, 2);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.results.length, 2);
  assert.ok(result.results.every((entry) => typeof entry.finalText === 'string'));

  const status = await runtime.dispatchCommand('swarm-status', { id: result.id });
  assert.equal(status.agents.length, 2);
  assert.equal(status.tasks.length, 2);
  assert.ok(status.tasks.every((task) => task.status === 'completed'));
  await runtime.shutdown();
});
