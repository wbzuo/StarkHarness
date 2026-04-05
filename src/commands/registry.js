import { runHarnessTurn } from '../kernel/loop.js';
import { createBlueprintDocument } from '../kernel/runtime.js';
import { listSandboxProfiles } from '../permissions/profiles.js';
import { createReplayPlan, evaluateReplayPlan } from '../replay/runner.js';

function filterTranscript(entries, args = {}) {
  let next = entries;
  if (args.event) next = next.filter((entry) => entry.eventName === args.event);
  if (args.query) next = next.filter((entry) => JSON.stringify(entry).includes(args.query));
  if (args.limit) next = next.slice(-Number(args.limit));
  return next;
}

function createPluginCommand(command) {
  return {
    name: command.name,
    description: command.description ?? `Plugin command from ${command.plugin}`,
    async execute(_runtime) {
      return {
        ok: true,
        source: 'plugin',
        plugin: command.plugin,
        command: command.name,
        output: command.output ?? null,
      };
    },
  };
}

function createSessionSummary(runtime) {
  return {
    id: runtime.session.id,
    goal: runtime.session.goal,
    mode: runtime.session.mode,
    cwd: runtime.session.cwd,
    turns: runtime.session.turns.length,
    tasks: runtime.tasks.list().length,
    agents: runtime.agents.list().length,
    messages: (runtime.session.messages ?? []).length,
    queuedMessages: runtime.inbox.totalCount(),
  };
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
          sandboxProfiles: listSandboxProfiles(),
        };
      },
    },
    {
      name: 'smoke-test',
      description: 'Execute a read_file turn to verify harness wiring end-to-end',
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
      name: 'session-summary',
      description: 'Summarize the current resumed session',
      async execute(runtime) {
        return createSessionSummary(runtime);
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
      name: 'provider-config',
      description: 'Show loaded provider configuration summary',
      async execute(runtime) {
        return runtime.providers.describeConfig();
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
      name: 'orchestrate',
      description: 'Dispatch all ready tasks across available agents',
      async execute(runtime, args = {}) {
        return runtime.orchestrator.runReadyTasks({
          parallel: args.parallel !== 'false',
          concurrency: args.concurrency ? Number(args.concurrency) : Infinity,
          timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
          maxInboxSize: args.maxInboxSize ? Number(args.maxInboxSize) : Infinity,
        });
      },
    },
    {
      name: 'inbox',
      description: 'List inbox messages for an agent',
      async execute(runtime, args = {}) {
        return runtime.inbox.list(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'mailbox',
      description: 'Show mailbox queue and pending-response diagnostics',
      async execute(runtime) {
        return runtime.inbox.stats();
      },
    },
    {
      name: 'repl',
      description: 'Start the interactive StarkHarness REPL',
      async execute(runtime) {
        const { startRepl } = await import('../ui/repl.js');
        return startRepl(runtime);
      },
    },
    {
      name: 'workers',
      description: 'List active agent inbox workers',
      async execute(runtime) {
        return runtime.listWorkers();
      },
    },
    {
      name: 'worker-start',
      description: 'Start an inbox worker loop for an agent',
      async execute(runtime, args = {}) {
        return runtime.startWorker(args.agent ?? args.id ?? 'agent-1', {
          pollIntervalMs: Number(args.pollIntervalMs ?? 50),
          maxMessagesPerTick: Number(args.maxMessagesPerTick ?? 1),
          timeoutMs: Number(args.timeoutMs ?? 120000),
          maxRestarts: Number(args.maxRestarts ?? 0),
          restartDelayMs: Number(args.restartDelayMs ?? 50),
        });
      },
    },
    {
      name: 'worker-stop',
      description: 'Stop an inbox worker loop for an agent',
      async execute(runtime, args = {}) {
        return runtime.stopWorker(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'agent-state',
      description: 'Load persisted state for an agent',
      async execute(runtime, args = {}) {
        return runtime.state.loadAgentState(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'worker-state',
      description: 'Load persisted worker metrics for an agent',
      async execute(runtime, args = {}) {
        return runtime.state.loadAgentWorker(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'plugins',
      description: 'List registered plugins and capabilities',
      async execute(runtime) {
        return {
          plugins: runtime.plugins.list(),
          capabilities: runtime.plugins.listCapabilities(),
          commands: runtime.plugins.listCommands(),
          tools: runtime.plugins.listTools(),
          diagnostics: runtime.pluginDiagnostics,
        };
      },
    },
    {
      name: 'profiles',
      description: 'List available sandbox profiles',
      async execute() {
        return listSandboxProfiles();
      },
    },
    {
      name: 'registry',
      description: 'Show complete state of all registries — tools, commands, providers, plugins, hooks, skills, policy, conflicts',
      async execute(runtime) {
        const { buildDiagnostics } = await import('./diagnostics.js');
        return buildDiagnostics(runtime);
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
      name: 'playback',
      description: 'Play transcript events back into a lightweight summary',
      async execute(runtime, args = {}) {
        const events = filterTranscript(await runtime.telemetry.replay(), args);
        return {
          totalEvents: events.length,
          eventNames: [...new Set(events.map((entry) => entry.eventName))],
          lastEvent: events.at(-1) ?? null,
        };
      },
    },
    {
      name: 'replay-turn',
      description: 'Produce a deterministic replay skeleton for recorded turns',
      async execute(runtime) {
        return runtime.session.turns.map(({ turn, result }, index) => ({
          step: index + 1,
          tool: turn.tool,
          input: turn.input,
          resultSummary: result.ok === false ? result.reason : result.tool ?? result.output ?? 'ok',
        }));
      },
    },
    {
      name: 'replay-runner',
      description: 'Build a replay execution plan from recorded turns',
      async execute(runtime) {
        const plan = createReplayPlan(runtime.session);
        return {
          plan,
          summary: evaluateReplayPlan(plan),
        };
      },
    },
    {
      name: 'run',
      description: 'Execute a full agent turn loop with the given prompt',
      async execute(runtime, args = {}) {
        const prompt = args.prompt ?? 'What files are in this project?';
        const result = await runtime.run(prompt);
        return {
          finalText: result.finalText,
          turns: result.turns.length,
          stopReason: result.stopReason,
          usage: result.usage,
        };
      },
    },
    {
      name: 'complete',
      description: 'Execute a provider completion request',
      async execute(runtime, args = {}) {
        return runtime.providers.complete(args.provider ?? 'anthropic', {
          prompt: args.prompt ?? 'hello',
          sessionId: runtime.session.id,
          metadata: {
            source: 'command',
          },
          createdAt: new Date().toISOString(),
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

  registerMany(commands = []) {
    commands.forEach((command) => this.register(command));
  }

  registerPluginCommands(pluginCommands = []) {
    const conflicts = [];
    for (const pc of pluginCommands) {
      if (this.#commands.has(pc.name)) {
        conflicts.push({ type: 'command', name: pc.name, source: 'plugin-vs-builtin' });
      }
    }
    const conflictNames = new Set(conflicts.map((c) => c.name));
    const safe = pluginCommands.filter((pc) => !conflictNames.has(pc.name));
    this.registerMany(safe.map(createPluginCommand));
    return conflicts;
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
