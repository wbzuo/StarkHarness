export function createProviderRequest({ prompt = '', sessionId = null, metadata = {} } = {}) {
  return {
    prompt,
    sessionId,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

export function createProviderResponse({ provider, modelFamily, request, output, status = 'stubbed' }) {
  return {
    provider,
    modelFamily,
    request,
    output,
    status,
    completedAt: new Date().toISOString(),
  };
}

export function createStubProvider({ id, purpose, modelFamily }) {
  return {
    id,
    purpose,
    modelFamily,
    async complete(request) {
      if (request.messages || request.tools) {
        const latestUserMessage = [...(request.messages ?? [])]
          .reverse()
          .find((message) => message.role === 'user');
        const text = `stub:${id}:${typeof latestUserMessage?.content === 'string' ? latestUserMessage.content : ''}`.trim();
        return {
          text,
          toolCalls: [],
          stopReason: 'end_turn',
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      }
      return createProviderResponse({
        provider: id,
        modelFamily,
        request,
        status: 'stubbed',
        output: `stub:${id}:${request.prompt ?? ''}`,
      });
    },
  };
}
