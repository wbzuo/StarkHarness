import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

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
  if (manifest.tools && !Array.isArray(manifest.tools)) {
    throw new Error('Plugin tools must be an array');
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
      tools: [],
      ...manifest,
      capabilities: [...(manifest.capabilities ?? [])],
      commands: [...(manifest.commands ?? [])],
      tools: [...(manifest.tools ?? [])],
    };
    this.#plugins = this.#plugins.filter((plugin) => plugin.name !== normalized.name);
    this.#plugins.push(normalized);
    return normalized;
  }

  remove(name) {
    const before = this.#plugins.length;
    this.#plugins = this.#plugins.filter((plugin) => plugin.name !== name);
    return before !== this.#plugins.length;
  }

  async loadManifestFile(manifestPath) {
    const content = await readFile(manifestPath, 'utf8');
    return this.register(JSON.parse(content));
  }

  async loadManifestDir(dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
    const loaded = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      loaded.push(await this.loadManifestFile(path.join(dirPath, entry.name)));
    }
    return loaded;
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

  listTools() {
    return this.#plugins.flatMap((plugin) =>
      plugin.tools.map((tool) => ({
        plugin: plugin.name,
        ...tool,
      })),
    );
  }

  snapshot() {
    return this.list();
  }
}
