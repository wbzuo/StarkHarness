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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const pending = inbox.awaitResponse('agent-0', 'corr-1', { timeoutMs: 100 });
  inbox.send('agent-0', { kind: 'response', correlationId: 'corr-1', from: 'agent-1', body: 'pong' });
  const response = await pending;
  assert.equal(response.body, 'pong');
  assert.equal(response.correlationId, 'corr-1');
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

test('TaskScheduler increments attempts when marking retryable', () => {
  const tasks = new TaskStore([{ id: 'task-1', status: 'assigned', attempts: 0, maxRetries: 1 }]);
  const agents = new AgentManager([{ id: 'agent-1', role: 'reviewer', status: 'idle' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  scheduler.markRetryable('task-1', 'boom');
  assert.equal(tasks.get('task-1').attempts, 1);
  assert.deepEqual(scheduler.listReady(), []);
});

test('TaskScheduler blocks cyclic dependencies', () => {
  const tasks = new TaskStore([
    { id: 'task-1', status: 'pending', dependsOn: ['task-2'] },
    { id: 'task-2', status: 'pending', dependsOn: ['task-1'] },
  ]);
  const agents = new AgentManager([{ id: 'agent-1', status: 'idle', role: 'reviewer' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  assert.deepEqual(scheduler.listReady(), []);
  assert.deepEqual(new Set(scheduler.listBlocked().map((task) => task.id)), new Set(['task-1', 'task-2']));
});

test('TaskScheduler applies inbox backpressure when selecting agents', () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'review service', status: 'pending' }]);
  const agents = new AgentManager([
    { id: 'agent-1', role: 'reviewer', status: 'idle', description: 'review backend services' },
    { id: 'agent-2', role: 'reviewer', status: 'idle', description: 'review service APIs' },
  ]);
  const inbox = new AgentInbox();
  inbox.send('agent-1', { from: 'runtime', body: 'busy' });
  const scheduler = new TaskScheduler({ tasks, agents });
  const selected = scheduler.selectAgent(tasks.get('task-1'), {
    preferredAgents: agents.listByStatus('idle'),
    inbox,
    maxInboxSize: 1,
  });
  assert.equal(selected.id, 'agent-2');
});

test('TaskStore preserves auto ids after custom ids', () => {
  const tasks = new TaskStore();
  tasks.create({ id: 'task-42', subject: 'manual' });
  const created = tasks.create({ subject: 'auto' });
  assert.equal(created.id, 'task-43');
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

test('AgentOrchestrator rotates idle agents fairly across runs', async () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'first', status: 'pending' }]);
  const agents = new AgentManager([
    { id: 'agent-1', role: 'reviewer', status: 'idle', description: 'first reviewer' },
    { id: 'agent-2', role: 'reviewer', status: 'idle', description: 'second reviewer' },
  ]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  const assignments = [];
  const executor = {
    execute: async (agent, task) => {
      assignments.push({ agentId: agent.id, taskId: task.id });
      return { finalText: `done:${task.id}`, stopReason: 'end_turn' };
    },
  };
  const orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor, inbox });
  await orchestrator.runReadyTasks({ parallel: false, concurrency: 1 });
  tasks.create({ id: 'task-2', subject: 'second', status: 'pending' });
  tasks.update('task-2', { status: 'pending' });
  await orchestrator.runReadyTasks({ parallel: false, concurrency: 1 });
  assert.deepEqual(assignments.map((entry) => entry.agentId), ['agent-1', 'agent-2']);
});

test('AgentOrchestrator worker loop consumes inbox requests and writes replies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-worker-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'worker' } });
  runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'reply to messages' });
  const request = runtime.inbox.request('agent-1', { from: 'agent-0', body: 'hello worker' });
  runtime.executor.executeMessage = async (agent) => {
    await runtime.state.saveAgentState(agent.id, { handledMessages: 1 });
    return { finalText: 'pong', stopReason: 'end_turn', usage: {} };
  };
  runtime.startWorker('agent-1', { pollIntervalMs: 1, maxMessagesPerTick: 1, timeoutMs: 100 });
  const reply = await runtime.awaitResponse('agent-0', request.correlationId, { timeoutMs: 200 });
  await wait(5);
  const worker = runtime.listWorkers().find((entry) => entry.agentId === 'agent-1');
  await runtime.stopWorker('agent-1');
  assert.equal(reply.body, 'pong');
  assert.equal(worker.processedMessages >= 1, true);
  assert.equal(worker.processedRequests >= 1, true);
  const agentState = await runtime.state.loadAgentState('agent-1');
  assert.equal(agentState.handledMessages >= 1, true);
  await runtime.shutdown();
});

test('AgentOrchestrator forwards onTextChunk into executor runs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-streaming-agent-'));
  const runtime = await createRuntime({ stateDir: path.join(root, '.starkharness'), session: { cwd: root, goal: 'streaming' } });
  const agent = runtime.agents.spawn({ id: 'agent-1', role: 'reviewer', description: 'streams results' });
  const task = runtime.tasks.create({ id: 'task-1', subject: 'stream', status: 'pending' });
  const chunks = [];

  runtime.providers.completeWithStrategy = async ({ request }) => {
    await request.onTextChunk?.('hello');
    return { text: 'hello', toolCalls: [], stopReason: 'end_turn', usage: {}, streamed: true };
  };

  const result = await runtime.orchestrator.runReadyTasks({
    parallel: false,
    onTextChunk: async (chunk) => {
      chunks.push(chunk);
    },
  });

  assert.equal(result.length, 1);
  assert.deepEqual(chunks, ['hello']);
  assert.equal(runtime.tasks.get(task.id).status, 'completed');
  await runtime.shutdown();
});

test('AgentOrchestrator restarts failed workers within the configured budget', async () => {
  const tasks = new TaskStore();
  const agents = new AgentManager([{ id: 'agent-1', role: 'reviewer', status: 'idle', description: 'worker agent' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  const executor = { executeMessage: async () => ({ finalText: 'ok', stopReason: 'end_turn' }) };
  const orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor, inbox });
  const originalConsumeWork = inbox.consumeWork.bind(inbox);
  let boom = true;
  inbox.consumeWork = (...args) => {
    if (boom) {
      boom = false;
      throw new Error('worker-crash');
    }
    return originalConsumeWork(...args);
  };
  orchestrator.startWorker('agent-1', { pollIntervalMs: 1, maxRestarts: 1, restartDelayMs: 1 });
  await wait(20);
  const worker = orchestrator.listWorkers()[0];
  assert.equal(worker.restarts, 1);
  assert.ok(['running', 'restarting'].includes(worker.status));
  await orchestrator.stopWorker('agent-1');
});
