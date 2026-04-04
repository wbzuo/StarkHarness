import { runHarnessTurn } from '../kernel/loop.js';
import { createBlueprintDocument } from '../kernel/runtime.js';

function filterTranscript(entries, args = {}) {
  let next = entries;
  if (args.event) next = next.filter((entry) => entry.eventName === args.event);
  if (args.query) next = next.filter((entry) => JSON.stringify(entry).includes(args.query));
  if (args.limit) next = next.slice(-Number(args.limit));
  return next;
}

export function createCommandRegistry() {
  return [
    {
      name: 'blueprint',
      description: 'Print module blueprint',
      async execute(runtime) {
        return createBlueprintDocument(runtime);
      },
    },
    {
      name: 'doctor',
      description: 'Validate harness wiring',
      async execute(runtime) {
        return {
          ok: true,
          providers: runtime.providers.list().length,
          tools: runtime.tools.list().length,
          commands: runtime.commands.list().length,
          capabilityDomains: Object.keys(runtime.capabilities).length,
          sessionPath: runtime.state.getSessionPath(runtime.session.id),
          policy: runtime.permissions.snapshot(),
          transcriptPath: runtime.telemetry.transcriptPath,
          plugins: runtime.plugins.list().length,
        };
      },
    },
    {
      name: 'run',
      description: 'Execute a sample harness turn',
      async execute(runtime) {
        return runHarnessTurn(runtime, {
          tool: 'read_file',
          input: { path: `.starkharness/sessions/${runtime.session.id}.json` },
        });
      },
    },
    {
      name: 'resume',
      description: 'Load the current session snapshot',
      async execute(runtime) {
        return runtime.state.loadSession(runtime.session.id);
      },
    },
    {
      name: 'sessions',
      description: 'List persisted sessions',
      async execute(runtime) {
        return runtime.state.listSessions();
      },
    },
    {
      name: 'providers',
      description: 'List registered providers',
      async execute(runtime) {
        return runtime.providers.list();
      },
    },
    {
      name: 'tasks',
      description: 'List persisted tasks',
      async execute(runtime) {
        return runtime.tasks.list();
      },
    },
    {
      name: 'agents',
      description: 'List persisted agents',
      async execute(runtime) {
        return runtime.agents.list();
      },
    },
    {
      name: 'plugins',
      description: 'List registered plugins and capabilities',
      async execute(runtime) {
        return {
          plugins: runtime.plugins.list(),
          capabilities: runtime.plugins.listCapabilities(),
        };
      },
    },
    {
      name: 'transcript',
      description: 'Replay the harness event log',
      async execute(runtime, args = {}) {
        return filterTranscript(await runtime.telemetry.replay(), args);
      },
    },
    {
      name: 'complete',
      description: 'Execute a provider completion request',
      async execute(runtime, args = {}) {
        return runtime.providers.complete(args.provider ?? 'anthropic', {
          prompt: args.prompt ?? 'hello',
          sessionId: runtime.session.id,
        });
      },
    },
  ];
}

export class CommandRegistry {
  #commands = new Map();

  constructor(definitions = []) {
    definitions.forEach((command) => this.register(command));
  }

  register(command) {
    this.#commands.set(command.name, command);
    return command;
  }

  get(name) {
    return this.#commands.get(name);
  }

  list() {
    return [...this.#commands.values()].map(({ name, description }) => ({ name, description }));
  }

  async dispatch(name, runtime, args = {}) {
    const command = this.get(name);
    if (!command) throw new Error(`Unknown command: ${name}`);
    return command.execute(runtime, args);
  }
}
