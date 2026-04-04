export class TaskStore {
  #tasks = new Map();

  create(task) {
    const next = {
      id: task.id ?? `task-${this.#tasks.size + 1}`,
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
}
