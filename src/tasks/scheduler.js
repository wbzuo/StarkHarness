function priorityOf(task) {
  return Number(task.priority ?? 0);
}

function buildDependencyMap(tasks) {
  return new Map(tasks.map((task) => [task.id, task.dependsOn ?? []]));
}

function detectCycles(tasks) {
  const graph = buildDependencyMap(tasks);
  const visiting = new Set();
  const visited = new Set();
  const cyclic = new Set();

  function dfs(node) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      cyclic.add(node);
      return;
    }
    visiting.add(node);
    for (const dep of graph.get(node) ?? []) {
      if (graph.has(dep)) dfs(dep);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) dfs(node);
  return cyclic;
}

export class TaskScheduler {
  constructor({ tasks, agents }) {
    this.tasks = tasks;
    this.agents = agents;
  }

  listReady() {
    const all = this.tasks.list();
    const done = new Set(all.filter((task) => task.status === 'completed').map((task) => task.id));
    const retryableStatuses = new Set(['pending', 'retryable']);
    const cyclic = detectCycles(all);
    return all
      .filter((task) => retryableStatuses.has(task.status ?? 'pending'))
      .filter((task) => !cyclic.has(task.id))
      .filter((task) => (task.dependsOn ?? []).every((dep) => done.has(dep)))
      .filter((task) => {
        if ((task.status ?? 'pending') !== 'retryable') return true;
        const maxRetries = Number(task.maxRetries ?? 0);
        const attempts = Number(task.attempts ?? 0);
        return attempts < maxRetries;
      })
      .sort((a, b) => priorityOf(b) - priorityOf(a));
  }

  listBlocked() {
    const all = this.tasks.list();
    const cyclic = detectCycles(all);
    return all.filter((task) => cyclic.has(task.id)).map((task) => ({ ...task, blockedReason: 'dependency-cycle' }));
  }

  selectAgent(task, { excludeAgentIds = new Set() } = {}) {
    if (task.owner && !excludeAgentIds.has(task.owner)) return this.agents.get(task.owner) ?? null;
    const idle = this.agents.listByStatus('idle').filter((agent) => !excludeAgentIds.has(agent.id));
    if (idle.length === 0) return null;
    if (task.role) return idle.find((agent) => agent.role === task.role) ?? idle[0];
    if (task.subject || task.description) {
      return this.agents.matchAgent(`${task.subject ?? ''} ${task.description ?? ''}`) ?? idle[0];
    }
    return idle[0];
  }

  assign(task, agent) {
    return this.tasks.update(task.id, {
      owner: agent.id,
      status: 'assigned',
      assignedAt: new Date().toISOString(),
      attempts: Number(task.attempts ?? 0) + 1,
    });
  }

  markRetryable(taskId, error) {
    const task = this.tasks.get(taskId);
    return this.tasks.update(taskId, {
      status: 'retryable',
      error,
      lastFailedAt: new Date().toISOString(),
      attempts: Number(task?.attempts ?? 0),
    });
  }

  markCancelled(taskId, reason = 'cancelled') {
    return this.tasks.update(taskId, {
      status: 'cancelled',
      error: reason,
      cancelledAt: new Date().toISOString(),
    });
  }

  markTimedOut(taskId, timeoutMs) {
    return this.tasks.update(taskId, {
      status: 'retryable',
      error: `timeout:${timeoutMs}`,
      lastFailedAt: new Date().toISOString(),
    });
  }
}
