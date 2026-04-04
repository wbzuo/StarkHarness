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
