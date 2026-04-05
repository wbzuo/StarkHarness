export class AgentInbox {
  #messages = new Map();

  constructor(initialState = {}) {
    for (const [agentId, messages] of Object.entries(initialState)) {
      this.#messages.set(agentId, [...messages]);
    }
  }

  ensure(agentId) {
    if (!this.#messages.has(agentId)) this.#messages.set(agentId, []);
    return this.#messages.get(agentId);
  }

  send(agentId, message) {
    const inbox = this.ensure(agentId);
    const envelope = {
      id: message.id ?? `msg-${inbox.length + 1}`,
      to: agentId,
      from: message.from ?? 'runtime',
      body: message.body ?? '',
      sentAt: message.sentAt ?? new Date().toISOString(),
      status: message.status ?? 'queued',
    };
    inbox.push(envelope);
    return envelope;
  }

  list(agentId) {
    return [...(this.#messages.get(agentId) ?? [])];
  }

  pop(agentId) {
    const inbox = this.ensure(agentId);
    return inbox.shift() ?? null;
  }

  snapshot() {
    return Object.fromEntries([...this.#messages.entries()].map(([agentId, messages]) => [agentId, [...messages]]));
  }
}
