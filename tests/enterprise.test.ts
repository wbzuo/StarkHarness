import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadRuntimeEnv } from '../src/config/env.js';
import { createObservabilityManager } from '../src/enterprise/observability.js';
import { createFeatureFlagManager } from '../src/enterprise/growthbook.js';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadAppManifest } from '../src/app/manifest.js';

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

test('loadRuntimeEnv parses monitoring, sentry, and feature flag settings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-env-enterprise-'));
  await writeFile(path.join(root, '.env'), [
    'STARKHARNESS_MONITORING_URL=http://127.0.0.1:9000/events',
    'STARKHARNESS_MONITORING_TOKEN=test-token',
    'STARKHARNESS_SENTRY_DSN=https://public@example.com/42',
    'STARKHARNESS_GROWTHBOOK_URL=http://127.0.0.1:9000/flags',
    'STARKHARNESS_GROWTHBOOK_CLIENT_KEY=gb-key',
    'STARKHARNESS_FEATURE_FLAGS={"buddy":true}',
  ].join('\n'), 'utf8');

  const env = await loadRuntimeEnv({ cwd: root });
  assert.equal(env.telemetry.monitoringUrl, 'http://127.0.0.1:9000/events');
  assert.equal(env.telemetry.monitoringToken, 'test-token');
  assert.equal(env.telemetry.sentryDsn, 'https://public@example.com/42');
  assert.equal(env.telemetry.growthBookUrl, 'http://127.0.0.1:9000/flags');
  assert.equal(env.telemetry.featureFlags.buddy, true);
});

test('observability manager posts monitoring payloads and sentry envelopes', async () => {
  const requests = [];
  const server = await withJsonServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk.toString();
    requests.push({ url: req.url, method: req.method, body });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });

  try {
    const manager = createObservabilityManager({
      monitoringUrl: `${server.url}/events`,
      monitoringToken: 'monitor-token',
      sentryDsn: `${server.url.replace('http://', 'http://public@')}/42`,
    });
    await manager.report('runtime:error', { error: 'boom' });
    assert.equal(requests.some((entry) => entry.url === '/events'), true);
    assert.equal(requests.some((entry) => entry.url?.startsWith('/api/42/envelope/')), true);
  } finally {
    await server.close();
  }
});

test('feature flag manager merges local and remote flags', async () => {
  const server = await withJsonServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ features: { remote_control: true, buddy: false } }));
  });

  try {
    const manager = createFeatureFlagManager({
      growthBookUrl: server.url,
      growthBookClientKey: 'gb-key',
      featureFlags: { buddy: true, auto_mode: true },
    });
    await manager.sync();
    const flags = manager.getAll();
    assert.equal(flags.remote_control, true);
    assert.equal(flags.auto_mode, true);
    assert.equal(flags.buddy, false);
  } finally {
    await server.close();
  }
});

test('runtime enterprise commands expose observability and feature flags', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-enterprise-runtime-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({ name: 'enterprise-app' }), 'utf8');
  await writeFile(path.join(root, '.env'), [
    'STARKHARNESS_MONITORING_URL=http://127.0.0.1:8123/events',
    'STARKHARNESS_SENTRY_DSN=https://public@example.com/7',
    'STARKHARNESS_FEATURE_FLAGS={"buddy":true}',
  ].join('\n'), 'utf8');

  const app = await loadAppManifest({ cwd: root });
  const envConfig = await loadRuntimeEnv({ cwd: root, envFilePath: app.paths.envPath });
  const runtime = await createRuntime({
    app,
    envConfig,
    projectDir: root,
    session: { cwd: root, goal: 'enterprise' },
  });

  const observability = await runtime.dispatchCommand('observability-status');
  assert.equal(observability.observability.monitoringEnabled, true);
  assert.equal(observability.observability.sentryEnabled, true);

  const flags = await runtime.dispatchCommand('feature-flags');
  assert.equal(flags.buddy, true);
  await runtime.shutdown();
});
