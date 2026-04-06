import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadAppManifest } from '../src/app/manifest.js';
import { loadRuntimeEnv } from '../src/config/env.js';

test('login command persists provider config to env and reloads runtime status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-login-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'login-app',
    paths: { envPath: '.env' },
  }), 'utf8');
  await writeFile(path.join(root, '.env'), '', 'utf8');

  const app = await loadAppManifest({ cwd: root });
  const envConfig = await loadRuntimeEnv({ cwd: root, envFilePath: app.paths.envPath });
  const runtime = await createRuntime({
    app,
    envConfig,
    projectDir: root,
    session: { cwd: root, goal: 'login' },
  });

  const result = await runtime.dispatchCommand('login', {
    provider: 'openai',
    apiKey: 'test-openai-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status.openai.configured, true);
  const envBody = await readFile(path.join(root, '.env'), 'utf8');
  assert.match(envBody, /OPENAI_API_KEY=test-openai-key/);
  assert.match(envBody, /OPENAI_MODEL=gpt-5/);
  await runtime.shutdown();
});

test('logout command removes provider config from env and reloads runtime status', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-logout-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'logout-app',
    paths: { envPath: '.env' },
  }), 'utf8');
  await writeFile(path.join(root, '.env'), [
    'OPENAI_API_KEY=test-openai-key',
    'OPENAI_BASE_URL=https://api.openai.com/v1',
    'OPENAI_MODEL=gpt-5',
  ].join('\n'), 'utf8');

  const app = await loadAppManifest({ cwd: root });
  const envConfig = await loadRuntimeEnv({ cwd: root, envFilePath: app.paths.envPath });
  const runtime = await createRuntime({
    app,
    envConfig,
    projectDir: root,
    session: { cwd: root, goal: 'logout' },
  });

  const result = await runtime.dispatchCommand('logout', { provider: 'openai' });
  assert.equal(result.ok, true);
  assert.equal(result.status.openai.configured, false);
  const envBody = await readFile(path.join(root, '.env'), 'utf8');
  assert.doesNotMatch(envBody, /OPENAI_API_KEY/);
  await runtime.shutdown();
});
