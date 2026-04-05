import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

function generateId(prefix = 'span') {
  return `${prefix}-${randomBytes(8).toString('hex')}`;
}

export class Span {
  constructor({ traceId, spanId, parentSpanId = null, name, attributes = {} }) {
    this.traceId = traceId;
    this.spanId = spanId;
    this.parentSpanId = parentSpanId;
    this.name = name;
    this.attributes = attributes;
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'active';
    this.events = [];
  }

  addEvent(name, attributes = {}) {
    this.events.push({ name, attributes, timestamp: Date.now() });
  }

  end(status = 'ok') {
    this.endTime = Date.now();
    this.status = status;
    return this;
  }

  durationMs() {
    return (this.endTime ?? Date.now()) - this.startTime;
  }

  toJSON() {
    return {
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      attributes: this.attributes,
      startTime: new Date(this.startTime).toISOString(),
      endTime: this.endTime ? new Date(this.endTime).toISOString() : null,
      durationMs: this.durationMs(),
      status: this.status,
      events: this.events,
    };
  }
}

export class TraceContext {
  #traceId;
  #rootSpanId;
  #currentSpanId;
  #spans = new Map();

  constructor(traceId) {
    this.#traceId = traceId ?? generateId('trace');
    this.#rootSpanId = null;
    this.#currentSpanId = null;
  }

  get traceId() { return this.#traceId; }
  get currentSpanId() { return this.#currentSpanId; }

  startSpan(name, attributes = {}) {
    const spanId = generateId('span');
    const span = new Span({
      traceId: this.#traceId,
      spanId,
      parentSpanId: this.#currentSpanId,
      name,
      attributes,
    });
    this.#spans.set(spanId, span);
    if (!this.#rootSpanId) this.#rootSpanId = spanId;
    this.#currentSpanId = spanId;
    return span;
  }

  endSpan(spanId, status = 'ok') {
    const span = this.#spans.get(spanId);
    if (!span) return null;
    span.end(status);
    // Restore parent as current
    if (this.#currentSpanId === spanId) {
      this.#currentSpanId = span.parentSpanId;
    }
    return span;
  }

  getSpan(spanId) {
    return this.#spans.get(spanId) ?? null;
  }

  listSpans() {
    return [...this.#spans.values()].map((s) => s.toJSON());
  }

  toTree() {
    const spans = this.listSpans();
    const byId = new Map(spans.map((s) => [s.spanId, { ...s, children: [] }]));
    const roots = [];
    for (const node of byId.values()) {
      if (node.parentSpanId && byId.has(node.parentSpanId)) {
        byId.get(node.parentSpanId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}

export class TelemetrySink {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.transcriptPath = path.join(rootDir, 'transcript.jsonl');
    this.tracePath = path.join(rootDir, 'traces.jsonl');
  }

  async init() {
    await mkdir(this.rootDir, { recursive: true });
    return this;
  }

  async emit(eventName, payload, trace = null) {
    const event = {
      eventName,
      payload,
      recordedAt: new Date().toISOString(),
    };
    if (trace) {
      event.traceId = trace.traceId;
      event.spanId = trace.currentSpanId;
    }
    await appendFile(this.transcriptPath, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  async emitSpan(span) {
    await appendFile(this.tracePath, JSON.stringify(span.toJSON()) + '\n', 'utf8');
  }

  async replay() {
    const content = await readFile(this.transcriptPath, 'utf8').catch(() => '');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async replayTraces() {
    const content = await readFile(this.tracePath, 'utf8').catch(() => '');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async queryTraces({ traceId, agentId, name, since } = {}) {
    const all = await this.replayTraces();
    return all.filter((span) => {
      if (traceId && span.traceId !== traceId) return false;
      if (agentId && span.attributes?.agentId !== agentId) return false;
      if (name && span.name !== name) return false;
      if (since && new Date(span.startTime) < new Date(since)) return false;
      return true;
    });
  }
}

export function createTelemetrySink(options = {}) {
  return new TelemetrySink(options);
}
