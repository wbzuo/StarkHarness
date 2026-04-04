function collectNameCounts(items, key) {
  const counts = new Map();
  for (const item of items) {
    const name = item[key];
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function findDuplicates(items, key, type) {
  const counts = collectNameCounts(items, key);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ type, name, count, source: 'plugin-vs-plugin' }));
}

export function diagnosePluginConflicts(pluginLoader, { builtinToolConflicts = [], builtinCommandConflicts = [] } = {}) {
  return {
    commandConflicts: [
      ...findDuplicates(pluginLoader.listCommands(), 'name', 'command'),
      ...builtinCommandConflicts,
    ],
    toolConflicts: [
      ...findDuplicates(pluginLoader.listTools(), 'name', 'tool'),
      ...builtinToolConflicts,
    ],
  };
}
