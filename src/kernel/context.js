export function createContextEnvelope({ cwd = process.cwd(), mode = 'interactive', metadata = {} } = {}) {
  return {
    cwd,
    mode,
    metadata,
    messages: [],
    systemPrompt: '',
    tokenEstimate: 0,
    createdAt: new Date().toISOString(),
  };
}

export function appendMessage(context, role, content) {
  context.messages.push({ role, content, addedAt: new Date().toISOString() });
  context.tokenEstimate += Math.ceil(content.length / 4);
  return context;
}

export function compactContext(context, { maxTokens = 100000 } = {}) {
  if (context.tokenEstimate < maxTokens) return { compacted: false, context };
  const keep = Math.max(4, Math.floor(context.messages.length * 0.3));
  const removed = context.messages.slice(0, -keep);
  const summary = `[Compacted ${removed.length} earlier messages]`;
  const compacted = {
    ...context,
    messages: [{ role: 'system', content: summary, addedAt: new Date().toISOString() }, ...context.messages.slice(-keep)],
    tokenEstimate: Math.ceil(context.tokenEstimate * 0.4),
  };
  return { compacted: true, context: compacted, removedCount: removed.length };
}
