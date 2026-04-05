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

  constructor({ agents, tasks, scheduler, executor, inbox, state = null, telemetry = null }) {
    this.agents = agents;
    this.tasks = tasks;
    this.scheduler = scheduler;
    this.executor = executor;
    this.inbox = inbox;
    this.state = state;
    this.telemetry = telemetry;
  }

  #snapshotWorker(worker) {
    return {
      agentId: worker.agentId,
      pollIntervalMs: worker.pollIntervalMs,
      maxMessagesPerTick: worker.maxMessagesPerTick,
      timeoutMs: worker.timeoutMs,
      maxRestarts: worker.maxRestarts,
      restartDelayMs: worker.restartDelayMs,
      restarts: worker.restarts,
      status: worker.status,
      lastError: worker.lastError,
      failures: worker.failures,
      processedMessages: worker.processedMessages,
      processedRequests: worker.processedRequests,
      processedResponses: worker.processedResponses,
      lastStartedAt: worker.lastStartedAt,
      lastStoppedAt: worker.lastStoppedAt,
      lastHeartbeatAt: worker.lastHeartbeatAt,
    };
  }

  async #persistWorker(worker) {
    if (this.state) {
      await this.state.saveAgentWorker(worker.agentId, this.#snapshotWorker(worker));
    }
    if (this.telemetry) {
      await this.telemetry.emit('worker:state', this.#snapshotWorker(worker));
    }
  }

  #orderedIdleAgents() {
    const idle = this.agents
      .listByStatus('idle')
      .sort((left, right) => {
        const backlog = this.inbox.count(left.id) - this.inbox.count(right.id);
        if (backlog !== 0) return backlog;
        const dispatchDelta = Number(left.dispatchCount ?? 0) - Number(right.dispatchCount ?? 0);
        if (dispatchDelta !== 0) return dispatchDelta;
        return left.id.localeCompare(right.id);
      });
    if (idle.length <= 1) return idle;
    const start = this.#cursor % idle.length;
    return [...idle.slice(start), ...idle.slice(0, start)];
  }

  #advanceCursor(agents = []) {
    if (agents.length > 0) this.#cursor = (this.#cursor + 1) % agents.length;
  }

  async #runAssignment({ task, agent }, { signal, timeoutMs, onTextChunk } = {}) {
    try {
      const result = await raceWithControls(() => this.executor.execute(agent, task, { onTextChunk }), { signal, timeoutMs });
      this.tasks.update(task.id, { status: 'completed', result, completedAt: new Date().toISOString() });
      this.agents.update(agent.id, {
        status: 'idle',
        currentTaskId: null,
        lastResult: result.finalText ?? '',
        lastError: null,
        completedTasks: Number(agent.completedTasks ?? 0) + 1,
      });
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

  async runReadyTasks({ parallel = true, concurrency = Infinity, signal, timeoutMs, maxInboxSize = Infinity, onTextChunk } = {}) {
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
      this.agents.update(agent.id, {
        status: 'running',
        currentTaskId: task.id,
        dispatchCount: Number(agent.dispatchCount ?? 0) + 1,
      });
      reserved.add(agent.id);
      assignments.push({ task, agent });
      this.#advanceCursor(preferredAgents);
    }

    if (!parallel) {
      const results = [];
      for (const assignment of assignments) {
        if (signal?.aborted) break;
        results.push(await this.#runAssignment(assignment, { signal, timeoutMs, onTextChunk }));
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
        results.push(await this.#runAssignment(next, { signal, timeoutMs, onTextChunk }));
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
      const result = await raceWithControls(() => this.executor.executeMessage(agent, message, { onTextChunk: controls.onTextChunk }), controls);
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
          worker.lastHeartbeatAt = new Date().toISOString();
          await this.#persistWorker(worker);
          await delay(worker.pollIntervalMs, undefined, { ref: false });
          continue;
        }
        for (const message of messages) {
          if (worker.controller.signal.aborted) break;
          await this.processInboxMessage(agentId, message, { signal: worker.controller.signal, timeoutMs: worker.timeoutMs });
          worker.processedMessages += 1;
          if (message.kind === 'request') worker.processedRequests += 1;
          if (message.kind === 'response') worker.processedResponses += 1;
          worker.lastHeartbeatAt = new Date().toISOString();
          await this.#persistWorker(worker);
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
      failures: 0,
      processedMessages: 0,
      processedRequests: 0,
      processedResponses: 0,
      lastStartedAt: null,
      lastStoppedAt: null,
      lastHeartbeatAt: null,
      promise: null,
    };

    const supervise = async () => {
      while (!worker.controller.signal.aborted) {
        try {
          worker.status = worker.restarts > 0 ? 'restarting' : 'running';
          worker.lastStartedAt = new Date().toISOString();
          await this.#persistWorker(worker);
          await this.#createWorkerLoop(agentId, worker)();
          worker.status = 'stopped';
          worker.lastStoppedAt = new Date().toISOString();
          await this.#persistWorker(worker);
          return;
        } catch (error) {
          worker.lastError = error instanceof Error ? error.message : String(error);
          worker.failures += 1;
          if (worker.controller.signal.aborted) {
            worker.status = 'stopped';
            worker.lastStoppedAt = new Date().toISOString();
            await this.#persistWorker(worker);
            return;
          }
          if (worker.restarts >= worker.maxRestarts) {
            worker.status = 'failed';
            worker.lastStoppedAt = new Date().toISOString();
            this.agents.update(agentId, {
              status: 'failed',
              currentTaskId: null,
              currentMessageId: null,
              lastError: worker.lastError,
            });
            await this.#persistWorker(worker);
            throw error;
          }
          worker.restarts += 1;
          worker.status = 'restarting';
          await this.#persistWorker(worker);
          await delay(worker.restartDelayMs, undefined, { ref: false });
        }
      }
      worker.status = 'stopped';
      await this.#persistWorker(worker);
    };

    worker.promise = supervise();
    this.#workers.set(agentId, worker);
    void this.#persistWorker(worker);
    return worker;
  }

  async stopWorker(agentId) {
    const worker = this.#workers.get(agentId);
    if (!worker) return false;
    worker.controller.abort();
    await worker.promise.catch(() => {});
    await this.#persistWorker(worker);
    this.#workers.delete(agentId);
    return true;
  }

  listWorkers() {
    return [...this.#workers.values()].map((worker) => this.#snapshotWorker(worker));
  }

  consumeInbox(agentId, { limit = Infinity } = {}) {
    return this.inbox.consume(agentId, limit);
  }
}
