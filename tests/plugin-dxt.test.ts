import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { packagePluginAsDxt, validateDxtPackage, installDxtPackage } from '../src/plugins/dxt.js';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';

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

test('packagePluginAsDxt, validateDxtPackage, and installDxtPackage work together', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'dxt-pack',
    version: '0.1.0',
    capabilities: ['browser'],
  }), 'utf8');

  const packed = await packagePluginAsDxt({ manifestPath });
  assert.ok(packed.filePath.endsWith('.dxt'));

  const validated = await validateDxtPackage({ packagePath: packed.filePath });
  assert.equal(validated.manifest.name, 'dxt-pack');

  const installed = await installDxtPackage({ packagePath: packed.filePath, pluginsDir: path.join(root, 'plugins') });
  const saved = JSON.parse(await readFile(installed.manifestPath, 'utf8'));
  assert.equal(saved.name, 'dxt-pack');
});

test('plugin-trust and plugin-autoupdate refresh a trusted plugin manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-autoupdate-'));
  const pluginsDir = path.join(root, 'plugins');
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'plugin-update-app',
    paths: { pluginsDir: 'plugins' },
  }), 'utf8');
  await writeFile(path.join(pluginsDir, 'sample-pack.json'), JSON.stringify({
    name: 'sample-pack',
    version: '0.1.0',
    capabilities: ['sample'],
  }), 'utf8').catch(async () => {
    await import('node:fs/promises').then((fs) => fs.mkdir(pluginsDir, { recursive: true }));
    await writeFile(path.join(pluginsDir, 'sample-pack.json'), JSON.stringify({
      name: 'sample-pack',
      version: '0.1.0',
      capabilities: ['sample'],
    }), 'utf8');
  });

  const server = await withJsonServer((req, res) => {
    if (req.url === '/registry') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{
        name: 'sample-pack',
        version: '0.2.0',
        manifestUrl: `${server.url}/sample-pack.json`,
      }]));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'sample-pack',
      version: '0.2.0',
      capabilities: ['sample', 'updated'],
    }));
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: { ...process.env, STARKHARNESS_PLUGIN_REGISTRY_URL: `${server.url}/registry` },
    });
    const runtime = await createRuntime({
      app: {
        name: 'plugin-update-app',
        rootDir: root,
        paths: { pluginsDir },
      },
      projectDir: root,
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'plugin-autoupdate' },
      envConfig,
    });

    await runtime.dispatchCommand('plugin-trust', { name: 'sample-pack' });
    const result = await runtime.dispatchCommand('plugin-autoupdate');
    assert.equal(result.ok, true);
    assert.equal(result.updates[0].to, '0.2.0');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});
