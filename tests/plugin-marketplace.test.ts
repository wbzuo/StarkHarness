import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';
import { loadAppManifest } from '../src/app/manifest.js';

async function withJsonServer(payload) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('plugin-marketplace-list reads registry data from configured URL', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-registry-'));
  const server = await withJsonServer([{ name: 'browser-pack', version: '1.0.0' }]);
  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: { ...process.env, STARKHARNESS_PLUGIN_REGISTRY_URL: server.url },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'plugin-registry' },
      envConfig,
    });
    const result = await runtime.dispatchCommand('plugin-marketplace-list');
    assert.equal(result[0].name, 'browser-pack');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('plugin-install writes a plugin manifest and plugin-uninstall removes it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-install-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'plugin-install' },
  });

  const installed = await runtime.dispatchCommand('plugin-install', {
    manifest: JSON.stringify({
      name: 'example-pack',
      version: '0.1.0',
      capabilities: ['example'],
      commands: [{ name: 'example', description: 'Example command' }],
    }),
  });
  assert.equal(installed.ok, true);
  assert.ok(runtime.plugins.list().some((plugin) => plugin.name === 'example-pack'));

  const removed = await runtime.dispatchCommand('plugin-uninstall', { name: 'example-pack' });
  assert.equal(removed.ok, true);
  await runtime.shutdown();
});

test('runtime loads plugin manifests from app plugins directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-dir-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'plugin-app',
    paths: {
      pluginsDir: 'plugins',
    },
  }), 'utf8');
  await writeFile(path.join(root, 'plugins', 'pack.json'), JSON.stringify({
    name: 'dir-pack',
    version: '0.1.0',
    tools: [{ name: 'dir_tool', capability: 'read', description: 'Dir tool' }],
  }), 'utf8').catch(async () => {
    await import('node:fs/promises').then(fs => fs.mkdir(path.join(root, 'plugins'), { recursive: true }));
    await writeFile(path.join(root, 'plugins', 'pack.json'), JSON.stringify({
      name: 'dir-pack',
      version: '0.1.0',
      tools: [{ name: 'dir_tool', capability: 'read', description: 'Dir tool' }],
    }), 'utf8');
  });

  const app = await loadAppManifest({ cwd: root });
  const runtime = await createRuntime({
    app,
    projectDir: root,
    session: { cwd: root, goal: 'plugin-dir' },
  });
  assert.ok(runtime.plugins.list().some((plugin) => plugin.name === 'dir-pack'));
  await runtime.shutdown();
});
