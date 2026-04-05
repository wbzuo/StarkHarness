import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadAppManifest } from '../src/app/manifest.js';
import { listStarterApps, scaffoldApp } from '../src/app/scaffold.js';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';

test('loadAppManifest resolves starter-style paths', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-app-manifest-'));
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'config', 'policy.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'config', 'providers.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'demo-app',
    paths: {
      commandsDir: 'commands',
      skillsDir: 'skills',
      hooksDir: 'hooks',
      policyPath: 'config/policy.json',
      providerConfigPath: 'config/providers.json',
      pluginManifestPath: 'plugins/browser-pack.json',
      envPath: '.env',
    },
    startup: { port: 4010, host: '0.0.0.0' },
    automation: { defaultPrompt: 'hello auto' },
  }), 'utf8');
  await writeFile(path.join(root, '.env'), 'STARKHARNESS_AUTO_MODE=true\n', 'utf8');

  const app = await loadAppManifest({ cwd: root });
  assert.equal(app.name, 'demo-app');
  assert.equal(app.startup.port, 4010);
  assert.equal(app.automation.defaultPrompt, 'hello auto');
  assert.equal(app.paths.commandsDir, path.join(root, 'commands'));
  assert.equal(app.paths.policyPath, path.join(root, 'config', 'policy.json'));
  assert.equal(app.paths.envPath, path.join(root, '.env'));
});

test('listStarterApps exposes scaffoldable app templates', async () => {
  const apps = await listStarterApps();
  assert.ok(apps.some((app) => app.id === 'browser-research'));
  assert.ok(apps.some((app) => app.id === 'workflow-automation'));
});

test('scaffoldApp copies starter app, config, and deployment files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-scaffold-'));
  const result = await scaffoldApp({
    targetDir: root,
    template: 'browser-research',
    force: true,
  });

  assert.equal(result.ok, true);
  const manifest = JSON.parse(await readFile(path.join(root, 'starkharness.app.json'), 'utf8'));
  assert.equal(manifest.name, 'browser-research-app');
  assert.ok(await readFile(path.join(root, 'Dockerfile'), 'utf8'));
  assert.ok(await readFile(path.join(root, '.env.example'), 'utf8'));
  assert.ok(await readFile(path.join(root, 'commands', 'research-brief.md'), 'utf8'));
  assert.ok(await readFile(path.join(root, 'hooks', 'pre-shell-guard.ts'), 'utf8'));
});

test('runtime loads app-specific commands, hooks, and metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-app-runtime-'));
  await mkdir(path.join(root, 'commands'), { recursive: true });
  await mkdir(path.join(root, 'hooks'), { recursive: true });
  await mkdir(path.join(root, 'skills', 'review'), { recursive: true });
  await mkdir(path.join(root, 'config'), { recursive: true });
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'app-runtime',
    description: 'Runtime manifest test',
    paths: {
      commandsDir: 'commands',
      hooksDir: 'hooks',
      skillsDir: 'skills',
      policyPath: 'config/policy.json',
      providerConfigPath: 'config/providers.json',
    },
  }), 'utf8');
  await writeFile(path.join(root, 'commands', 'hello.md'), '---\ndescription: Say hello\n---\nHello!', 'utf8');
  await writeFile(path.join(root, 'hooks', 'session-start.ts'), `export default {
    event: 'SessionStart',
    async handler() { return { additionalContext: 'app manifest hook' }; },
  };`, 'utf8');
  await writeFile(path.join(root, 'skills', 'review', 'SKILL.md'), `---
name: review
description: app specific review flow
version: 0.1.0
---
Review app code.`, 'utf8');
  await writeFile(path.join(root, 'config', 'policy.json'), JSON.stringify({ exec: 'allow' }), 'utf8');
  await writeFile(path.join(root, 'config', 'providers.json'), JSON.stringify({}), 'utf8');
  await writeFile(path.join(root, '.env'), 'OPENAI_API_KEY=test-openai\nSTARKHARNESS_BRIDGE_PORT=4123\nSTARKHARNESS_FEATURE_WEB_ACCESS=false\n', 'utf8');

  const app = await loadAppManifest({ cwd: root });
  const envConfig = await loadRuntimeEnv({ cwd: app.rootDir, envFilePath: app.paths.envPath });
  const runtime = await createRuntime({
    app,
    envConfig,
    projectDir: app.rootDir,
    session: { cwd: app.rootDir, goal: 'app-runtime' },
  });

  assert.equal(runtime.app.name, 'app-runtime');
  assert.ok(runtime.context.systemPrompt.includes('app manifest hook'));
  assert.ok(runtime.commands.list().some((command) => command.name === 'hello'));
  assert.ok(runtime.skills.listDiscovered().some((skill) => skill.name === 'review'));
  const envStatus = await runtime.dispatchCommand('env-status');
  assert.equal(envStatus.bridge.port, 4123);
  assert.equal(envStatus.features.webAccess, false);
  assert.equal(envStatus.providers.openai.configured, true);
  const loginStatus = await runtime.dispatchCommand('login-status');
  assert.equal(loginStatus.openai.configured, true);
  assert.equal(loginStatus.anthropic.configured, false);
  await runtime.shutdown();
});
