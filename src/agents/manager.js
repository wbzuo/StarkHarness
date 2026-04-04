export class AgentManager {
  #agents = new Map();

  spawn({ role = 'executor', scope = 'default', status = 'idle' } = {}) {
    const id = `agent-${this.#agents.size + 1}`;
    const agent = { id, role, scope, status };
    this.#agents.set(id, agent);
    return agent;
  }

  list() {
    return [...this.#agents.values()];
  }
}
