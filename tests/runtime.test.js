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

  const searchResult = await runHarnessTurn(runtime, {
    tool: 'search',
    input: { query: 'needle' },
  });
  assert.equal(searchResult.ok, true);
  assert.ok(searchResult.matches.some((match) => match.path === path.join(root, 'docs/alpha.txt')));

  const globResult = await runHarnessTurn(runtime, {
    tool: 'glob',
    input: { pattern: 'alpha.txt' },
  });
  assert.equal(globResult.ok, true);
  assert.equal(globResult.matches[0], path.join(root, 'docs/alpha.txt'));
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
