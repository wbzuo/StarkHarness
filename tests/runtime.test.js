import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime, createBlueprintDocument } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

async function makeRuntime(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'test-runtime' },
    ...options,
  });
  return { runtime, root };
}

test('runtime boots with full blueprint surfaces', async () => {
  const { runtime } = await makeRuntime();
  const blueprint = createBlueprintDocument(runtime);

  assert.equal(blueprint.name, 'StarkHarness');
  assert.equal(runtime.providers.list().length, 3);
  assert.equal(runtime.tools.list().length, 10);
  assert.ok(blueprint.capabilities.advanced.includes('voice'));
  assert.equal(blueprint.orchestration.taskCount, 0);
  assert.equal(blueprint.plugins.count, 0);
  assert.equal(blueprint.orchestration.commandCount >= 11, true);
  assert.equal(blueprint.orchestration.toolCount >= 10, true);
  assert.equal(blueprint.orchestration.pluginConflictCount, 0);
  assert.equal(blueprint.persistence.transcriptPath.endsWith('transcript.jsonl'), true);
});

test('permission engine blocks ask-gated tools by default', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'echo test' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-escalation-required');
});

test('sandbox profile can tighten defaults before policy merges', async () => {
  const { runtime } = await makeRuntime({ sandboxProfile: 'locked' });
  assert.equal(runtime.permissions.can('read'), 'allow');
  assert.equal(runtime.permissions.can('exec'), 'deny');
  assert.equal(runtime.permissions.can('delegate'), 'deny');
});

test('policy file can override permission defaults', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-policy-'));
  const policyPath = path.join(root, 'policy.json');
  await writeFile(policyPath, JSON.stringify({ exec: 'allow', write: 'deny' }), 'utf8');
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'policy-runtime' },
    policyPath,
  });

  assert.equal(runtime.permissions.can('exec'), 'allow');
  assert.equal(runtime.permissions.can('write'), 'deny');
});


test('tool-scoped policy overrides capability decisions', async () => {
  const { runtime } = await makeRuntime({
    permissions: { exec: 'allow', tools: { shell: 'deny' } },
  });
  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'echo test' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.gate.source, 'tool');
});

test('allowing read tools executes successfully', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: '.starkharness/sessions/' + runtime.session.id + '.json' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.tool, 'read_file');
});

test('runtime persists session state after turns', async () => {
  const { runtime } = await makeRuntime();
  await runHarnessTurn(runtime, {
    tool: 'read_file',
    input: { path: '.starkharness/sessions/' + runtime.session.id + '.json' },
  });

  const saved = JSON.parse(await readFile(runtime.state.getSessionPath(runtime.session.id), 'utf8'));
  assert.equal(saved.id, runtime.session.id);
  assert.equal(saved.turns.length, 1);
});

test('write and edit tools modify workspace files when permitted', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';

  const writeResult = await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/demo.txt', content: 'alpha beta' },
  });
  assert.equal(writeResult.ok, true);

  const editResult = await runHarnessTurn(runtime, {
    tool: 'edit_file',
    input: { path: 'notes/demo.txt', oldString: 'beta', newString: 'gamma' },
  });
  assert.equal(editResult.ok, true);

  const finalContent = await readFile(path.join(root, 'notes/demo.txt'), 'utf8');
  assert.equal(finalContent, 'alpha gamma');
});

test('search and glob tools inspect workspace contents', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'docs/alpha.txt', content: 'needle here' },
  });
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'src/index.js', content: 'const needle = true;' },
  });

  const searchResult = await runHarnessTurn(runtime, {
    tool: 'search',
    input: { query: 'needle' },
  });
  assert.equal(searchResult.ok, true);
  assert.ok(searchResult.matches.some((match) => match.path === path.join(root, 'docs/alpha.txt')));
  assert.ok(searchResult.matches.some((match) => match.path === path.join(root, 'src/index.js')));

  const filteredSearch = await runHarnessTurn(runtime, {
    tool: 'search',
    input: { query: 'needle', glob: '*.js' },
  });
  assert.equal(filteredSearch.ok, true);
  assert.equal(filteredSearch.matches.length, 1);
  assert.equal(filteredSearch.matches[0].path, path.join(root, 'src/index.js'));

  const globResult = await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: 'alpha.txt' },
  });
  assert.equal(globResult.ok, true);
  assert.equal(globResult.matches[0], path.join(root, 'docs/alpha.txt'));

  const globPattern = await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: 'src/*.js' },
  });
  assert.equal(globPattern.ok, true);
  assert.deepEqual(globPattern.matches, [path.join(root, 'src/index.js')]);
});

