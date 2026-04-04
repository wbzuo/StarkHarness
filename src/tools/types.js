export function defineTool(definition) {
  const required = ['name', 'capability', 'description', 'execute'];
  for (const field of required) {
    if (!definition?.[field]) {
      throw new Error(`Tool definition missing ${field}`);
    }
  }
  return Object.freeze(definition);
}
