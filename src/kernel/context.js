export function createContextEnvelope({ cwd = process.cwd(), mode = 'interactive', metadata = {} } = {}) {
  return {
    cwd,
    mode,
    metadata,
    createdAt: new Date().toISOString(),
  };
}
