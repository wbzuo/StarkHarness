import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentInbox } from '../src/agents/inbox.js';
import { TaskScheduler } from '../src/tasks/scheduler.js';
import { TaskStore } from '../src/tasks/store.js';
import { AgentManager } from '../src/agents/manager.js';
import { AgentOrchestrator } from '../src/agents/orchestrator.js';

test('AgentInbox routes messages per agent', () => {
  const inbox = new AgentInbox();
  inbox.send('agent-1', { body: 'hello' });
  inbox.send('agent-2', { body: 'world' });
  assert.equal(inbox.list('agent-1').length, 1);
  assert.equal(inbox.list('agent-2').length, 1);
  assert.equal(inbox.pop('agent-1').body, 'hello');
});

test('TaskScheduler selects idle agent and assigns task', () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'review auth', status: 'pending' }]);
  const agents = new AgentManager([{ id: 'agent-1', role: 'reviewer', status: 'idle', description: 'review auth code' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const task = scheduler.listReady()[0];
  const agent = scheduler.selectAgent(task);
  scheduler.assign(task, agent);
  assert.equal(agent.id, 'agent-1');
  assert.equal(tasks.get('task-1').owner, 'agent-1');
});

test('AgentOrchestrator executes ready tasks through executor', async () => {
  const tasks = new TaskStore([{ id: 'task-1', subject: 'review auth', status: 'pending' }]);
  const agents = new AgentManager([{ id: 'agent-1', role: 'reviewer', status: 'idle', description: 'review auth code' }]);
  const scheduler = new TaskScheduler({ tasks, agents });
  const inbox = new AgentInbox();
  const executor = { execute: async () => ({ finalText: 'done', stopReason: 'end_turn' }) };
  const orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor, inbox });
  const results = await orchestrator.runReadyTasks();
  assert.equal(results.length, 1);
  assert.equal(tasks.get('task-1').status, 'completed');
  assert.equal(inbox.list('agent-1').length, 1);
});
