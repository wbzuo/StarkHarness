import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function isHookFilename(name) {
  return ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(path.extname(name));
}

function normalizeHookEntry(hook, sourcePath, index) {
  if (!hook || typeof hook !== 'object') {
    throw new Error(`Hook export ${sourcePath}#${index} must be an object`);
  }
  if (typeof hook.event !== 'string' || !hook.event.trim()) {
    throw new Error(`Hook export ${sourcePath}#${index} must include a non-empty event`);
  }
  if (typeof hook.handler !== 'function') {
    throw new Error(`Hook export ${sourcePath}#${index} must include a handler() function`);
  }
  return {
    ...hook,
    matcher: hook.matcher ?? '*',
    sourcePath,
  };
}

function normalizeHookModule(moduleNamespace, sourcePath) {
  const exported = moduleNamespace?.default ?? moduleNamespace?.hooks ?? moduleNamespace;
  const hooks = Array.isArray(exported) ? exported : [exported];
  return hooks.map((hook, index) => normalizeHookEntry(hook, sourcePath, index));
}

export async function loadHooksFromDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = entries
    .filter((entry) => entry.isFile() && isHookFilename(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const hooks = [];
  for (const entry of files) {
    const sourcePath = path.join(dir, entry.name);
    const moduleNamespace = await import(pathToFileURL(sourcePath).href);
    hooks.push(...normalizeHookModule(moduleNamespace, sourcePath));
  }
  return hooks;
}

export async function discoverHooks(dirs = []) {
  const hooks = [];
  for (const dir of dirs) {
    hooks.push(...await loadHooksFromDir(dir));
  }
  return hooks;
}
