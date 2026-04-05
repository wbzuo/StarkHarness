import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AgentInbox } from '../src/agents/inbox.js';
import { TaskScheduler } from '../src/tasks/scheduler.js';
import { TaskStore } from '../src/tasks/store.js';
import { AgentManager } from '../src/agents/manager.js';
import { AgentOrchestrator } from '../src/agents/orchestrator.js';
import { createRuntime } from '../src/kernel/runtime.js';

test('AgentInbox routes, consumes, and supports RPC responses', () => {
  const inbox = new AgentInbox();
  const req = inbox.request('agent-1', { from: 'agent-0', body: 'ping' });
  inbox.respond(req, { from: 'agent-1', body: 'pong' });
  assert.equal(inbox.count('agent-1'), 1);
  assert.equal(inbox.findResponse('agent-0', req.correlationId).body, 'pong');
  assert.equal(inbox.consumeWork('agent-0').length, 0);
});

test('AgentInbox awaitResponse resolves pending RPC replies', async () => {
  const inbox = new AgentInbox();
  const req = inbox.request('agent-1', { from: 'agent-0', body: 'ping' });
  const pending = inbox.awaitResponse('agent-0', req.correlationId, { timeoutMs: 100 });
  setTimeout(() => {
    inbox.respond(req, { from: 'agent-1', body: 'pong' });
  }, 5);
  const response = await pending;
  assert.equal(response.body, 'pong');
  assert.equal(response.inReplyTo, req.id);
});

test('TaskScheduler respects dependencies and retry budget', () => {
  const tasks = new TaskStore([
    { id: 'task-1', subject: 'base', status: 'completed' },
    { id: 'task-2', subject: 'review auth', status: 'pending', dependsOn: ['task-1'] },
    { id: 'task-3', subject: 'retry me', status: 'retryable', attempts: 1, maxRetries: 2 },
    { id: 'task-4', subject: 'exhausted', status: 'retryable', attempts: 2, maxRetries: 2 },
  ]);
  const agents = new AgentManager([{ id: 'agent-1', role: 'reviewer', status: 'idle', description: 'review auth code' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const readyIds = scheduler.listReady().map((task) => task.id);
  assert.ok(readyIds.includes('task-2'));
  assert.ok(readyIds.includes('task-3'));
  assert.ok(!readyIds.includes('task-4'));
});

test('TaskScheduler applies inbox backpressure when selecting agents', () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'review auth', status: 'pending' }]);
  const agents = new AgentManager([
    { id: 'agent-1', role: 'reviewer', status: 'idle', description: 'review auth code' },
    { id: 'agent-2', role: 'reviewer', status: 'idle', description: 'review billing code' },
  ]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  inbox.send('agent-1', { body: 'busy-1' });
  inbox.send('agent-1', { body: 'busy-2' });
  const agent = scheduler.selectAgent(tasks.get('task-1'), {
    maxInboxSize: 1,
    inbox,
  });
  assert.equal(agent.id, 'agent-2');
});

test('AgentOrchestrator executes tasks in parallel and retries failures', async () => {
  const tasks = new TaskStore([
    { id: 'task-1', subject: 'fast', status: 'pending', priority: 2 },
    { id: 'task-2', subject: 'flaky', status: 'pending', priority: 1, maxRetries: 2 },
  ]);
  const agents = new AgentManager([
    { id: 'agent-1', role: 'reviewer', status: 'idle', description: 'fast review' },
    { id: 'agent-2', role: 'reviewer', status: 'idle', description: 'flaky review' },
  ]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  let calls = 0;
  const executor = {
    execute: async (_agent, task) => {
      calls += 1;
      if (task.id === 'task-2' && calls === 2) throw new Error('transient');
      return { finalText: `done:${task.id}`, stopReason: 'end_turn' };
    },
  };
  const orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor, inbox });
  const first = await orchestrator.runReadyTasks({ concurrency: 2 });
  assert.equal(first.length, 2);
  assert.equal(tasks.get('task-1').status, 'completed');
  assert.equal(tasks.get('task-2').status, 'retryable');
  const second = await orchestrator.runReadyTasks();
  assert.equal(second.length, 1);
  assert.equal(tasks.get('task-2').status, 'completed');
});

test('AgentOrchestrator rotates idle agents to reduce starvation across runs', async () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'first', status: 'pending' }]);
  const agents = new AgentManager([
    { id: 'agent-1', role: 'reviewer', status: 'idle', description: 'first lane' },
    { id: 'agent-2', role: 'reviewer', status: 'idle', description: 'second lane' },
  ]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  const executor = { execute: async (_agent, task) => ({ finalText: `done:${task.id}`, stopReason: 'end_turn' }) };
  const orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor, inbox });

  await orchestrator.runReadyTasks({ parallel: false });
  assert.equal(tasks.get('task-1').owner, 'agent-1');

  tasks.create({ id: 'task-2', subject: 'second', status: 'pending' });
  await orchestrator.runReadyTasks({ parallel: false });
  assert.equal(tasks.get('task-2').owner, 'agent-2');
});

test('AgentOrchestrator worker loop consumes inbox requests and writes replies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-worker-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'worker' } });
  runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'reply to messages' });
  runtime.inbox.request('agent-1', { from: 'agent-0', body: 'hello worker' });
  runtime.executor.executeMessage = async (agent) => {
    await runtime.state.saveAgentState(agent.id, { handledMessages: 1 });
    return { finalText: 'pong', stopReason: 'end_turn', usage: {} };
  };
  runtime.startWorker('agent-1', { pollIntervalMs: 1, maxMessagesPerTick: 1, timeoutMs: 100 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await runtime.stopWorker('agent-1');
  const replies = runtime.inbox.list('agent-0', { kind: 'response' });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].body, 'pong');
  const agentState = await runtime.state.loadAgentState('agent-1');
  assert.equal(agentState.handledMessages >= 1, true);
  await runtime.shutdown();
});

test('AgentOrchestrator worker supervision restarts transient loop failures', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-restart-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'restart' } });
  runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'recovers after transient errors' });
  const request = runtime.inbox.request('agent-1', { from: 'agent-0', body: 'hello again' });
  const pendingResponse = runtime.awaitResponse('agent-0', request.correlationId, { timeoutMs: 100 });
  runtime.executor.executeMessage = async () => ({ finalText: 'recovered', stopReason: 'end_turn', usage: {} });

  const originalConsumeWork = runtime.inbox.consumeWork.bind(runtime.inbox);
  let consumeCalls = 0;
  runtime.inbox.consumeWork = (...args) => {
    consumeCalls += 1;
    if (consumeCalls === 1) throw new Error('transient-loop-error');
    return originalConsumeWork(...args);
  };

  runtime.startWorker('agent-1', {
    pollIntervalMs: 1,
    maxMessagesPerTick: 1,
    timeoutMs: 100,
    maxRestarts: 1,
    restartDelayMs: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const response = await pendingResponse;
  const replies = runtime.inbox.list('agent-0', { kind: 'response' });
  assert.equal(replies.length, 1);
  assert.equal(replies[0].body, 'recovered');
  assert.equal(response.body, 'recovered');
  const worker = runtime.listWorkers().find((entry) => entry.agentId === 'agent-1');
  assert.equal(worker?.restarts, 1);
  await runtime.stopWorker('agent-1');
  runtime.inbox.consumeWork = originalConsumeWork;
  await runtime.shutdown();
});
