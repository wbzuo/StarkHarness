export function validatePluginManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Plugin manifest must be an object');
  }
  if (!manifest.name) throw new Error('Plugin manifest missing name');
  if (!manifest.version) throw new Error('Plugin manifest missing version');
  return true;
}

export class PluginLoader {
  #plugins = [];

  register(manifest) {
    validatePluginManifest(manifest);
    this.#plugins.push(manifest);
    return manifest;
  }

  list() {
    return [...this.#plugins];
  }
}
