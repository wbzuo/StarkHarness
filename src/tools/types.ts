export function defineTool(definition) {
  const required = ['name', 'capability', 'description', 'inputSchema', 'execute'];
  for (const field of required) {
    if (!definition?.[field]) {
      throw new Error(`Tool definition missing ${field}`);
    }
  }
  if (definition.inputSchema.type !== 'object') {
    throw new Error(`Tool ${definition.name} inputSchema.type must be 'object'`);
  }
  return Object.freeze(definition);
}
