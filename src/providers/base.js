export function createStubProvider({ id, purpose, modelFamily }) {
  return {
    id,
    purpose,
    modelFamily,
    async complete(request) {
      return {
        provider: id,
        modelFamily,
        request,
        status: 'stubbed',
        output: `stub:${id}:${request.prompt ?? ''}`,
      };
    },
  };
}
