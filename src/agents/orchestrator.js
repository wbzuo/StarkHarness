export class AgentOrchestrator {
  constructor({ agents, tasks, scheduler, executor, inbox }) {
    this.agents = agents;
    this.tasks = tasks;
    this.scheduler = scheduler;
    this.executor = executor;
    this.inbox = inbox;
  }

  async runReadyTasks({ parallel = true } = {}) {
    const ready = this.scheduler.listReady();
    const assignments = [];
    for (const task of ready) {
      const agent = this.scheduler.selectAgent(task);
      if (!agent) continue;
      this.scheduler.assign(task, agent);
      this.agents.update(agent.id, { status: 'running', currentTaskId: task.id });
      assignments.push({ task, agent });
    }

    const runAssignment = async ({ task, agent }) => {
      try {
        const result = await this.executor.execute(agent, task);
        this.tasks.update(task.id, { status: 'completed', result, completedAt: new Date().toISOString() });
        this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastResult: result.finalText ?? '' });
        this.inbox.send(agent.id, { from: 'orchestrator', body: `Task ${task.id} completed`, status: 'delivered' });
        return { agentId: agent.id, taskId: task.id, finalText: result.finalText, stopReason: result.stopReason };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const current = this.tasks.get(task.id);
        const maxRetries = Number(current?.maxRetries ?? 0);
        const attempts = Number(current?.attempts ?? 0);
        if (attempts < maxRetries) {
          this.scheduler.markRetryable(task.id, message);
        } else {
          this.tasks.update(task.id, { status: 'failed', error: message, failedAt: new Date().toISOString() });
        }
        this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastError: message });
        this.inbox.send(agent.id, { from: 'orchestrator', body: `Task ${task.id} failed: ${message}`, status: 'delivered' });
        return { agentId: agent.id, taskId: task.id, error: message };
      }
    };

    return parallel
      ? Promise.all(assignments.map(runAssignment))
      : assignments.reduce(async (accP, assignment) => {
          const acc = await accP;
          acc.push(await runAssignment(assignment));
          return acc;
        }, Promise.resolve([]));
  }

  consumeInbox(agentId, { limit = Infinity } = {}) {
    return this.inbox.consume(agentId, limit);
  }
}
