import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  assert.equal(runtime.tools.list().length >= 18, true);
  assert.ok(blueprint.capabilities.advanced.includes('voice'));
  assert.equal(blueprint.webAccess.available, true);
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

test('bash classifier blocks destructive shell commands even when exec is allowed', async () => {
  const { runtime } = await makeRuntime({
    permissions: { exec: 'allow' },
  });
  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'rm -rf /' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.gate.source, 'bash-classifier');
});

test('path rules can deny writes to sensitive locations', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-path-rule-'));
  const policyPath = path.join(root, 'policy.json');
  await writeFile(policyPath, JSON.stringify({
    write: 'allow',
    pathRules: [
      { pattern: 'secrets/**', write: 'deny' },
    ],
  }), 'utf8');

  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'path-rule-runtime' },
    policyPath,
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'secrets/prod.env', content: 'token=123' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'permission-denied');
  assert.equal(result.gate.source, 'path-rule');
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

test('runtime auto-loads filesystem hooks from state and project directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-hook-runtime-'));
  const stateDir = path.join(root, '.starkharness');
  const stateHooksDir = path.join(stateDir, 'hooks');
  const projectHooksDir = path.join(root, 'hooks');
  await mkdir(stateHooksDir, { recursive: true });
  await mkdir(projectHooksDir, { recursive: true });

  await writeFile(path.join(stateHooksDir, 'session-start.js'), `export default {
    event: 'SessionStart',
    async handler() {
      return { additionalContext: 'state hook context' };
    },
  };`, 'utf8');

  await writeFile(path.join(projectHooksDir, 'pre-shell-guard.js'), `export default {
    event: 'PreToolUse',
    matcher: 'shell',
    async handler({ toolInput }) {
      if ((toolInput?.command ?? '').includes('rm -rf')) {
        return { decision: 'deny', reason: 'blocked-by-file-hook' };
      }
      return { decision: 'allow' };
    },
  };`, 'utf8');

  const runtime = await createRuntime({
    stateDir,
    session: { cwd: root, goal: 'hook-runtime' },
    permissions: { exec: 'allow' },
  });

  assert.ok(runtime.context.systemPrompt.includes('state hook context'));

  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'rm -rf ./tmp' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'hook-denied');
  assert.equal(result.hookReason, 'blocked-by-file-hook');
  await runtime.shutdown();
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

test('edit_file reports non-unique matches with line previews', async () => {
  const { runtime } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/repeat.txt', content: 'alpha\nbeta\nalpha\n' },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'edit_file',
    input: { path: 'notes/repeat.txt', old_string: 'alpha', new_string: 'gamma' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'old-string-not-unique');
  assert.equal(result.occurrences, 2);
  assert.equal(result.matches[0].line, 1);
});

test('edit_file returns diff metadata on success', async () => {
  const { runtime } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notes/diff.txt', content: 'alpha\nbeta\n' },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'edit_file',
    input: { path: 'notes/diff.txt', old_string: 'beta', new_string: 'gamma' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.replacements, 1);
  assert.equal(result.diff.line, 2);
  assert.match(result.diff.before, /beta/);
  assert.match(result.diff.after, /gamma/);
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

test('grep tool supports regex and context lines', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: {
      path: 'logs/app.log',
      content: ['one', 'ERROR failure', 'details', 'WARN skip'].join('\n'),
    },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'grep',
    input: { pattern: 'ERROR|WARN', before: 1, after: 1 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].line, 2);
  assert.deepEqual(result.matches[0].before, ['one']);
  assert.deepEqual(result.matches[0].after, ['details']);
  assert.equal(result.matches[1].path, path.join(root, 'logs/app.log'));
});

test('tool_search finds tools by name and description', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'tool_search',
    input: { query: 'browser' },
  });
  assert.equal(result.ok, true);
  assert.ok(result.matches.some((tool) => tool.name === 'browser_open'));
});

test('lsp_diagnostics reports TypeScript errors for a file', async () => {
  const { runtime } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'src/broken.ts', content: 'const value: string = 123;\n' },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'lsp_diagnostics',
    input: { path: 'src/broken.ts' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.length > 0, true);
  assert.match(result.diagnostics[0].message, /string/i);
});

test('lsp_workspace_symbols finds symbols in workspace files', async () => {
  const { runtime } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'src/symbols.ts', content: 'export function helperThing() { return 1; }\n' },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'lsp_workspace_symbols',
    input: { query: 'helperThing' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.symbols.some((symbol) => symbol.name === 'helperThing'), true);
});

