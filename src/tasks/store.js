export class TaskStore {
  #tasks = new Map();
  #seq = 0;

  constructor(initialTasks = []) {
    initialTasks.forEach((task) => this.#tasks.set(task.id, task));
    for (const task of initialTasks) {
      const match = String(task.id ?? '').match(/(\d+)$/);
      if (match) this.#seq = Math.max(this.#seq, Number(match[1]));
    }
  }

  create(task) {
    const next = {
      id: task.id ?? `task-${++this.#seq}`,
      status: task.status ?? 'pending',
      owner: task.owner ?? null,
      ...task,
    };
    this.#tasks.set(next.id, next);
    return next;
  }

  list() {
    return [...this.#tasks.values()];
  }

  update(id, patch) {
    const current = this.#tasks.get(id);
    if (!current) throw new Error(`Unknown task: ${id}`);
    const next = { ...current, ...patch };
    this.#tasks.set(id, next);
    return next;
  }

  snapshot() {
    return this.list();
  }

  get(id) {
    return this.#tasks.get(id);
  }
}

