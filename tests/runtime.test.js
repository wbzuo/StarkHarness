import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, createBlueprintDocument } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeRuntime() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'test-runtime' },
  });
  return { runtime, root };
}

test('runtime boots with full blueprint surfaces', async () => {
  const { runtime } = await makeRuntime();
  const blueprint = createBlueprintDocument(runtime);

  assert.equal(blueprint.name, 'StarkHarness');
  assert.equal(runtime.providers.list().length, 3);
  assert.equal(runtime.tools.list().length, 10);
  assert.ok(blueprint.capabilities.advanced.includes('voice'));
});

test('permission engine blocks ask-gated tools by default', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'echo test' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-escalation-required');
});

test('allowing read tools executes successfully', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: '.starkharness/sessions/' + runtime.session.id + '.json' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.tool, 'read_file');
});

test('runtime persists session state after turns', async () => {
  const { runtime } = await makeRuntime();
  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: '.starkharness/sessions/' + runtime.session.id + '.json' },
  });

  const saved = JSON.parse(await readFile(runtime.state.getSessionPath(runtime.session.id), 'utf8'));
  assert.equal(saved.id, runtime.session.id);
  assert.equal(saved.turns.length, 1);
});

test('write and edit tools modify workspace files when permitted', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';

  const writeResult = await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/demo.txt', content: 'alpha beta' },
  });
  assert.equal(writeResult.ok, true);

  const editResult = await runHarnessTurn(runtime, {
    tool: 'edit_file',
    input: { path: 'notes/demo.txt', oldString: 'beta', newString: 'gamma' },
  });
  assert.equal(editResult.ok, true);

  const finalContent = await readFile(path.join(root, 'notes/demo.txt'), 'utf8');
  assert.equal(finalContent, 'alpha gamma');
});

test('search and glob tools inspect workspace contents', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'docs/alpha.txt', content: 'needle here' },
  });

  const searchResult = await runHarnessTurn(runtime, {
    tool: 'search',
    input: { query: 'needle' },
  });
  assert.equal(searchResult.ok, true);
  assert.ok(searchResult.matches.some((match) => match.path === path.join(root, 'docs/alpha.txt')));

  const globResult = await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: 'alpha.txt' },
  });
  assert.equal(globResult.ok, true);
  assert.equal(globResult.matches[0], path.join(root, 'docs/alpha.txt'));
});
