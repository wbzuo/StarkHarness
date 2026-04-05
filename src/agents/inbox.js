export class AgentInbox {
  #messages = new Map();
  #counters = new Map();

  constructor(initialState = {}) {
    const state = initialState.messages ? initialState : { messages: initialState, counters: {} };
    for (const [agentId, messages] of Object.entries(state.messages ?? {})) {
      this.#messages.set(agentId, [...messages]);
      const explicit = Number(state.counters?.[agentId] ?? 0);
      const inferred = messages.reduce((max, message) => {
        const match = String(message.id ?? '').match(/(\d+)$/);
        return Math.max(max, match ? Number(match[1]) : 0);
      }, 0);
      this.#counters.set(agentId, Math.max(explicit, inferred));
    }
  }

  ensure(agentId) {
    if (!this.#messages.has(agentId)) this.#messages.set(agentId, []);
    if (!this.#counters.has(agentId)) this.#counters.set(agentId, 0);
    return this.#messages.get(agentId);
  }

  #nextId(agentId, prefix = 'msg') {
    this.ensure(agentId);
    const next = (this.#counters.get(agentId) ?? 0) + 1;
    this.#counters.set(agentId, next);
    return `${prefix}-${next}`;
  }

  send(agentId, message) {
    const inbox = this.ensure(agentId);
    const kind = message.kind ?? 'event';
    const envelope = {
      id: message.id ?? this.#nextId(agentId, kind === 'request' ? 'rpc' : 'msg'),
      kind,
      to: agentId,
      from: message.from ?? 'runtime',
      body: message.body ?? '',
      payload: message.payload ?? null,
      correlationId: message.correlationId ?? (kind === 'request' ? this.#nextId(agentId, 'corr') : null),
      replyTo: message.replyTo ?? null,
      sentAt: message.sentAt ?? new Date().toISOString(),
      status: message.status ?? 'queued',
      attempts: message.attempts ?? 0,
      expectReply: message.expectReply ?? (kind === 'request'),
      inReplyTo: message.inReplyTo ?? null,
    };
    inbox.push(envelope);
    return envelope;
  }

  request(agentId, message) {
    return this.send(agentId, { ...message, kind: 'request', expectReply: message.expectReply ?? true });
  }

  respond(requestMessage, response) {
    const target = response.to ?? requestMessage.replyTo ?? requestMessage.from;
    return this.send(target, {
      ...response,
      kind: 'response',
      correlationId: response.correlationId ?? requestMessage.correlationId ?? requestMessage.id,
      inReplyTo: requestMessage.id,
      replyTo: null,
      expectReply: false,
      status: response.status ?? 'delivered',
    });
  }

  list(agentId, { kind, correlationId } = {}) {
    return [...(this.#messages.get(agentId) ?? [])].filter((message) => {
      if (kind && message.kind !== kind) return false;
      if (correlationId && message.correlationId !== correlationId) return false;
      return true;
    });
  }

  pop(agentId) {
    const inbox = this.ensure(agentId);
    return inbox.shift() ?? null;
  }

  peek(agentId) {
    const inbox = this.ensure(agentId);
    return inbox[0] ?? null;
  }

  consume(agentId, limit = Infinity, predicate = () => true) {
    const inbox = this.ensure(agentId);
    const consumed = [];
    const kept = [];
    for (const message of inbox) {
      if (consumed.length < limit && predicate(message)) consumed.push(message);
      else kept.push(message);
    }
    this.#messages.set(agentId, kept);
    return consumed;
  }

  consumeWork(agentId, limit = Infinity) {
    return this.consume(agentId, limit, (message) => message.kind !== 'response');
  }

  count(agentId) {
    return this.ensure(agentId).length;
  }

  totalCount() {
    return [...this.#messages.values()].reduce((sum, messages) => sum + messages.length, 0);
  }

  findResponse(agentId, correlationId) {
    return this.list(agentId, { kind: 'response', correlationId })[0] ?? null;
  }

  snapshot() {
    return {
      messages: Object.fromEntries([...this.#messages.entries()].map(([agentId, messages]) => [agentId, [...messages]])),
      counters: Object.fromEntries(this.#counters.entries()),
    };
  }
}
