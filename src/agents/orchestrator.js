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
  #cursor = 0;

  constructor({ agents, tasks, scheduler, executor, inbox }) {
    this.agents = agents;
    this.tasks = tasks;
    this.scheduler = scheduler;
    this.executor = executor;
    this.inbox = inbox;
  }

  #orderedIdleAgents() {
    const idle = this.agents.listByStatus('idle');
    if (idle.length <= 1) return idle;
    const start = this.#cursor % idle.length;
    return [...idle.slice(start), ...idle.slice(0, start)];
  }

  #advanceCursor(agents = []) {
    if (agents.length > 0) this.#cursor = (this.#cursor + 1) % agents.length;
  }

  async #runAssignment({ task, agent }, { signal, timeoutMs } = {}) {
    try {
      const result = await raceWithControls(() => this.executor.execute(agent, task), { signal, timeoutMs });
      this.tasks.update(task.id, { status: 'completed', result, completedAt: new Date().toISOString() });
      this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastResult: result.finalText ?? '', lastError: null });
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

  async runReadyTasks({ parallel = true, concurrency = Infinity, signal, timeoutMs, maxInboxSize = Infinity } = {}) {
    const ready = this.scheduler.listReady();
    const assignments = [];
    const reserved = new Set();
    for (const task of ready) {
      const preferredAgents = this.#orderedIdleAgents();
      const agent = this.scheduler.selectAgent(task, {
        excludeAgentIds: reserved,
        preferredAgents,
        maxInboxSize,
        inbox: this.inbox,
      });
      if (!agent) continue;
      this.scheduler.assign(task, agent);
      this.agents.update(agent.id, { status: 'running', currentTaskId: task.id });
      reserved.add(agent.id);
      assignments.push({ task, agent });
      this.#advanceCursor(preferredAgents);
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
      this.agents.update(agent.id, { status: 'idle', currentMessageId: null, lastResult: result.finalText ?? '', lastError: null });
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

  #createWorkerLoop(agentId, worker) {
    return async () => {
      while (!worker.controller.signal.aborted) {
        const messages = this.inbox.consumeWork(agentId, worker.maxMessagesPerTick);
        if (messages.length === 0) {
          await delay(worker.pollIntervalMs, undefined, { ref: false });
          continue;
        }
        for (const message of messages) {
          if (worker.controller.signal.aborted) break;
          await this.processInboxMessage(agentId, message, { signal: worker.controller.signal, timeoutMs: worker.timeoutMs });
        }
      }
    };
  }

  startWorker(agentId, {
    pollIntervalMs = 50,
    maxMessagesPerTick = 1,
    timeoutMs = 120000,
    maxRestarts = 0,
    restartDelayMs = 50,
  } = {}) {
    if (this.#workers.has(agentId)) return this.#workers.get(agentId);
    const worker = {
      agentId,
      controller: new AbortController(),
      pollIntervalMs,
      maxMessagesPerTick,
      timeoutMs,
      maxRestarts,
      restartDelayMs,
      restarts: 0,
      status: 'starting',
      lastError: null,
      promise: null,
    };

    const supervise = async () => {
      while (!worker.controller.signal.aborted) {
        try {
          worker.status = worker.restarts > 0 ? 'restarting' : 'running';
          await this.#createWorkerLoop(agentId, worker)();
          worker.status = 'stopped';
          return;
        } catch (error) {
          worker.lastError = error instanceof Error ? error.message : String(error);
          if (worker.controller.signal.aborted) {
            worker.status = 'stopped';
            return;
          }
          if (worker.restarts >= worker.maxRestarts) {
            worker.status = 'failed';
            throw error;
          }
          worker.restarts += 1;
          worker.status = 'restarting';
          await delay(worker.restartDelayMs, undefined, { ref: false });
        }
      }
      worker.status = 'stopped';
    };

    worker.promise = supervise();
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
    return [...this.#workers.values()].map(({
      agentId,
      pollIntervalMs,
      maxMessagesPerTick,
      timeoutMs,
      maxRestarts,
      restartDelayMs,
      restarts,
      status,
      lastError,
    }) => ({
      agentId,
      pollIntervalMs,
      maxMessagesPerTick,
      timeoutMs,
      maxRestarts,
      restartDelayMs,
      restarts,
      status,
      lastError,
    }));
  }

  consumeInbox(agentId, { limit = Infinity } = {}) {
    return this.inbox.consume(agentId, limit);
  }
}
