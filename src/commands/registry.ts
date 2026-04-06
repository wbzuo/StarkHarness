import { runHarnessTurn } from '../kernel/loop.js';
import { createBlueprintDocument } from '../kernel/runtime.js';
import { listSandboxProfiles } from '../permissions/profiles.js';
import { createReplayPlan, evaluateReplayPlan } from '../replay/runner.js';
import { getWebAccessStatus } from '../web-access/index.js';
import { listStarterApps, scaffoldApp } from '../app/scaffold.js';
import { writeEnvValues, removeEnvKeys } from '../config/env.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

function createStatusSummary(runtime) {
  return {
    app: runtime.app
      ? {
        name: runtime.app.name,
        version: runtime.app.version,
        startup: runtime.app.startup,
        automation: runtime.app.automation,
      }
      : null,
    session: createSessionSummary(runtime),
    providers: runtime.env ? {
      anthropic: Boolean(runtime.env.providers?.anthropic?.apiKey),
      openai: Boolean(runtime.env.providers?.openai?.apiKey),
      compatible: Boolean(runtime.env.providers?.compatible?.apiKey),
    } : {},
    features: {
      webAccess: runtime.env?.features?.webAccess ?? true,
      remoteControl: runtime.env?.features?.remoteControl ?? true,
      autoMode: runtime.env?.features?.autoMode ?? false,
      autoUpdate: runtime.env?.features?.autoUpdate ?? false,
      debug: runtime.env?.features?.debug ?? false,
    },
    webAccess: {
      available: runtime.webAccess?.available ?? false,
      ready: runtime.webAccess?.ready ?? false,
      proxyUrl: runtime.webAccess?.proxyUrl ?? null,
    },
    bridge: runtime.env?.bridge ?? {},
    observability: runtime.observability?.status?.() ?? null,
    workers: {
      active: runtime.listWorkers().length,
      queuedMessages: runtime.inbox.totalCount(),
      pendingResponses: runtime.inbox.pendingCount?.() ?? 0,
    },
    counts: {
      commands: runtime.commands.list().length,
      tools: runtime.tools.list().length,
      agents: runtime.agents.list().length,
      tasks: runtime.tasks.list().length,
      plugins: runtime.plugins.list().length,
    },
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
          app: runtime.app,
          webAccess: runtime.webAccess,
          env: runtime.env ? {
            filePath: runtime.env.filePath ?? null,
            features: runtime.env.features,
            bridge: runtime.env.bridge,
          } : null,
        };
      },
    },
    {
      name: 'status',
      description: 'Show a product-style runtime status summary',
      async execute(runtime) {
        return createStatusSummary(runtime);
      },
    },
    {
      name: 'enter-coordinator-mode',
      description: 'Switch the session into coordinator mode for delegation-first orchestration',
      async execute(runtime) {
        runtime.session.mode = 'coordinator';
        runtime.context.mode = 'coordinator';
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    },
    {
      name: 'exit-coordinator-mode',
      description: 'Exit coordinator mode and return to interactive mode',
      async execute(runtime) {
        runtime.session.mode = 'interactive';
        runtime.context.mode = 'interactive';
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    },
    {
      name: 'coordinator-status',
      description: 'Show whether coordinator mode is active',
      async execute(runtime) {
        return {
          enabled: runtime.session.mode === 'coordinator',
          mode: runtime.session.mode,
        };
      },
    },
    {
      name: 'enter-plan-mode',
      description: 'Switch the session into read-only planning mode',
      async execute(runtime) {
        runtime.session.mode = 'plan';
        runtime.context.mode = 'plan';
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    },
    {
      name: 'exit-plan-mode',
      description: 'Exit read-only planning mode and return to interactive mode',
      async execute(runtime) {
        runtime.session.mode = 'interactive';
        runtime.context.mode = 'interactive';
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    },
    {
      name: 'plan-status',
      description: 'Show whether plan mode is currently active',
      async execute(runtime) {
        return {
          enabled: runtime.session.mode === 'plan',
          mode: runtime.session.mode,
        };
      },
    },
    {
      name: 'starter-apps',
      description: 'List available starter app templates',
      async execute() {
        return listStarterApps();
      },
    },
    {
      name: 'init',
      description: 'Scaffold a starter StarkHarness app into a target directory',
      async execute(_runtime, args = {}) {
        return scaffoldApp({
          targetDir: args.target ?? '.',
          template: args.template ?? 'browser-research',
          force: args.force === 'true',
        });
      },
    },
    {
      name: 'app-status',
      description: 'Show the currently loaded app manifest metadata',
      async execute(runtime) {
        return runtime.app ?? null;
      },
    },
    {
      name: 'env-status',
      description: 'Show loaded environment configuration and feature switches',
      async execute(runtime) {
        return runtime.env ? {
          filePath: runtime.env.filePath ?? null,
          features: runtime.env.features,
          bridge: runtime.env.bridge,
          telemetry: runtime.env.telemetry,
          providers: Object.fromEntries(
            Object.entries(runtime.env.providers).map(([providerId, provider]) => [
              providerId,
              {
                configured: Boolean(provider.apiKey),
                baseUrl: provider.baseUrl ?? null,
                model: provider.model ?? null,
              },
            ]),
          ),
        } : null;
      },
    },
    {
      name: 'login-status',
      description: 'Show provider/login readiness for configured model backends',
      async execute(runtime) {
        return runtime.env ? {
          anthropic: {
            configured: Boolean(runtime.env.providers.anthropic.apiKey),
            baseUrl: runtime.env.providers.anthropic.baseUrl ?? null,
            model: runtime.env.providers.anthropic.model ?? null,
          },
          openai: {
            configured: Boolean(runtime.env.providers.openai.apiKey),
            baseUrl: runtime.env.providers.openai.baseUrl ?? null,
            model: runtime.env.providers.openai.model ?? null,
          },
          compatible: {
            configured: Boolean(runtime.env.providers.compatible.apiKey),
            baseUrl: runtime.env.providers.compatible.baseUrl ?? null,
            model: runtime.env.providers.compatible.model ?? null,
          },
        } : null;
      },
    },
    {
      name: 'login',
      description: 'Persist provider credentials/config into the app or workspace env file and reload runtime providers',
      async execute(runtime, args = {}) {
        const provider = args.provider ?? 'openai';
        const keyMap = {
          anthropic: {
            apiKey: 'ANTHROPIC_API_KEY',
            baseUrl: 'ANTHROPIC_BASE_URL',
            model: 'ANTHROPIC_MODEL',
          },
          openai: {
            apiKey: 'OPENAI_API_KEY',
            baseUrl: 'OPENAI_BASE_URL',
            model: 'OPENAI_MODEL',
          },
          compatible: {
            apiKey: 'COMPATIBLE_API_KEY',
            baseUrl: 'COMPATIBLE_BASE_URL',
            model: 'COMPATIBLE_MODEL',
          },
        }[provider];
        if (!keyMap) {
          throw new Error(`Unsupported provider for login: ${provider}`);
        }
        const filePath = await writeEnvValues({
          cwd: runtime.app?.rootDir ?? runtime.context.cwd,
          envFilePath: runtime.app?.paths?.envPath ?? null,
          values: {
            ...(args.apiKey ? { [keyMap.apiKey]: args.apiKey } : {}),
            ...(args.baseUrl ? { [keyMap.baseUrl]: args.baseUrl } : {}),
            ...(args.model ? { [keyMap.model]: args.model } : {}),
          },
        });
        await runtime.reloadEnvAndProviders();
        return {
          ok: true,
          provider,
          filePath,
          status: await runtime.dispatchCommand('login-status'),
        };
      },
    },
    {
      name: 'logout',
      description: 'Remove provider credentials/config from the app or workspace env file and reload runtime providers',
      async execute(runtime, args = {}) {
        const provider = args.provider ?? 'openai';
        const keyMap = {
          anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL'],
          openai: ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL'],
          compatible: ['COMPATIBLE_API_KEY', 'COMPATIBLE_BASE_URL', 'COMPATIBLE_MODEL'],
        }[provider];
        if (!keyMap) {
          throw new Error(`Unsupported provider for logout: ${provider}`);
        }
        const filePath = await removeEnvKeys({
          cwd: runtime.app?.rootDir ?? runtime.context.cwd,
          envFilePath: runtime.app?.paths?.envPath ?? null,
          keys: keyMap,
        });
        await runtime.reloadEnvAndProviders();
        return {
          ok: true,
          provider,
          filePath,
          status: await runtime.dispatchCommand('login-status'),
        };
      },
    },
    {
      name: 'observability-status',
      description: 'Show enterprise observability integration status',
      async execute(runtime) {
        return {
          observability: runtime.observability?.status?.() ?? null,
          telemetry: runtime.env?.telemetry ?? null,
        };
      },
    },
    {
      name: 'feature-flags',
      description: 'Show the current merged feature flags from env and remote config',
      async execute(runtime) {
        return runtime.featureFlags?.getAll?.() ?? {};
      },
    },
    {
      name: 'growthbook-sync',
      description: 'Refresh remote feature flags from a configured GrowthBook endpoint',
      async execute(runtime) {
        return {
          flags: await runtime.refreshFeatureFlags(),
          status: runtime.featureFlags?.status?.() ?? null,
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
      name: 'agent-summary',
      description: 'Show the persisted summary for an agent',
      async execute(runtime, args = {}) {
        const state = await runtime.state.loadAgentState(args.agent ?? args.id ?? 'agent-1');
        return state?.lastSummary ?? null;
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
      name: 'enter-worktree',
      description: 'Create or switch into a git worktree for the current repository',
      async execute(runtime, args = {}) {
        const branch = args.branch ?? 'starkharness-worktree';
        const worktreeRoot = path.join(runtime.state.rootDir, 'worktrees');
        const worktreePath = path.join(worktreeRoot, branch);
        await mkdir(worktreeRoot, { recursive: true });
        await execFileAsync('git', ['worktree', 'add', '-B', branch, worktreePath], {
          cwd: runtime.context.cwd,
        });
        runtime.session.worktreeParentCwd = runtime.context.cwd;
        runtime.session.cwd = worktreePath;
        runtime.context.cwd = worktreePath;
        await runtime.persist();
        return { ok: true, branch, worktreePath };
      },
    },
    {
      name: 'exit-worktree',
      description: 'Return to the original project root from a temporary worktree session',
      async execute(runtime) {
        const target = runtime.session.worktreeParentCwd ?? runtime.app?.rootDir ?? process.cwd();
        runtime.session.cwd = target;
        runtime.context.cwd = target;
        runtime.session.worktreeParentCwd = null;
        await runtime.persist();
        return { ok: true, cwd: target };
      },
    },
    {
      name: 'web-access-status',
      description: 'Show bundled web-access availability, scripts, and proxy readiness',
      async execute(runtime, args = {}) {
        return getWebAccessStatus({
          cwd: runtime.context.cwd,
          ensure: args.ensure === 'true',
        });
      },
    },
    {
      name: 'auto',
      description: 'Run app-aware auto mode using a prompt, stdin, or app automation defaults',
      async execute(runtime, args = {}) {
        let prompt = args.prompt ?? '';
        if (!prompt && args.stdin) {
          prompt = args.stdin;
        }
        if (!prompt && runtime.app?.automation?.defaultPrompt) {
          prompt = runtime.app.automation.defaultPrompt;
        }
        if (prompt) {
          const result = await runtime.run(prompt);
          return {
            mode: 'prompt',
            prompt,
            finalText: result.finalText,
            turns: result.turns.length,
            stopReason: result.stopReason,
            usage: result.usage,
          };
        }
        if (runtime.app?.automation?.defaultCommand) {
          const result = await runtime.dispatchCommand(runtime.app.automation.defaultCommand, args);
          return {
            mode: 'command',
            command: runtime.app.automation.defaultCommand,
            result,
          };
        }
        throw new Error('Auto mode requires --prompt, stdin input, or app.automation.defaultPrompt/defaultCommand');
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
      name: 'traces',
      description: 'Query trace spans — filter by traceId, agentId, name, since',
      async execute(runtime, args = {}) {
        const spans = await runtime.telemetry.queryTraces({
          traceId: args.traceId,
          agentId: args.agentId,
          name: args.name,
          since: args.since,
        });
        if (args.tree === 'true' && args.traceId) {
          const { TraceContext } = await import('../telemetry/index.js');
          const trace = new TraceContext(args.traceId);
          for (const span of spans) {
            const s = trace.startSpan(span.name, span.attributes);
            s.parentSpanId = span.parentSpanId;
            if (span.endTime) s.end(span.status);
          }
          return trace.toTree();
        }
        return spans;
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
      name: 'todos',
      description: 'List persisted user-facing todos for the current workspace',
      async execute(runtime) {
        return runtime.state.loadTodos();
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

    // Contextual runtime with permissions override
    let effectiveRuntime = runtime;
    if (args.permissions) {
      effectiveRuntime = new Proxy(runtime, {
        get(target, prop) {
          if (prop === 'permissions') return args.permissions;
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }

    return command.execute(effectiveRuntime, args);
  }
}
