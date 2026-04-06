import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRuntime } from '../src/kernel/runtime.js';

const execFileAsync = promisify(execFile);

test('coordinator mode toggles and affects runtime prompting', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-coordinator-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'coordinator' },
  });

  await runtime.dispatchCommand('enter-coordinator-mode');
  const status = await runtime.dispatchCommand('coordinator-status');
  assert.equal(status.enabled, true);

  const capturedToolCalls = [];
  runtime.providers.completeWithStrategy = async ({ request }) => {
    capturedToolCalls.push((request.tools ?? []).map((tool) => tool.name).sort());
    return {
      text: 'coordinated',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: {},
    };
  };

  const result = await runtime.run('Coordinate this task');
  assert.match(result.finalText, /coordinated/);
  assert.ok(capturedToolCalls.some((call) => JSON.stringify(call) === JSON.stringify(['send_message', 'spawn_agent', 'tasks'])));

  await runtime.dispatchCommand('exit-coordinator-mode');
  const after = await runtime.dispatchCommand('coordinator-status');
  assert.equal(after.enabled, false);
  await runtime.shutdown();
});

test('agent summaries are persisted after agent execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-agent-summary-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'agent-summary' },
  });
  const agent = runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'summarize work' });
  runtime.providers.completeWithStrategy = async ({ request }) => {
    if (request.systemPrompt?.includes('Summarize the agent result')) {
      return {
        text: JSON.stringify({
          headline: 'LLM summary headline',
          outcome: 'Highlighted the main issues.',
        }),
        toolCalls: [],
        stopReason: 'end_turn',
        usage: {},
      };
    }
    return {
      text: 'Finished the review and highlighted the main issues.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: {},
    };
  };

  await runtime.executor.execute(agent, { id: 'task-1', subject: 'review api', description: 'review the API surface' });
  const summary = await runtime.dispatchCommand('agent-summary', { agent: 'agent-1' });
  assert.equal(summary.headline, 'LLM summary headline');
  assert.equal(summary.outcome, 'Highlighted the main issues.');
  assert.equal(summary.strategy, 'llm');
  assert.equal(summary.executionKind, 'task');
  await runtime.shutdown();
});

test('enter-worktree creates and switches into a git worktree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-worktree-'));
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: root });
  await writeFile(path.join(root, 'README.md'), '# test\n', 'utf8');
  await execFileAsync('git', ['add', 'README.md'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: root });

  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'worktree' },
  });

  const result = await runtime.dispatchCommand('enter-worktree', { branch: 'feature-x' });
  assert.equal(result.ok, true);
  assert.match(result.worktreePath, /feature-x/);
  const branchFile = await readFile(path.join(result.worktreePath, 'README.md'), 'utf8');
  assert.match(branchFile, /test/);
  assert.equal(runtime.context.cwd, result.worktreePath);

  const exited = await runtime.dispatchCommand('exit-worktree');
  assert.equal(exited.cwd, root);
  assert.equal(runtime.context.cwd, root);
  await runtime.shutdown();
});
