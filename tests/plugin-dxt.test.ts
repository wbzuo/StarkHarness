import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { packagePluginAsDxt, validateDxtPackage, installDxtPackage, signDxtPackage, verifyDxtSignature } from '../src/plugins/dxt.js';
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

test('installDxtPackage keeps included files under a plugin-specific directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-assets-'));
  const manifestPath = path.join(root, 'plugin.json');
  const assetPath = path.join(root, 'assets', 'prompt.md');
  await writeFile(manifestPath, JSON.stringify({
    name: 'dxt-assets',
    version: '0.1.0',
    capabilities: ['browser'],
  }), 'utf8');
  await import('node:fs/promises').then((fs) => fs.mkdir(path.dirname(assetPath), { recursive: true }));
  await writeFile(assetPath, '# prompt\n', 'utf8');

  const packed = await packagePluginAsDxt({
    manifestPath,
    include: ['assets/prompt.md'],
  });
  const installed = await installDxtPackage({
    packagePath: packed.filePath,
    pluginsDir: path.join(root, 'plugins'),
  });

  const saved = JSON.parse(await readFile(installed.manifestPath, 'utf8'));
  const extracted = await readFile(path.join(root, 'plugins', 'dxt-assets', 'assets', 'prompt.md'), 'utf8');
  assert.equal(saved.name, 'dxt-assets');
  assert.equal(extracted, '# prompt\n');
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
    assert.equal(result.updates[0].plugin, 'sample-pack');
    assert.equal(JSON.parse(await readFile(path.join(pluginsDir, 'sample-pack.json'), 'utf8')).version, '0.2.0');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('packagePluginAsDxt with signingKey produces a signed package', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-sign-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'signed-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');

  const packed = await packagePluginAsDxt({ manifestPath, signingKey: 'test-secret-key' });
  assert.equal(packed.signed, true);

  // Validate with correct key
  const validated = await validateDxtPackage({ packagePath: packed.filePath }, { signingKey: 'test-secret-key' });
  assert.equal(validated.ok, true);
  assert.equal(validated.signature.valid, true);
  assert.equal(validated.signature.reason, 'ok');
});

test('validateDxtPackage rejects tampered signature', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-tamper-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'tamper-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');

  const packed = await packagePluginAsDxt({ manifestPath, signingKey: 'key-a' });
  await assert.rejects(
    () => validateDxtPackage({ packagePath: packed.filePath }, { signingKey: 'key-b' }),
    (err) => err.message.includes('signature-mismatch'),
  );
});

test('validateDxtPackage rejects tampered included files when package is signed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-tamper-include-'));
  const manifestPath = path.join(root, 'plugin.json');
  const assetPath = path.join(root, 'asset.txt');
  await writeFile(manifestPath, JSON.stringify({
    name: 'tamper-include-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');
  await writeFile(assetPath, 'asset-data', 'utf8');

  const packed = await packagePluginAsDxt({
    manifestPath,
    include: ['asset.txt'],
    signingKey: 'key-a',
  });
  const tamperedPath = path.join(root, 'tampered.dxt');
  const buffer = await readFile(packed.filePath);
  const original = Buffer.from('asset-data', 'utf8');
  const offset = buffer.indexOf(original);
  assert.notEqual(offset, -1);
  original.copy(buffer, offset, 0, 5);
  Buffer.from('evil!', 'utf8').copy(buffer, offset);
  await writeFile(tamperedPath, buffer);

  await assert.rejects(
    () => validateDxtPackage({ packagePath: tamperedPath }, { signingKey: 'key-a' }),
    (err) => err.message.includes('signature-mismatch'),
  );
});

test('validateDxtPackage without signingKey skips verification', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-nosig-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'nosig-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');

  const packed = await packagePluginAsDxt({ manifestPath });
  assert.equal(packed.signed, false);

  const validated = await validateDxtPackage({ packagePath: packed.filePath });
  assert.equal(validated.ok, true);
  assert.equal(validated.signature, null);
});

test('verifyDxtSignature returns no-signature for unsigned packages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-unsign-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'unsigned-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');

  const packed = await packagePluginAsDxt({ manifestPath });
  const buffer = await readFile(packed.filePath);
  const result = verifyDxtSignature(buffer, 'any-key');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'no-signature');
});

test('packagePluginAsDxt rejects unsafe include paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dxt-unsafe-'));
  const manifestPath = path.join(root, 'plugin.json');
  await writeFile(manifestPath, JSON.stringify({
    name: 'unsafe-pack',
    version: '1.0.0',
    capabilities: ['test'],
  }), 'utf8');

  await assert.rejects(
    () => packagePluginAsDxt({ manifestPath, include: ['../secret.txt'] }),
    (error) => error.message.includes('unsafe-entry'),
  );
});