test('notebook_edit can insert and replace notebook cells', async () => {
  const { runtime, root } = await makeRuntime();
  runtime.permissions.rules.write = 'allow';
  const notebook = {
    cells: [
      { cell_type: 'markdown', metadata: {}, source: ['# Title\n'] },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await runHarnessTurn(runtime, {
    tool: 'write_file',
    input: { path: 'notebooks/demo.ipynb', content: JSON.stringify(notebook, null, 2) },
  });

  const inserted = await runHarnessTurn(runtime, {
    tool: 'notebook_edit',
    input: {
      path: 'notebooks/demo.ipynb',
      action: 'insert_cell',
      index: 1,
      cellType: 'code',
      source: 'print("hello")',
    },
  });
  assert.equal(inserted.ok, true);

  const replaced = await runHarnessTurn(runtime, {
    tool: 'notebook_edit',
    input: {
      path: 'notebooks/demo.ipynb',
      action: 'replace_cell',
      index: 0,
      cellType: 'markdown',
      source: '# Updated',
    },
  });
  assert.equal(replaced.ok, true);

  const saved = JSON.parse(await readFile(path.join(root, 'notebooks/demo.ipynb'), 'utf8'));
  assert.equal(saved.cells.length, 2);
  assert.match(saved.cells[0].source.join(''), /Updated/);
  assert.match(saved.cells[1].source.join(''), /hello/);
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

test('runtime.run exposes active skill directory to shell commands', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-skill-env-'));
  const skillDir = path.join(root, 'skills', 'web-access');
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---
name: web-access
description: use web access for search page reading and browser tasks
version: 1.0.0
---
Use web access for all network operations.`,
    'utf8',
  );

  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'skill-env' },
    permissions: { exec: 'allow' },
  });

  let calls = 0;
  runtime.providers.completeWithStrategy = async ({ request }) => {
    calls += 1;
    if (calls === 1) {
      return {
        text: '',
        toolCalls: [{
          id: 'tu_1',
          name: 'shell',
          input: {
            command: `${process.execPath} -e "process.stdout.write(process.env.CLAUDE_SKILL_DIR || '')"`,
          },
        }],
        stopReason: 'tool_use',
        usage: {},
      };
    }
    return {
      text: request.messages.at(-1)?.content?.[0]?.content ?? '',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: {},
    };
  };

  const result = await runtime.run('please use web access to inspect a page');
  const shellResult = JSON.parse(result.finalText);
  assert.equal(result.activeSkill, 'web-access');
  assert.equal(shellResult.stdout, skillDir);
});

test('runtime.shutdown disconnects all MCP clients', async () => {
  const { runtime } = await makeRuntime();
  let disconnected = 0;
  runtime.mcpClients.set('a', { disconnect: async () => { disconnected += 1; } });
  runtime.mcpClients.set('b', { disconnect: async () => { disconnected += 1; } });
  await runtime.shutdown();
  assert.equal(disconnected, 2);
});

test('runtime.shutdown clears pending mailbox waiters', async () => {
  const { runtime } = await makeRuntime();
  const pending = runtime.awaitResponse('agent-1', 'corr-1', { timeoutMs: 1000 }).catch((error) => error);
  const mailbox = await runtime.dispatchCommand('mailbox');
  assert.equal(mailbox.pendingResponses, 1);
  await runtime.shutdown();
  const error = await pending;
  assert.match(error.message, /runtime-shutdown/);
});

test('worker-state command returns persisted worker metrics', async () => {
  const { runtime } = await makeRuntime();
  runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'worker' });
  const request = runtime.inbox.request('agent-1', { from: 'agent-0', body: 'hello worker' });
  runtime.executor.executeMessage = async () => ({ finalText: 'pong', stopReason: 'end_turn', usage: {} });
  runtime.startWorker('agent-1', { pollIntervalMs: 1, maxMessagesPerTick: 1, timeoutMs: 100 });
  await runtime.awaitResponse('agent-0', request.correlationId).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await runtime.stopWorker('agent-1');
  const workerState = await runtime.dispatchCommand('worker-state', { agent: 'agent-1' });
  assert.equal(workerState.processedMessages >= 1, true);
  await runtime.shutdown();
});

test('web-access-status command reports bundled skill metadata', async () => {
  const { runtime } = await makeRuntime();
  const status = await runtime.dispatchCommand('web-access-status');
  assert.equal(status.available, true);
  assert.ok(status.skillDir.endsWith(path.join('skills', 'web-access')));
  assert.equal(status.scripts.checkDeps, true);
  assert.equal(status.scripts.cdpProxy, true);
  assert.equal(status.scripts.matchSite, true);
  await runtime.shutdown();
});

test('status command returns a consolidated runtime view', async () => {
  const { runtime } = await makeRuntime();
  const status = await runtime.dispatchCommand('status');
  assert.equal(typeof status.counts.tools, 'number');
  assert.equal(typeof status.counts.commands, 'number');
  assert.equal(typeof status.providers.openai, 'boolean');
  assert.equal(typeof status.features.remoteControl, 'boolean');
  assert.equal(typeof status.webAccess.available, 'boolean');
  await runtime.shutdown();
});

test('plan mode commands toggle session mode and affect runtime prompting', async () => {
  const { runtime } = await makeRuntime();
  await runtime.dispatchCommand('enter-plan-mode');
  const planStatus = await runtime.dispatchCommand('plan-status');
  assert.equal(planStatus.enabled, true);
  assert.equal(runtime.session.mode, 'plan');

  runtime.runner.run = async ({ systemPrompt }) => ({
    finalText: 'planned',
    turns: [],
    messages: [],
    stopReason: 'end_turn',
    usage: {},
    _systemPrompt: systemPrompt,
  });

  const result = await runtime.run('Should we refactor this module?');
  assert.match(result._systemPrompt, /Plan Mode/);

  await runtime.dispatchCommand('exit-plan-mode');
  const after = await runtime.dispatchCommand('plan-status');
  assert.equal(after.enabled, false);
  await runtime.shutdown();
});

test('todo_write persists user-facing todos and todos command lists them', async () => {
  const { runtime } = await makeRuntime();
  const result = await runHarnessTurn(runtime, {
    tool: 'todo_write',
    input: {
      todos: [
        { content: 'Add grep tool', status: 'in_progress', priority: 'high' },
        { content: 'Write docs', status: 'pending', priority: 'medium' },
      ],
    },
  });
  assert.equal(result.ok, true);
  const todos = await runtime.dispatchCommand('todos');
  assert.equal(todos.length, 2);
  assert.equal(todos[0].content, 'Add grep tool');
  await runtime.shutdown();
});

test('ask_user_question uses runtime askUserQuestion callback', async () => {
  const { runtime } = await makeRuntime({
    askUserQuestion: async ({ question }) => `${question} -> answer`,
  });
  const result = await runHarnessTurn(runtime, {
    tool: 'ask_user_question',
    input: { question: 'Proceed?' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.answer, 'Proceed? -> answer');
  await runtime.shutdown();
});

test('repl_tool preserves JavaScript session state', async () => {
  const { runtime } = await makeRuntime({
    permissions: { exec: 'allow' },
  });
  const first = await runHarnessTurn(runtime, {
    tool: 'repl_tool',
    input: { language: 'javascript', session: 'demo', code: 'globalThis.counter = 1; return globalThis.counter;' },
  });
  const second = await runHarnessTurn(runtime, {
    tool: 'repl_tool',
    input: { language: 'javascript', session: 'demo', code: 'globalThis.counter += 1; return globalThis.counter;' },
  });
  assert.equal(first.value, 1);
  assert.equal(second.value, 2);
  await runtime.shutdown();
});

test('cron commands persist and delete scheduled entries', async () => {
  const { runtime } = await makeRuntime();
  const created = await runtime.dispatchCommand('cron-create', {
    schedule: '0 * * * *',
    prompt: 'Summarize the latest changes',
  });
  assert.equal(created.id, 'cron-1');

  const listed = await runtime.dispatchCommand('cron-list');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].schedule, '0 * * * *');

  const deleted = await runtime.dispatchCommand('cron-delete', { id: 'cron-1' });
  assert.equal(deleted.removed, 1);
  const after = await runtime.dispatchCommand('cron-list');
  assert.equal(after.length, 0);
  await runtime.shutdown();
});

test('auto command uses app automation default prompt when no prompt is provided', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-auto-mode-'));
  await writeFile(path.join(root, 'starkharness.app.json'), JSON.stringify({
    name: 'auto-app',
    automation: {
      defaultPrompt: 'Summarize this workspace automatically',
    },
  }), 'utf8');

  const { loadAppManifest } = await import('../src/app/manifest.js');
  const app = await loadAppManifest({ cwd: root });
  const runtime = await createRuntime({
    app,
    projectDir: app.rootDir,
    session: { cwd: app.rootDir, goal: 'auto-mode' },
  });

  runtime.providers.completeWithStrategy = async () => ({
    text: 'auto-result',
    toolCalls: [],
    stopReason: 'end_turn',
    usage: {},
  });

  const result = await runtime.dispatchCommand('auto');
  assert.equal(result.mode, 'prompt');
  assert.equal(result.prompt, 'Summarize this workspace automatically');
  assert.equal(result.finalText, 'auto-result');
  await runtime.shutdown();
});

test('completeWithStrategy uses provider capabilities from registered providers', async () => {
  const { ProviderRegistry } = await import('../src/providers/index.js');
  const registry = new ProviderRegistry({});
  registry.register({ id: 'a', purpose: 'a', modelFamily: 'x', capabilities: ['chat'], async complete(req) { return { id: 'a', req }; } });
  registry.register({ id: 'b', purpose: 'b', modelFamily: 'x', capabilities: ['chat', 'tools'], async complete(req) { return { id: 'b', req }; } });
  const result = await registry.completeWithStrategy({ capability: 'tools', request: { prompt: 'x' }, retryOptions: { maxRetries: 1, timeout: 1000, baseDelay: 1 } });
  assert.equal(result.id, 'b');
});
