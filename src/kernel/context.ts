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

export function estimateTokens(messages) {
  let total = 0;
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    total += Math.ceil(content.length / 4);
  }
  return total;
}

export function summarizeMessages(messages) {
  const toolCalls = messages.filter((m) =>
    Array.isArray(m.content) && m.content.some?.((b) => b.type === 'tool_use'),
  );
  const toolNames = [...new Set(toolCalls.flatMap((m) =>
    (Array.isArray(m.content) ? m.content : []).filter((b) => b.type === 'tool_use').map((b) => b.name),
  ))];
  const textBlocks = messages
    .filter((m) => typeof m.content === 'string' && m.role === 'assistant')
    .map((m) => m.content);
  const lastDecision = textBlocks.at(-1)?.slice(0, 200) ?? '';
  return [
    `[Context compacted: ${messages.length} messages removed]`,
    toolNames.length > 0 ? `Tools used: ${toolNames.join(', ')}` : '',
    lastDecision ? `Last assistant output: ${lastDecision}...` : '',
  ].filter(Boolean).join('\n');
}

export function compactMessages(messages, { maxTokens = 80000, keepRecent = 6, summaryOverride = null } = {}) {
  const estimate = estimateTokens(messages);
  if (estimate < maxTokens) return { compacted: false, messages, removed: 0, estimatedTokens: estimate };

  const keep = Math.max(keepRecent, Math.floor(messages.length * 0.25));
  const removed = messages.slice(0, -keep);
  const kept = messages.slice(-keep);
  const summary = summaryOverride ?? summarizeMessages(removed);

  const compactedMessages = [
    { role: 'user', content: summary },
    { role: 'assistant', content: 'Understood. Continuing with the compacted context.' },
    ...kept,
  ];
  return {
    compacted: true,
    messages: compactedMessages,
    removed: removed.length,
    estimatedTokens: estimateTokens(compactedMessages),
  };
}

// Legacy API — kept for backward compat with existing callers
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
