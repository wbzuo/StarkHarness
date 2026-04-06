import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

test('file cache records hits after repeated reads and listings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-file-cache-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'file-cache' },
    permissions: { write: 'allow' },
  });

  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/cache.txt', content: 'cached' },
  });

  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: 'notes/cache.txt' },
  });
  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: 'notes/cache.txt' },
  });
  await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: '**/*.txt' },
  });
  await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: '**/*.txt' },
  });

  const status = await runtime.dispatchCommand('file-cache-status');
  assert.equal(status.fileHits >= 1, true);
  assert.equal(status.listingHits >= 1, true);
  await runtime.shutdown();
});
