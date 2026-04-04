export class ToolRegistry {
  #tools = new Map();

  register(tool) {
    this.#tools.set(tool.name, tool);
    return tool;
  }

  get(name) {
    return this.#tools.get(name);
  }

  list() {
    return [...this.#tools.values()];
  }
}
