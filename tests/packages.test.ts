import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workspace package manifests exist for split modules', async () => {
  const coreManifest = JSON.parse(await readFile('packages/core/package.json', 'utf8'));
  const appManifest = JSON.parse(await readFile('packages/app/package.json', 'utf8'));
  const bridgeManifest = JSON.parse(await readFile('packages/bridge/package.json', 'utf8'));
  const webAccessManifest = JSON.parse(await readFile('packages/web-access/package.json', 'utf8'));

  assert.equal(coreManifest.name, '@starkharness/core');
  assert.equal(appManifest.name, '@starkharness/app');
  assert.equal(bridgeManifest.name, '@starkharness/bridge');
  assert.equal(webAccessManifest.name, '@starkharness/web-access');
});

test('workspace package entrypoints re-export core runtime surfaces', async () => {
  const core = await import('../packages/core/src/index.ts');
  const app = await import('../packages/app/src/index.ts');
  const bridge = await import('../packages/bridge/src/index.ts');
  const webAccess = await import('../packages/web-access/src/index.ts');

  assert.equal(typeof core.createRuntime, 'function');
  assert.equal(typeof core.loadRuntimeEnv, 'function');
  assert.equal(typeof app.loadAppManifest, 'function');
  assert.equal(typeof app.scaffoldApp, 'function');
  assert.equal(typeof bridge.createHttpBridge, 'function');
  assert.equal(typeof webAccess.describeWebAccess, 'function');
});
