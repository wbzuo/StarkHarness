import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

async function makeRuntime(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-file-cache-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'file-cache' },
    ...options,
  });
  return { runtime, root };
}

test('file cache tracks hits, misses, and clear operations across read/edit flows', async () => {
  const { runtime, root } = await makeRuntime({
    permissions: { write: 'allow' },
  });

  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/demo.txt', content: 'alpha beta' },
  });
  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: 'notes/demo.txt' },
  });
  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: 'notes/demo.txt' },
  });

  const status = await runtime.dispatchCommand('file-cache-status');
  assert.equal(status.fileMisses >= 1, true);
  assert.equal(status.fileHits >= 1, true);

  await runHarnessTurn(runtime, {
    tool: 'edit_file',
    input: { path: 'notes/demo.txt', old_string: 'beta', new_string: 'gamma' },
  });
  const content = await readFile(path.join(root, 'notes/demo.txt'), 'utf8');
  assert.equal(content, 'alpha gamma');

  const cleared = await runtime.dispatchCommand('file-cache-clear');
  assert.equal(cleared.cachedFiles, 0);
  await runtime.shutdown();
});

test('background dream scheduling can be enabled and run through due cron entries', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.providers.completeWithStrategy = async ({ request }) => {
    if (request.systemPrompt?.includes('Extract 0-5 durable memories')) {
      return { text: '["Background dream memory"]', toolCalls: [], stopReason: 'end_turn', usage: {} };
    }
    return { text: 'assistant reply', toolCalls: [], stopReason: 'end_turn', usage: {} };
  };

  await runtime.run('remember this in the background');
  const entry = await runtime.dispatchCommand('dream-start', { schedule: '@every:1ms' });
  assert.equal(entry.enabled, true);

  await runtime.dispatchCommand('cron-run-due');
  const status = await runtime.dispatchCommand('dream-status');
  assert.equal(status.automation, 'active');
  assert.ok(status.entry.lastRunAt);

  const memoryPath = path.join(root, '.starkharness', 'memory', 'auto-memory.md');
  const content = await readFile(memoryPath, 'utf8');
  assert.match(content, /Background dream memory/);

  const stopped = await runtime.dispatchCommand('dream-stop');
  assert.equal(stopped.enabled, false);
  await runtime.shutdown();
});
