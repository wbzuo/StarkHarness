import { setTimeout as delay } from 'node:timers/promises';

function createAbortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

async function raceWithControls(taskPromiseFactory, { signal, timeoutMs } = {}) {
  const guards = [];
  if (signal) {
    if (signal.aborted) throw createAbortError();
    guards.push(new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
    }));
  }
  if (timeoutMs) {
    guards.push(delay(timeoutMs, undefined, { ref: false }).then(() => {
      const error = new Error(`timeout:${timeoutMs}`);
      error.name = 'TimeoutError';
      throw error;
    }));
  }
  return Promise.race([taskPromiseFactory(), ...guards]);
}

export class AgentOrchestrator {
  #workers = new Map();

  constructor({ agents, tasks, scheduler, executor, inbox }) {
    this.agents = agents;
    this.tasks = tasks;
    this.scheduler = scheduler;
    this.executor = executor;
    this.inbox = inbox;
  }

  async #runAssignment({ task, agent }, { signal, timeoutMs } = {}) {
    try {
      const result = await raceWithControls(() => this.executor.execute(agent, task), { signal, timeoutMs });
      this.tasks.update(task.id, { status: 'completed', result, completedAt: new Date().toISOString() });
      this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastResult: result.finalText ?? '' });
      this.inbox.send(agent.id, { from: 'orchestrator', body: `Task ${task.id} completed`, status: 'delivered' });
      return { agentId: agent.id, taskId: task.id, finalText: result.finalText, stopReason: result.stopReason };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error?.name === 'AbortError') {
        this.scheduler.markCancelled(task.id, message);
      } else if (error?.name === 'TimeoutError') {
        this.scheduler.markTimedOut(task.id, timeoutMs);
      } else {
        const current = this.tasks.get(task.id);
        const maxRetries = Number(current?.maxRetries ?? 0);
        const attempts = Number(current?.attempts ?? 0);
        if (attempts < maxRetries) {
          this.scheduler.markRetryable(task.id, message);
        } else {
          this.tasks.update(task.id, { status: 'failed', error: message, failedAt: new Date().toISOString() });
        }
      }
      this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastError: message });
      this.inbox.send(agent.id, { from: 'orchestrator', body: `Task ${task.id} failed: ${message}`, status: 'delivered' });
      return { agentId: agent.id, taskId: task.id, error: message };
    }
  }

  async runReadyTasks({ parallel = true, concurrency = Infinity, signal, timeoutMs } = {}) {
    const ready = this.scheduler.listReady();
    const assignments = [];
    const reserved = new Set();
    for (const task of ready) {
      const agent = this.scheduler.selectAgent(task, { excludeAgentIds: reserved });
      if (!agent) continue;
      this.scheduler.assign(task, agent);
      this.agents.update(agent.id, { status: 'running', currentTaskId: task.id });
      reserved.add(agent.id);
      assignments.push({ task, agent });
    }

    if (!parallel) {
      const results = [];
      for (const assignment of assignments) {
        if (signal?.aborted) break;
        results.push(await this.#runAssignment(assignment, { signal, timeoutMs }));
      }
      return results;
    }

    const limit = Number.isFinite(concurrency) ? Math.max(1, concurrency) : assignments.length || 1;
    const queue = [...assignments];
    const results = [];
    const worker = async () => {
      while (queue.length > 0) {
        if (signal?.aborted) break;
        const next = queue.shift();
        if (!next) break;
        results.push(await this.#runAssignment(next, { signal, timeoutMs }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, assignments.length || 0) }, worker));
    return results;
  }

  async processInboxMessage(agentId, message, controls = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) return { agentId, error: 'unknown-agent' };
    this.agents.update(agent.id, { status: 'running', currentMessageId: message.id });
    try {
      const result = await raceWithControls(() => this.executor.executeMessage(agent, message), controls);
      this.agents.update(agent.id, { status: 'idle', currentMessageId: null, lastResult: result.finalText ?? '' });
      if (message.kind === 'request' && message.expectReply !== false) {
        this.inbox.respond(message, { from: agent.id, body: result.finalText ?? '', payload: result });
      }
      return { agentId, messageId: message.id, finalText: result.finalText };
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.agents.update(agent.id, { status: 'idle', currentMessageId: null, lastError: messageText });
      if (message.kind === 'request' && message.expectReply !== false) {
        this.inbox.respond(message, { from: agent.id, body: messageText, payload: { error: messageText }, status: 'failed' });
      }
      return { agentId, messageId: message.id, error: messageText };
    }
  }

  startWorker(agentId, { pollIntervalMs = 50, maxMessagesPerTick = 1, timeoutMs = 120000 } = {}) {
    if (this.#workers.has(agentId)) return this.#workers.get(agentId);
    const controller = new AbortController();
    const loop = (async () => {
      while (!controller.signal.aborted) {
        const messages = this.inbox.consumeWork(agentId, maxMessagesPerTick);
        if (messages.length === 0) {
          await delay(pollIntervalMs, undefined, { ref: false });
          continue;
        }
        for (const message of messages) {
          if (controller.signal.aborted) break;
          await this.processInboxMessage(agentId, message, { signal: controller.signal, timeoutMs });
        }
      }
    })();
    const worker = { agentId, controller, pollIntervalMs, maxMessagesPerTick, timeoutMs, promise: loop };
    this.#workers.set(agentId, worker);
    return worker;
  }

  async stopWorker(agentId) {
    const worker = this.#workers.get(agentId);
    if (!worker) return false;
    worker.controller.abort();
    await worker.promise.catch(() => {});
    this.#workers.delete(agentId);
    return true;
  }

  listWorkers() {
    return [...this.#workers.values()].map(({ agentId, pollIntervalMs, maxMessagesPerTick, timeoutMs }) => ({ agentId, pollIntervalMs, maxMessagesPerTick, timeoutMs }));
  }

  consumeInbox(agentId, { limit = Infinity } = {}) {
    return this.inbox.consume(agentId, limit);
  }
}
