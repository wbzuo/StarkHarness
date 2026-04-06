export class AgentManager {
  #agents = new Map();
  #seq = 0;

  constructor(initialAgents = []) {
    initialAgents.forEach((agent) => this.#agents.set(agent.id, agent));
    // Restore sequence counter so auto-IDs never collide with loaded agents
    for (const agent of initialAgents) {
      const match = String(agent.id ?? '').match(/(\d+)$/);
      if (match) this.#seq = Math.max(this.#seq, Number(match[1]));
    }
  }

  spawn({
    role = 'executor',
    scope = 'default',
    status = 'idle',
    id,
    prompt = '',
    model = 'inherit',
    isolation = 'local',
    tools = [],
    description = '',
    color = 'blue',
    swarmId = null,
  } = {}) {
    const agentId = id ?? `agent-${++this.#seq}`;
    const agent = {
      id: agentId,
      role,
      scope,
      status,
      prompt,
      model,
      isolation,
      tools,
      description,
      color,
      swarmId,
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

  matchAgent(query, candidates = null) {
    const lower = query.toLowerCase();
    let best = null;
    let bestScore = 0;
    const pool = Array.isArray(candidates) ? candidates : this.#agents.values();
    for (const agent of pool) {
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

  listByStatus(status) {
    return this.list().filter((agent) => (agent.status ?? 'idle') === status);
  }
}
