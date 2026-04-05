import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentInbox } from '../src/agents/inbox.js';
import { TaskScheduler } from '../src/tasks/scheduler.js';
import { TaskStore } from '../src/tasks/store.js';
import { AgentManager } from '../src/agents/manager.js';
import { AgentOrchestrator } from '../src/agents/orchestrator.js';

test('AgentInbox routes and consumes messages per agent', () => {
  const inbox = new AgentInbox();
  inbox.send('agent-1', { body: 'hello' });
  inbox.send('agent-1', { body: 'again' });
  inbox.send('agent-2', { body: 'world' });
  assert.equal(inbox.count('agent-1'), 2);
  assert.equal(inbox.peek('agent-1').body, 'hello');
  assert.equal(inbox.consume('agent-1', 1)[0].body, 'hello');
  assert.equal(inbox.pop('agent-1').body, 'again');
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
  const first = await orchestrator.runReadyTasks();
  assert.equal(first.length, 2);
  assert.equal(tasks.get('task-1').status, 'completed');
  assert.equal(tasks.get('task-2').status, 'retryable');
  const second = await orchestrator.runReadyTasks();
  assert.equal(second.length, 1);
  assert.equal(tasks.get('task-2').status, 'completed');
});
