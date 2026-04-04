function createPluginTool(tool) {
  return {
    name: tool.name,
    capability: tool.capability ?? 'delegate',
    description: tool.description ?? `Plugin tool from ${tool.plugin}`,
    async execute(input = {}) {
      return {
        ok: true,
        source: 'plugin',
        plugin: tool.plugin,
        tool: tool.name,
        input,
        output: tool.output ?? null,
      };
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
    this.registerMany(pluginTools.map(createPluginTool));
  }

  get(name) {
    return this.#tools.get(name);
  }

  list() {
    return [...this.#tools.values()];
  }
}
