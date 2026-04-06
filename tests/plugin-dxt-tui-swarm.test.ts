import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { renderTuiFrame } from '../src/ui/tui.js';
import { buildTmuxSwarmPlan } from '../src/swarm/tmux.js';

async function makeRuntime(root) {
  return createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'plugin-dxt' },
  });
}

test('plugin-package-dxt and plugin-validate-dxt work for a basic plugin manifest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-plugin-dxt-'));
  const manifestPath = path.join(root, 'plugin.json');
  const notesPath = path.join(root, 'assets', 'notes.txt');
  await writeFile(manifestPath, JSON.stringify({
    name: 'dxt-pack',
    version: '1.0.0',
    capabilities: ['review'],
    commands: [{ name: 'review-pack', description: 'Review package', output: 'reviewed-from-dxt' }],
  }), 'utf8');
  await mkdir(path.dirname(notesPath), { recursive: true });
  await writeFile(notesPath, 'bundled asset', 'utf8');

  const runtime = await makeRuntime(root);
  const packed = await runtime.dispatchCommand('plugin-package-dxt', { path: 'plugin.json', include: 'assets/notes.txt' });
  assert.equal(packed.ok, true);

  const validated = await runtime.dispatchCommand('plugin-validate-dxt', { path: packed.outputPath });
  assert.equal(validated.ok, true);
  assert.equal(validated.manifest.name, 'dxt-pack');
  assert.equal(validated.entries.some((entry) => entry.name === 'assets/notes.txt'), true);

  const installed = await runtime.dispatchCommand('plugin-install', { dxt: packed.outputPath });
  assert.equal(installed.ok, true);
  const installedAsset = await readFile(path.join(root, 'plugins', 'dxt-pack', 'assets', 'notes.txt'), 'utf8');
  assert.equal(installedAsset, 'bundled asset');
  assert.equal((await runtime.dispatchCommand('review-pack')).output, 'reviewed-from-dxt');
  await runtime.shutdown();
});

test('renderTuiFrame summarizes product status in a terminal-friendly frame', () => {
  const frame = renderTuiFrame({
    session: { id: 'session-1', mode: 'interactive' },
    counts: { commands: 10, tools: 20, agents: 2, tasks: 3 },
    webAccess: { ready: true },
    voice: { ready: false },
    bridge: { remoteUrl: 'https://remote.example.com' },
    workers: { active: 1 },
    swarms: [{ id: 'swarm-1' }],
  });
  assert.match(frame, /StarkHarness TUI/);
  assert.match(frame, /Session/);
  assert.match(frame, /remote\.example\.com/);
});

test('buildTmuxSwarmPlan creates tmux commands for multi-terminal swarms', () => {
  const plan = buildTmuxSwarmPlan({
    sessionName: 'demo-swarm',
    cwd: '/tmp/demo',
    cliCommand: 'node --import tsx src/main.ts',
    tasks: [{ prompt: 'echo one' }, { prompt: 'echo two' }],
  });
  assert.equal(plan[0].cmd, 'tmux');
  assert.equal(plan[0].args[0], 'new-session');
  const firstTaskCommand = plan[0].args[plan[0].args.length - 1];
  assert.equal(typeof firstTaskCommand, 'string');
  assert.match(firstTaskCommand, /node --import tsx src\/main\.ts run --prompt='echo one'/);
  assert.equal(plan[1].args[0], 'split-window');
  assert.equal(plan.at(-1).args[0], 'display-message');
});

test('buildTmuxSwarmPlan honors a custom cliCommand for prompt tasks', () => {
  const plan = buildTmuxSwarmPlan({
    sessionName: 'demo-swarm',
    cwd: '/tmp/demo',
    cliCommand: 'starkharness',
    tasks: [{ prompt: 'analyze repo' }],
  });

  assert.match(plan[0].args.at(-1), /^starkharness run --prompt='analyze repo'$/);
});
