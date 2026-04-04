import { defineTool } from '../types.js';

function placeholder(name, capability, description) {
  return defineTool({
    name,
    capability,
    description,
    async execute(input = {}) {
      return {
        ok: true,
        tool: name,
        capability,
        input,
        note: 'placeholder implementation',
      };
    },
  });
}

export function createBuiltinTools() {
  return [
    placeholder('read_file', 'read', 'Read workspace files'),
    placeholder('write_file', 'write', 'Create or overwrite files'),
    placeholder('edit_file', 'write', 'Perform surgical file edits'),
    placeholder('shell', 'exec', 'Execute shell commands'),
    placeholder('search', 'read', 'Search workspace content'),
    placeholder('glob', 'read', 'Resolve file patterns'),
    placeholder('fetch_url', 'network', 'Fetch remote content'),
    placeholder('spawn_agent', 'delegate', 'Spawn a bounded child agent'),
    placeholder('send_message', 'delegate', 'Send messages between agents'),
    placeholder('tasks', 'delegate', 'Manage task state'),
  ];
}
