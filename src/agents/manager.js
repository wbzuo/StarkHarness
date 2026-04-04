export class AgentManager {
  #agents = new Map();

  constructor(initialAgents = []) {
    initialAgents.forEach((agent) => this.#agents.set(agent.id, agent));
  }

  spawn({
    role = 'executor',
    scope = 'default',
    status = 'idle',
    id,
    prompt = '',
    model = 'inherit',
    tools = [],
    description = '',
    color = 'blue',
  } = {}) {
    const agentId = id ?? `agent-${this.#agents.size + 1}`;
    const agent = {
      id: agentId,
      role,
      scope,
      status,
      prompt,
      model,
      tools,
      description,
      color,
      createdAt: new Date().toISOString(),
    };
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

  get(id) {
    return this.#agents.get(id);
  }

  matchAgent(query) {
    const lower = query.toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const agent of this.#agents.values()) {
      const desc = (agent.description + ' ' + agent.role).toLowerCase();
      const words = lower.split(/\s+/);
      const score = words.filter((w) => desc.includes(w) && w.length > 2).length;
      if (score > bestScore) { best = agent; bestScore = score; }
    }
    return best;
  }

  list() {
    return [...this.#agents.values()];
  }

  snapshot() {
    return this.list();
  }
}