test('delegate tools persist agents tasks and messages', async () => {
  const { runtime } = await makeRuntime();
  const agentResult = await runHarnessTurn(runtime, {
    tool: 'spawn_agent',
    input: { role: 'reviewer', scope: 'src' },
  });
  assert.equal(agentResult.ok, true);
  assert.equal(runtime.agents.list().length, 1);

  const taskResult = await runHarnessTurn(runtime, {
    tool: 'tasks',
    input: { action: 'create', task: { subject: 'Design provider contract' } },
  });
  assert.equal(taskResult.ok, true);
  assert.equal(runtime.tasks.list().length, 1);

  const messageResult = await runHarnessTurn(runtime, {
    tool: 'send_message',
    input: { to: agentResult.agent.id, body: 'Review provider abstraction' },
  });
  assert.equal(messageResult.ok, true);
  assert.equal(runtime.session.messages.length, 1);

  const snapshot = await runtime.state.loadRuntimeSnapshot();
  assert.equal(snapshot.agents.length, 1);
  assert.equal(snapshot.tasks.length, 1);
});

test('command dispatch and resume hydrate persisted state', async () => {
  const { runtime, root } = await makeRuntime();
  await runHarnessTurn(runtime, {
    tool: 'spawn_agent',
    input: { role: 'architect' },
  });
  await runHarnessTurn(runtime, {
    tool: 'tasks',
    input: { action: 'create', task: { subject: 'Implement resume flow' } },
  });

  const providers = await runtime.dispatchCommand('providers');
  assert.equal(providers.length, 3);

  const resumed = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    resumeSessionId: runtime.session.id,
  });
  assert.equal(resumed.session.id, runtime.session.id);
  assert.equal(resumed.agents.list().length, 1);
  assert.equal(resumed.tasks.list().length, 1);

  const resumedSession = await resumed.dispatchCommand('resume');
  assert.equal(resumedSession.id, runtime.session.id);
  assert.equal(resumedSession.turns.length, runtime.session.turns.length);
});

test('provider command returns stubbed completion output', async () => {
  const { runtime } = await makeRuntime();
  const completion = await runtime.dispatchCommand('complete', {
    provider: 'openai',
    prompt: 'draft scaffold',
  });

  assert.equal(completion.provider, 'openai');
  assert.equal(completion.output, 'stub:openai:draft scaffold');
});

test('transcript command replays event log', async () => {
  const { runtime } = await makeRuntime();
  await runtime.dispatchCommand('providers');
  await runHarnessTurn(runtime, {
    tool: 'spawn_agent',
    input: { role: 'tester' },
  });

  const transcript = await runtime.dispatchCommand('transcript');
  assert.ok(transcript.some((entry) => entry.eventName === 'runtime:boot'));
  assert.ok(transcript.some((entry) => entry.eventName === 'command:complete'));
  assert.ok(transcript.some((entry) => entry.eventName === 'turn:complete'));
});

test('plugin loader registers manifests and exposes capabilities', async () => {
  const { runtime } = await makeRuntime({
    plugins: [
      { name: 'browser-pack', version: '0.1.0', capabilities: ['browser', 'dom-inspect'] },
    ],
  });

  const plugins = await runtime.dispatchCommand('plugins');
  assert.equal(plugins.plugins.length, 1);
  assert.equal(plugins.capabilities.length, 2);
  assert.equal(plugins.capabilities[0].plugin, 'browser-pack');
});

test('sessions command lists persisted sessions', async () => {
  const { runtime } = await makeRuntime();
  const sessions = await runtime.dispatchCommand('sessions');
  assert.ok(sessions.some((session) => session.id === runtime.session.id));
});

