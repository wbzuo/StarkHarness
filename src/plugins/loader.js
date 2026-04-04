import { readFile } from 'node:fs/promises';

export function validatePluginManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Plugin manifest must be an object');
  }
  if (!manifest.name) throw new Error('Plugin manifest missing name');
  if (!manifest.version) throw new Error('Plugin manifest missing version');
  if (manifest.capabilities && !Array.isArray(manifest.capabilities)) {
    throw new Error('Plugin capabilities must be an array');
  }
  if (manifest.commands && !Array.isArray(manifest.commands)) {
    throw new Error('Plugin commands must be an array');
  }
  return true;
}

export class PluginLoader {
  #plugins = [];

  constructor(initialPlugins = []) {
    initialPlugins.forEach((plugin) => this.register(plugin));
  }

  register(manifest) {
    validatePluginManifest(manifest);
    const normalized = {
      capabilities: [],
      commands: [],
      ...manifest,
      capabilities: [...(manifest.capabilities ?? [])],
      commands: [...(manifest.commands ?? [])],
    };
    this.#plugins.push(normalized);
    return normalized;
  }

  async loadManifestFile(manifestPath) {
    const content = await readFile(manifestPath, 'utf8');
    return this.register(JSON.parse(content));
  }

  list() {
    return [...this.#plugins];
  }

  listCapabilities() {
    return this.#plugins.flatMap((plugin) =>
      plugin.capabilities.map((capability) => ({
        plugin: plugin.name,
        capability,
      })),
    );
  }

  listCommands() {
    return this.#plugins.flatMap((plugin) =>
      plugin.commands.map((command) => ({
        plugin: plugin.name,
        ...command,
      })),
    );
  }

  snapshot() {
    return this.list();
  }
}
