export class AgentManager {
  #agents = new Map();

  constructor(initialAgents = []) {
    initialAgents.forEach((agent) => this.#agents.set(agent.id, agent));
  }

  spawn({ role = 'executor', scope = 'default', status = 'idle', id } = {}) {
    const agentId = id ?? `agent-${this.#agents.size + 1}`;
    const agent = { id: agentId, role, scope, status };
    this.#agents.set(agent.id, agent);
    return agent;
  }

  update(id, patch) {
    const current = this.#agents.get(id);
    if (!current) throw new Error(`Unknown agent: ${id}`);
    const next = { ...current, ...patch };
    this.#agents.set(id, next);
    return next;
  }

  list() {
    return [...this.#agents.values()];
  }

  snapshot() {
    return this.list();
  }
}