test('transcript command supports filtering and limits', async () => {
  const { runtime } = await makeRuntime();
  await runtime.dispatchCommand('providers');
  await runtime.dispatchCommand('complete', { provider: 'anthropic', prompt: 'probe' });

  const filtered = await runtime.dispatchCommand('transcript', { event: 'command:complete', limit: 1 });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].eventName, 'command:complete');
});

test('plugin commands are injected into the command registry', async () => {
  const { runtime } = await makeRuntime({
    plugins: [
      {
        name: 'workflow-pack',
        version: '0.1.0',
        commands: [{ name: 'plugin:hello', description: 'Say hello', output: 'hello-from-plugin' }],
      },
    ],
  });

  const result = await runtime.dispatchCommand('plugin:hello');
  assert.equal(result.source, 'plugin');
  assert.equal(result.output, 'hello-from-plugin');
});

test('profiles command lists sandbox profiles', async () => {
  const { runtime } = await makeRuntime();
  const profiles = await runtime.dispatchCommand('profiles');
  assert.ok(profiles.includes('safe'));
  assert.ok(profiles.includes('locked'));
});

test('playback command summarizes transcript events', async () => {
  const { runtime } = await makeRuntime();
  await runtime.dispatchCommand('providers');
  await runtime.dispatchCommand('complete', { provider: 'openai', prompt: 'playback' });

  const playback = await runtime.dispatchCommand('playback', { event: 'command:complete' });
  assert.ok(playback.totalEvents >= 1);
  assert.ok(playback.eventNames.includes('command:complete'));
});

test('plugin tools are injected into the tool registry', async () => {
  const { runtime } = await makeRuntime({
    plugins: [
      {
        name: 'tool-pack',
        version: '0.1.0',
        tools: [{ name: 'plugin_tool', capability: 'delegate', output: 'tool-output' }],
      },
    ],
  });

  const result = await runHarnessTurn(runtime, { tool: 'plugin_tool', input: { sample: true } });
  assert.equal(result.source, 'plugin');
  assert.equal(result.output, 'tool-output');
});

test('provider responses expose typed envelope fields', async () => {
  const { runtime } = await makeRuntime();
  const response = await runtime.dispatchCommand('complete', { provider: 'anthropic', prompt: 'typed' });
  assert.equal(typeof response.request.createdAt, 'string');
  assert.equal(typeof response.completedAt, 'string');
  assert.equal(response.request.metadata.source, 'command');
});

test('session-summary reports current runtime state', async () => {
  const { runtime } = await makeRuntime();
  await runHarnessTurn(runtime, { tool: 'spawn_agent', input: { role: 'summarizer' } });
  await runHarnessTurn(runtime, { tool: 'tasks', input: { action: 'create', task: { subject: 'Summarize' } } });
  const summary = await runtime.dispatchCommand('session-summary');
  assert.equal(summary.agents, 1);
  assert.equal(summary.tasks, 1);
});

test('replay-turn command emits deterministic replay skeleton', async () => {
  const { runtime } = await makeRuntime();
  await runHarnessTurn(runtime, { tool: 'spawn_agent', input: { role: 'replay' } });
  const replay = await runtime.dispatchCommand('replay-turn');
  assert.equal(replay.length, 1);
  assert.equal(replay[0].tool, 'spawn_agent');
});

test('provider config file is loaded into provider registry summaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-provider-config-'));
  const configPath = path.join(root, 'providers.json');
  await writeFile(configPath, JSON.stringify({ openai: { model: 'gpt-5', baseUrl: 'https://example.com' } }), 'utf8');
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'provider-config' },
    providerConfigPath: configPath,
  });

  const summary = await runtime.dispatchCommand('provider-config');
  assert.deepEqual(summary.openai, ['model', 'baseUrl']);
});

