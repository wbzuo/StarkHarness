function priorityOf(task) {
  return Number(task.priority ?? 0);
}

export class TaskScheduler {
  constructor({ tasks, agents }) {
    this.tasks = tasks;
    this.agents = agents;
  }

  listReady() {
    const all = this.tasks.list();
    const done = new Set(all.filter((task) => task.status === 'completed').map((task) => task.id));
    return all
      .filter((task) => (task.status ?? 'pending') === 'pending')
      .filter((task) => (task.dependsOn ?? []).every((dep) => done.has(dep)))
      .sort((a, b) => priorityOf(b) - priorityOf(a));
  }

  selectAgent(task) {
    if (task.owner) return this.agents.get(task.owner) ?? null;
    const idle = this.agents.listByStatus('idle');
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
    });
  }
}
