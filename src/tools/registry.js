function createPluginTool(tool) {
  return {
    name: tool.name,
    capability: tool.capability ?? 'delegate',
    description: tool.description ?? `Plugin tool from ${tool.plugin}`,
    inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
    async execute(input = {}) {
      return { ok: true, source: 'plugin', plugin: tool.plugin, tool: tool.name, input, output: tool.output ?? null };
    },
  };
}

export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    this.#tools.set(tool.name, tool);
    return tool;
  }

  registerMany(tools = []) {
    tools.forEach((tool) => this.register(tool));
  }

  registerPluginTools(pluginTools = []) {
    const conflicts = [];
    for (const pt of pluginTools) {
      if (this.#tools.has(pt.name)) {
        conflicts.push({ type: 'tool', name: pt.name, source: 'plugin-vs-builtin' });
      }
    }
    this.registerMany(pluginTools.map(createPluginTool));
    return conflicts;
  }

  get(name) {
    return this.#tools.get(name);
  }

  list() {
    return [...this.#tools.values()];
  }

  toSchemaList() {
    return this.list().map(({ name, description, inputSchema }) => ({
      name,
      description,
      input_schema: inputSchema,
    }));
  }
}
