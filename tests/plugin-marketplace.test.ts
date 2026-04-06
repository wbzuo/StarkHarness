import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { access, mkdtemp, writeFile } from 'node:fs/promises';
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
      commands: [{ name: 'example', description: 'Example command', output: 'hello-from-plugin' }],
      tools: [{ name: 'example_tool', capability: 'read', description: 'Example tool', output: 'tool-from-plugin' }],
    }),
  });
  assert.equal(installed.ok, true);
  assert.ok(runtime.plugins.list().some((plugin) => plugin.name === 'example-pack'));
  assert.equal((await runtime.dispatchCommand('example')).output, 'hello-from-plugin');
  assert.deepEqual(await runtime.tools.get('example_tool')?.execute(), {
    ok: true,
    source: 'plugin',
    plugin: 'example-pack',
    tool: 'example_tool',
    input: {},
    output: 'tool-from-plugin',
  });

  const removed = await runtime.dispatchCommand('plugin-uninstall', { name: 'example-pack' });
  assert.equal(removed.ok, true);
  assert.equal(runtime.tools.get('example_tool'), undefined);
  await assert.rejects(() => runtime.dispatchCommand('example'), /Unknown command: example/);
  await runtime.shutdown();
});

test('plugin-trust and plugin-autoupdate refresh trusted plugin manifests from the registry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-autoupdate-'));
  const server = createServer((req, res) => {
    if (req.url === '/registry') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        name: 'trusted-pack',
        version: '2.0.0',
        manifestUrl: 'http://127.0.0.1:1/placeholder',
      }]));
      return;
    }
    if (req.url === '/manifest') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        name: 'trusted-pack',
        version: '2.0.0',
        commands: [{ name: 'trusted-pack-review', description: 'Updated review command', output: 'new-review' }],
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const originalFetch = global.fetch;

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: { ...process.env, STARKHARNESS_PLUGIN_REGISTRY_URL: `${baseUrl}/registry` },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'plugin-autoupdate' },
      envConfig,
    });
    global.fetch = async (input, init) => {
      const url = String(input);
      if (url === `${baseUrl}/registry`) {
        const response = await originalFetch(url, init);
        const payload = await response.json();
        payload[0].manifestUrl = `${baseUrl}/manifest`;
        return new Response(JSON.stringify(payload), {
          status: response.status,
          headers: response.headers,
        });
      }
      return originalFetch(input, init);
    };

    await runtime.dispatchCommand('plugin-install', {
      manifest: JSON.stringify({
        name: 'trusted-pack',
        version: '1.0.0',
        commands: [{ name: 'trusted-pack-review', description: 'Old review command', output: 'old-review' }],
      }),
    });
    assert.equal((await runtime.dispatchCommand('trusted-pack-review')).output, 'old-review');
    const trusted = await runtime.dispatchCommand('plugin-trust', { name: 'trusted-pack' });
    assert.ok(trusted.includes('trusted-pack'));

    const result = await runtime.dispatchCommand('plugin-autoupdate');
    assert.equal(result.updates.length, 1);
    assert.ok(runtime.plugins.list().some((plugin) => plugin.name === 'trusted-pack'));
    assert.equal((await runtime.dispatchCommand('trusted-pack-review')).output, 'new-review');
    await runtime.shutdown();
  } finally {
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
  }
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

test('runtime also loads plugin manifests from the default workspace plugins directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-default-dir-'));
  await import('node:fs/promises').then((fs) => fs.mkdir(path.join(root, 'plugins'), { recursive: true }));
  await writeFile(path.join(root, 'plugins', 'pack.json'), JSON.stringify({
    name: 'default-pack',
    version: '0.1.0',
    commands: [{ name: 'default-pack-review', description: 'Review from default dir', output: 'default-dir-plugin' }],
  }), 'utf8');

  const runtime = await createRuntime({
    projectDir: root,
    session: { cwd: root, goal: 'plugin-default-dir' },
  });
  assert.ok(runtime.plugins.list().some((plugin) => plugin.name === 'default-pack'));
  assert.equal((await runtime.dispatchCommand('default-pack-review')).output, 'default-dir-plugin');
  await runtime.shutdown();
});

test('plugin-uninstall removes extracted DXT content directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-uninstall-dxt-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'plugin-uninstall-dxt' },
  });
  const manifestPath = path.join(root, 'plugin.json');
  await import('node:fs/promises').then((fs) => fs.mkdir(path.join(root, 'assets'), { recursive: true }));
  await writeFile(manifestPath, JSON.stringify({
    name: 'dxt-cleanup-pack',
    version: '1.0.0',
    commands: [{ name: 'dxt-cleanup-command', description: 'DXT command', output: 'cleanup-pack' }],
  }), 'utf8');
  await writeFile(path.join(root, 'assets', 'notes.txt'), 'cleanup asset', 'utf8');

  const packed = await runtime.dispatchCommand('plugin-package-dxt', {
    path: 'plugin.json',
    include: 'assets/notes.txt',
  });
  await runtime.dispatchCommand('plugin-install', { dxt: packed.outputPath });
  await access(path.join(root, 'plugins', 'dxt-cleanup-pack', 'assets', 'notes.txt'));

  const removed = await runtime.dispatchCommand('plugin-uninstall', { name: 'dxt-cleanup-pack' });
  assert.equal(removed.ok, true);
  await assert.rejects(() => access(path.join(root, 'plugins', 'dxt-cleanup-pack')), /ENOENT/);
  await runtime.shutdown();
});
