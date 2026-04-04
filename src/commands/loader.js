import { loadCommandsFromDir } from './parser.js';

// Load commands from multiple directories. Later directories override earlier ones (project > user).
export async function discoverCommands(dirs = []) {
  const commandMap = new Map();
  for (const dir of dirs) {
    const commands = await loadCommandsFromDir(dir);
    for (const cmd of commands) {
      commandMap.set(cmd.name, cmd);
    }
  }
  return [...commandMap.values()];
}

// Wrap a parsed command file into a registry-compatible command definition
export function wrapFileCommand(parsed) {
  return {
    name: parsed.name,
    description: parsed.description,
    source: 'filesystem',
    async execute(runtime, args = {}) {
      return {
        ok: true,
        source: 'filesystem',
        name: parsed.name,
        prompt: parsed.prompt,
        allowedTools: parsed.allowedTools,
        model: parsed.model,
        args,
      };
    },
  };
}
