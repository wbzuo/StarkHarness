import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, createBlueprintDocument } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

test('runtime boots with full blueprint surfaces', () => {
  const runtime = createRuntime();
  const blueprint = createBlueprintDocument(runtime);

  assert.equal(blueprint.name, 'StarkHarness');
  assert.equal(runtime.providers.list().length, 3);
  assert.equal(runtime.tools.list().length, 10);
  assert.ok(blueprint.capabilities.advanced.includes('voice'));
});

test('permission engine blocks ask-gated tools by default', async () => {
  const runtime = createRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'echo test' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-escalation-required');
});

test('allowing read tools executes successfully', async () => {
  const runtime = createRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: 'README.md' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.tool, 'read_file');
});
