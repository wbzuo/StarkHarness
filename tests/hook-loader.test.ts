import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverHooks, loadHooksFromDir } from '../src/kernel/hook-loader.js';

test('loadHooksFromDir loads hook modules from a directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hook-loader-'));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'pre-shell.js'), `export default {
    event: 'PreToolUse',
    matcher: 'shell',
    async handler() { return { decision: 'allow' }; },
  };`, 'utf8');

  const hooks = await loadHooksFromDir(root);
  assert.equal(hooks.length, 1);
  assert.equal(hooks[0].event, 'PreToolUse');
  assert.equal(hooks[0].matcher, 'shell');
  assert.equal(typeof hooks[0].handler, 'function');
  assert.ok(hooks[0].sourcePath.endsWith('pre-shell.js'));
});

test('discoverHooks aggregates hooks from multiple directories in order', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hook-discovery-'));
  const stateDir = path.join(root, 'state-hooks');
  const projectDir = path.join(root, 'project-hooks');
  await mkdir(stateDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(stateDir, 'session-start.js'), `export default {
    event: 'SessionStart',
    async handler() { return { additionalContext: 'state context' }; },
  };`, 'utf8');
  await writeFile(path.join(projectDir, 'post-tool.js'), `export default {
    event: 'PostToolUse',
    matcher: '*',
    async handler() { return { decision: 'allow' }; },
  };`, 'utf8');

  const hooks = await discoverHooks([stateDir, projectDir]);
  assert.equal(hooks.length, 2);
  assert.deepEqual(hooks.map((hook) => hook.event), ['SessionStart', 'PostToolUse']);
});

test('loadHooksFromDir throws for invalid hook exports', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hook-loader-invalid-'));
  await writeFile(path.join(root, 'broken.js'), `export default { event: 'PreToolUse' };`, 'utf8');

  await assert.rejects(
    loadHooksFromDir(root),
    /must include a handler\(\) function/,
  );
});