test('plugin diagnostics report conflicting command and tool names', async () => {
  const { runtime } = await makeRuntime({
    plugins: [
      { name: 'p1', version: '0.1.0', commands: [{ name: 'dup:cmd' }], tools: [{ name: 'dup_tool' }] },
      { name: 'p2', version: '0.1.0', commands: [{ name: 'dup:cmd' }], tools: [{ name: 'dup_tool' }] },
    ],
  });

  const plugins = await runtime.dispatchCommand('plugins');
  assert.equal(plugins.diagnostics.commandConflicts.length, 1);
  assert.equal(plugins.diagnostics.toolConflicts.length, 1);
});

test('plugin-vs-builtin conflicts are detected and builtin is preserved', async () => {
  const { runtime } = await makeRuntime({
    plugins: [
      { name: 'override-pack', version: '0.1.0', commands: [{ name: 'doctor' }], tools: [{ name: 'shell', output: 'plugin-shell' }] },
    ],
  });

  // Conflicts are reported
  const plugins = await runtime.dispatchCommand('plugins');
  const cmdConflict = plugins.diagnostics.commandConflicts.find((c) => c.source === 'plugin-vs-builtin');
  const toolConflict = plugins.diagnostics.toolConflicts.find((c) => c.source === 'plugin-vs-builtin');
  assert.ok(cmdConflict, 'should detect plugin overriding builtin command "doctor"');
  assert.equal(cmdConflict.name, 'doctor');
  assert.ok(toolConflict, 'should detect plugin overriding builtin tool "shell"');
  assert.equal(toolConflict.name, 'shell');

  // Builtin is preserved, not overwritten by plugin
  const doctor = await runtime.dispatchCommand('doctor');
  assert.equal(doctor.ok, true, 'builtin doctor command should still work');
  const shellTool = runtime.tools.get('shell');
  assert.equal(shellTool.capability, 'exec', 'builtin shell tool should be preserved');
});

test('replay-runner command produces plan and summary', async () => {
  const { runtime } = await makeRuntime();
  await runHarnessTurn(runtime, { tool: 'spawn_agent', input: { role: 'runner' } });
  const replayRunner = await runtime.dispatchCommand('replay-runner');
  assert.equal(replayRunner.plan.length, 1);
  assert.equal(replayRunner.summary.status, 'planned');
});


test('runtime.run binds matching skill into execution path', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-skillrun-'));
  const skillDir = path.join(root, 'skills', 'review');
  await writeFile(path.join(root, 'dummy.txt'), 'x', 'utf8').catch(() => {});
  await import('node:fs/promises').then(fs => fs.mkdir(skillDir, { recursive: true }));
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---
name: review
description: systematic code review with structured output
version: 1.0.0
---
Review instructions here`,
    'utf8',
  );

  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'skill-run' },
  });

  runtime.runner.run = async ({ systemPrompt }) => ({
    finalText: 'ok',
    turns: [],
    messages: [],
    stopReason: 'end_turn',
    usage: {},
    _systemPrompt: systemPrompt,
  });

  const result = await runtime.run('please do a code review of src');
  assert.equal(result.activeSkill, 'review');
  assert.ok(result._systemPrompt.includes('Active Skill: review'));
});

test('runtime.shutdown disconnects all MCP clients', async () => {
  const { runtime } = await makeRuntime();
  let disconnected = 0;
  runtime.mcpClients.set('a', { disconnect: async () => { disconnected += 1; } });
  runtime.mcpClients.set('b', { disconnect: async () => { disconnected += 1; } });
  await runtime.shutdown();
  assert.equal(disconnected, 2);
});

test('completeWithStrategy uses provider capabilities from registered providers', async () => {
  const { ProviderRegistry } = await import('../src/providers/index.js');
  const registry = new ProviderRegistry({});
  registry.register({ id: 'a', purpose: 'a', modelFamily: 'x', capabilities: ['chat'], async complete(req) { return { id: 'a', req }; } });
  registry.register({ id: 'b', purpose: 'b', modelFamily: 'x', capabilities: ['chat', 'tools'], async complete(req) { return { id: 'b', req }; } });
  const result = await registry.completeWithStrategy({ capability: 'tools', request: { prompt: 'x' }, retryOptions: { maxRetries: 1, timeout: 1000, baseDelay: 1 } });
  assert.equal(result.id, 'b');
});
