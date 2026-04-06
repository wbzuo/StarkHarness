import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

test('session transcript captures user, assistant, and tool events', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-transcript-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'transcript' },
  });

  runtime.providers.completeWithStrategy = async () => ({
    text: 'hello world',
    toolCalls: [],
    stopReason: 'end_turn',
    usage: {},
  });

  await runtime.run('say hello');
  const transcript = await runtime.dispatchCommand('session-transcript');
  assert.ok(transcript.some((entry) => entry.role === 'user'));
  assert.ok(transcript.some((entry) => entry.role === 'assistant'));
  await runtime.shutdown();
});

test('memory extraction writes auto-memory file from LLM output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-memory-extract-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'memory-extract' },
  });

  let callIndex = 0;
  runtime.providers.completeWithStrategy = async ({ request }) => {
    callIndex += 1;
    if (callIndex === 1) {
      return { text: 'Completed the task.', toolCalls: [], stopReason: 'end_turn', usage: {} };
    }
    return { text: '["User prefers concise answers","Repository uses Node.js"]', toolCalls: [], stopReason: 'end_turn', usage: {} };
  };

  await runtime.run('remember my preferences');
  const memoryPath = path.join(root, '.starkharness', 'memory', 'auto-memory.md');
  const content = await readFile(memoryPath, 'utf8');
  assert.match(content, /User prefers concise answers/);
  assert.match(content, /Repository uses Node.js/);
  await runtime.shutdown();
});

test('interactive permission ask callback can approve shell execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-permission-ask-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'permission-ask' },
    permissions: { exec: 'ask' },
    requestPermission: async ({ toolName }) => toolName === 'shell',
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'shell',
    input: { command: 'echo hello' },
  });

  assert.equal(result.ok, true);
  assert.match(result.stdout, /hello/);
  await runtime.shutdown();
});
