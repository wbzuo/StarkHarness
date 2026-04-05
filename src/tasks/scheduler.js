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

  function dfs(node, trail = []) {
    if (visiting.has(node)) {
      const cycleStart = trail.indexOf(node);
      for (const member of trail.slice(cycleStart)) cyclic.add(member);
      cyclic.add(node);
      return;
    }
    if (visited.has(node)) return;
    visiting.add(node);
    for (const dep of graph.get(node) ?? []) {
      if (graph.has(dep)) dfs(dep, [...trail, node]);
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

  selectAgent(task, { excludeAgentIds = new Set(), preferredAgents = null, maxInboxSize = Infinity, inbox = null } = {}) {
    if (task.owner && !excludeAgentIds.has(task.owner)) {
      const owned = this.agents.get(task.owner) ?? null;
      if (!owned) return null;
      if (owned.status !== 'idle') return null;
      if (inbox && inbox.count(owned.id) >= maxInboxSize) return null;
      return owned;
    }
    const candidatePool = Array.isArray(preferredAgents)
      ? preferredAgents
      : this.agents.listByStatus('idle');
    const idle = candidatePool.filter((agent) => {
      if (excludeAgentIds.has(agent.id)) return false;
      if (agent.status !== 'idle') return false;
      if (inbox && inbox.count(agent.id) >= maxInboxSize) return false;
      return true;
    });
    if (idle.length === 0) return null;
    if (task.role) return idle.find((agent) => agent.role === task.role) ?? idle[0];
    if (task.subject || task.description) {
      const ranked = this.agents.matchAgent(`${task.subject ?? ''} ${task.description ?? ''}`, idle);
      return ranked ?? idle[0];
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
