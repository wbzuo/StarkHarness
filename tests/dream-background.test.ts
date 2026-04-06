import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';

test('background dream creates and runs the auto dream cron entry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-auto-dream-'));
  const envConfig = await loadRuntimeEnv({
    cwd: root,
    env: {
      ...process.env,
      STARKHARNESS_AUTO_DREAM: 'true',
      STARKHARNESS_DREAM_SCHEDULE: '@every:1s',
      STARKHARNESS_CRON_INTERVAL_MS: '10',
    },
  });
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'dream' },
    envConfig,
  });

  runtime.providers.completeWithStrategy = async ({ request }) => {
    if (request.systemPrompt?.includes('Extract 0-5 durable memories')) {
      return {
        text: '["Background memory"]',
        toolCalls: [],
        stopReason: 'end_turn',
        usage: {},
      };
    }
    return {
      text: 'assistant reply',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: {},
    };
  };

  await runtime.run('remember this in the background');
  await runtime.tickBackgroundJobs();

  const status = await runtime.dispatchCommand('dream-status');
  assert.equal(status.enabled, true);
  assert.ok(status.entries.some((entry) => entry.id === 'dream-auto'));

  const memoryPath = path.join(root, '.starkharness', 'memory', 'auto-memory.md');
  const content = await readFile(memoryPath, 'utf8');
  assert.match(content, /Background memory/);
  await runtime.shutdown();
});
