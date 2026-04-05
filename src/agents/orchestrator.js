export class AgentOrchestrator {
  constructor({ agents, tasks, scheduler, executor, inbox }) {
    this.agents = agents;
    this.tasks = tasks;
    this.scheduler = scheduler;
    this.executor = executor;
    this.inbox = inbox;
  }

  async runReadyTasks() {
    const ready = this.scheduler.listReady();
    const results = [];
    for (const task of ready) {
      const agent = this.scheduler.selectAgent(task);
      if (!agent) continue;
      this.scheduler.assign(task, agent);
      this.agents.update(agent.id, { status: 'running', currentTaskId: task.id });
      try {
        const result = await this.executor.execute(agent, task);
        this.tasks.update(task.id, { status: 'completed', result, completedAt: new Date().toISOString() });
        this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastResult: result.finalText ?? '' });
        this.inbox.send(agent.id, { from: 'orchestrator', body: `Task ${task.id} completed`, status: 'delivered' });
        results.push({ agentId: agent.id, taskId: task.id, finalText: result.finalText, stopReason: result.stopReason });
      } catch (error) {
        this.tasks.update(task.id, { status: 'failed', error: error instanceof Error ? error.message : String(error), failedAt: new Date().toISOString() });
        this.agents.update(agent.id, { status: 'idle', currentTaskId: null, lastError: error instanceof Error ? error.message : String(error) });
        results.push({ agentId: agent.id, taskId: task.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }
}
