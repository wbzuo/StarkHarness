import path from 'node:path';
import { EventBus } from './events.js';
import { HookDispatcher } from './hooks.js';
import { AgentLoop } from './loop.js';
import { SystemPromptBuilder } from './prompt.js';
import { createContextEnvelope } from './context.js';
import { createSession } from './session.js';
import { PermissionEngine } from '../permissions/engine.js';
import { TaskStore } from '../tasks/store.js';
import { TaskScheduler } from '../tasks/scheduler.js';
import { AgentManager } from '../agents/manager.js';
import { AgentInbox } from '../agents/inbox.js';
import { AgentExecutor } from '../agents/executor.js';
import { AgentOrchestrator } from '../agents/orchestrator.js';
import { PluginLoader } from '../plugins/loader.js';
import { ProviderRegistry, createProviderBlueprint } from '../providers/index.js';
import { loadProviderConfig } from '../providers/config.js';
import { ToolRegistry } from '../tools/registry.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { createCapabilityMap } from '../capabilities/index.js';
import { createCommandRegistry, CommandRegistry } from '../commands/registry.js';
import { createWorkspaceBlueprint } from '../workspace/index.js';
import { createBridgeBlueprint } from '../bridge/index.js';
import { createReplBlueprint } from '../ui/repl.js';
import { createTelemetrySink, TraceContext } from '../telemetry/index.js';
import { StateStore } from '../state/store.js';
import { loadPolicyFile, mergePolicy } from '../permissions/policy.js';
import { getSandboxProfile } from '../permissions/profiles.js';
import { diagnosePluginConflicts } from '../plugins/diagnostics.js';
import { MemoryManager } from '../memory/index.js';
import { SkillLoader } from '../skills/loader.js';
import { matchAndBind } from '../skills/binder.js';
import { AgentRunner } from './runner.js';
import { describeWebAccess } from '../web-access/index.js';

function createSnapshot(runtime) {
  return {
    session: runtime.session,
    tasks: runtime.tasks.snapshot(),
    agents: runtime.agents.snapshot(),
    inbox: runtime.inbox.snapshot(),
    permissions: runtime.permissions.snapshot(),
    plugins: runtime.plugins.snapshot(),
  };
}

export async function createRuntime(options = {}) {
  const stateDir = options.stateDir ?? path.join(options.session?.cwd ?? process.cwd(), '.starkharness');
  const state = new StateStore({ rootDir: stateDir });
  await state.init();

  const resumed = options.resumeSessionId
    ? await state.loadSession(options.resumeSessionId)
    : null;
  const runtimeSnapshot = options.resumeSessionId
    ? await state.loadRuntimeSnapshot().catch(() => ({ tasks: [], agents: [], inbox: {}, permissions: {}, plugins: [] }))
    : { tasks: [], agents: [], inbox: {}, permissions: {}, plugins: [] };
  const filePolicy = await loadPolicyFile(options.policyPath, { includeDefaults: false });
  const loadedProviderConfig = await loadProviderConfig(options.providerConfigPath);
  const providerConfig = { ...loadedProviderConfig, ...(options.providerConfig ?? {}) };
  const profilePolicy = getSandboxProfile(options.sandboxProfile);
  const policy = mergePolicy(profilePolicy, filePolicy);

  const events = new EventBus();
  const hooks = new HookDispatcher();
  const permissions = new PermissionEngine({ ...runtimeSnapshot.permissions, ...policy, ...options.permissions });
  const tasks = new TaskStore(runtimeSnapshot.tasks ?? []);
  const agents = new AgentManager(runtimeSnapshot.agents ?? []);
  const inbox = new AgentInbox(runtimeSnapshot.inbox ?? {});
  const plugins = new PluginLoader(runtimeSnapshot.plugins ?? []);
  const providers = new ProviderRegistry(providerConfig);
  const tools = new ToolRegistry();
  const promptBuilder = new SystemPromptBuilder();

  for (const provider of createProviderBlueprint(providerConfig)) {
    providers.register(provider);
  }
  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }

  const telemetry = createTelemetrySink({ rootDir: stateDir });
  await telemetry.init();

  // Determine session first, then derive cwd from it
  const session = resumed ?? createSession(options.session);
  const cwd = session.cwd ?? process.cwd();
  const context = createContextEnvelope({ cwd, mode: session.mode });
  const webAccess = await describeWebAccess({ cwd });

  // Memory and skills bind to session.cwd (correct for both new and resumed sessions)
  const memory = new MemoryManager({ projectDir: cwd });
  const skills = new SkillLoader(path.join(cwd, 'skills'));
  // Auto-discover skills at boot
  await skills.discoverSkills();

  if (options.pluginManifestPath) {
    await plugins.loadManifestFile(options.pluginManifestPath);
  }
  for (const plugin of options.plugins ?? []) {
    plugins.register(plugin);
  }
  const builtinToolConflicts = tools.registerPluginTools(plugins.listTools());

  // MCP server loading (optional)
  const mcpClients = new Map();
  if (options.mcpConfig) {
    const { parseMcpConfig, validateMcpServer } = await import('../mcp/config.js');
    const { McpStdioClient } = await import('../mcp/client.js');
    const { createMcpToolProxy } = await import('../mcp/tools.js');
    const servers = parseMcpConfig(options.mcpConfig);
    for (const server of servers.filter((s) => !s.disabled)) {
      if (!validateMcpServer(server).valid) continue;
      try {
        const client = new McpStdioClient(server.name, server);
        await client.connect();
        const mcpTools = await client.listTools();
        for (const t of mcpTools) {
          tools.register(createMcpToolProxy(server.name, t, client));
        }
        mcpClients.set(server.name, client);
      } catch (err) {
        await telemetry.emit('mcp:error', { server: server.name, error: err.message });
      }
    }
  }

  const commands = new CommandRegistry(createCommandRegistry());

  // Auto-discover filesystem commands (user-level → project-level, later overrides earlier)
  const { discoverCommands, wrapFileCommand } = await import('../commands/loader.js');
  const commandDirs = [
    path.join(stateDir, 'commands'),
    path.join(cwd, 'commands'),
  ];
  const fileCommands = await discoverCommands(commandDirs);
  commands.registerMany(fileCommands.map(wrapFileCommand));

  const builtinCommandConflicts = commands.registerPluginCommands(plugins.listCommands());

  const pluginDiagnostics = diagnosePluginConflicts(plugins, { builtinToolConflicts, builtinCommandConflicts });

  // Auto-discover filesystem hooks (state-level → project-level, later dirs register later)
  const { discoverHooks } = await import('./hook-loader.js');
  const hookDirs = [
    path.join(stateDir, 'hooks'),
    path.join(cwd, 'hooks'),
  ];
  const fileHooks = await discoverHooks(hookDirs);
  for (const hook of fileHooks) {
    hooks.register(hook.event, hook);
  }

  // Register hook handlers from options
  for (const [eventName, hookList] of Object.entries(options.hooks ?? {})) {
    for (const hook of Array.isArray(hookList) ? hookList : [hookList]) {
      hooks.register(eventName, hook);
    }
  }

  // Fire SessionStart hooks
  const sessionStartResult = await hooks.fire('SessionStart', { sessionId: session.id, cwd: session.cwd });

  // Build system prompt
  const { claudeMd, memoryString } = await memory.toPromptStrings();
  const systemPrompt = promptBuilder.build({
    tools: tools.toSchemaList(),
    claudeMd,
    memory: memoryString,
    hookContext: sessionStartResult.additionalContext ?? '',
    cwd: session.cwd,
  });
  context.systemPrompt = systemPrompt;

  // Agent loop
  const loop = new AgentLoop({ hooks, tools, permissions });
  const scheduler = new TaskScheduler({ tasks, agents });

  // Agent runner for multi-turn LLM conversations
  const runner = new AgentRunner({
    provider: {
      async complete({ systemPrompt, messages, tools }) {
        return providers.completeWithStrategy({
          capability: 'chat',
          request: { systemPrompt, messages, tools },
          retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
        });
      },
    },
    hooks,
    tools,
    permissions,
  });

  const runtime = {
    session,
    context,
    events,
    hooks,
    loop,
    permissions,
    tasks,
    agents,
    inbox,
    plugins,
    mcpClients,
    providers,
    pluginDiagnostics,
    tools,
    telemetry,
    state,
    commands,
    memory,
    skills,
    runner,
    promptBuilder,
    capabilities: createCapabilityMap(),
    workspace: createWorkspaceBlueprint(),
    bridge: createBridgeBlueprint(),
    ui: createReplBlueprint(),
    webAccess,
    scheduler,
    executor: null,
    orchestrator: null,
    async persist() {
      await this.state.saveSession(this.session);
      await this.state.saveRuntimeSnapshot(createSnapshot(this));
    },
    trace: null,
    startTrace() {
      this.trace = new TraceContext();
      return this.trace;
    },
    async log(eventName, payload) {
      return this.telemetry.emit(eventName, payload, this.trace);
    },
    async dispatchTurn(turn, options = {}) {
      await this.log('turn:start', turn);
      const result = await this.loop.executeTurn(turn, options);
      if (result.ok) {
        this.session.turns.push({ turn, result, recordedAt: new Date().toISOString() });
        await this.persist();
      }
      await this.log(result.ok ? 'turn:complete' : `turn:${result.reason}`, { turn, result });
      return result;
    },
    async dispatchCommand(name, args = {}) {
      await this.log('command:start', { name, args });
      const result = await this.commands.dispatch(name, this, args);
      await this.log('command:complete', { name, args, result });
      return result;
    },
    async run(userMessage, options = {}) {
      const trace = this.startTrace();
      const runSpan = trace.startSpan('run', { userMessage: userMessage.slice(0, 100) });
      await this.log('run:start', { userMessage });
      const discovered = this.skills.listDiscovered();
      const skillMap = new Map(discovered.map((skill) => [skill.dir, skill]));
      const match = matchAndBind(userMessage, skillMap);
      let binding = match;
      if (match) {
        const full = await this.skills.loadSkill(match.dir).catch(() => null);
        if (full) {
          binding = {
            dir: full.dir,
            path: full.path,
            name: full.name,
            body: full.body,
            promptAddendum: `\n\n# Active Skill: ${full.name}\n\n${full.body}`,
          };
        }
      }
      const effectiveSystemPrompt = binding
        ? `${this.context.systemPrompt}${binding.promptAddendum}`
        : this.context.systemPrompt;
      const previousActiveSkill = this.context.activeSkill ?? null;
      this.context.activeSkill = binding?.path
        ? { name: binding.name, dir: binding.path }
        : null;
      const result = await this.runner.run({
        userMessage,
        systemPrompt: effectiveSystemPrompt,
        onTextChunk: (chunk) => options.onTextChunk?.(chunk, { traceId: trace.traceId }),
        permissions: options.permissions,
      }).finally(() => {
        this.context.activeSkill = previousActiveSkill;
      });
      // Persist each tool turn back into the session
      for (const turn of result.turns) {
        this.session.turns.push({
          turn: { tool: turn.toolName, input: turn.input },
          result: turn.result,
          recordedAt: new Date().toISOString(),
        });
      }
      await this.persist();
      runSpan.addEvent('complete', { turns: result.turns.length, stopReason: result.stopReason, compactions: result.compactions ?? 0 });
      trace.endSpan(runSpan.spanId);
      await this.telemetry.emitSpan(runSpan);
      await this.log('run:complete', {
        turns: result.turns.length,
        stopReason: result.stopReason,
        usage: result.usage,
        skill: binding?.name ?? null,
        traceId: trace.traceId,
        compactions: result.compactions ?? 0,
      });
      return { ...result, activeSkill: binding?.name ?? null, traceId: trace.traceId };
    },
    async startWorker(agentId, options = {}) {
      return this.orchestrator.startWorker(agentId, options);
    },
    async stopWorker(agentId) {
      return this.orchestrator.stopWorker(agentId);
    },
    awaitResponse(agentId, correlationId, options = {}) {
      return this.inbox.awaitResponse(agentId, correlationId, options);
    },
    listWorkers() {
      return this.orchestrator.listWorkers();
    },
    async shutdown() {
      const workerIds = this.orchestrator.listWorkers().map((worker) => worker.agentId);
      await Promise.all(workerIds.map((agentId) => this.orchestrator.stopWorker(agentId)));
      await this.hooks.fire('SessionEnd', { sessionId: this.session.id, cwd: this.session.cwd });
      const clearedPending = this.inbox.clearPending('runtime-shutdown');
      const disconnects = [...this.mcpClients.values()].map((client) => client.disconnect().catch(() => {}));
      await Promise.all(disconnects);
      await this.log('runtime:shutdown', {
        sessionId: this.session.id,
        mcpClients: this.mcpClients.size,
        workers: workerIds.length,
        clearedPending: clearedPending.length,
      });
    },
  };

  runtime.executor = new AgentExecutor(runtime);
  runtime.orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor: runtime.executor, inbox, state, telemetry });
  loop.setRuntime(runtime);
  runner.setRuntime(runtime);
  await runtime.persist();
  await runtime.log('runtime:boot', { sessionId: runtime.session.id, stateDir, resumed: Boolean(options.resumeSessionId) });
  return runtime;
}

export function createBlueprintDocument(runtime) {
  return {
    name: 'StarkHarness',
    session: runtime.session,
    kernel: ['session', 'runtime', 'loop', 'context', 'events', 'hooks', 'prompt'],
    commands: runtime.commands.list(),
    providers: runtime.providers.list(),
    tools: runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })),
    capabilities: runtime.capabilities,
    workspace: runtime.workspace,
    bridge: runtime.bridge,
    ui: runtime.ui,
    webAccess: runtime.webAccess,
    orchestration: {
      taskCount: runtime.tasks.list().length,
      agentCount: runtime.agents.list().length,
      workerCount: runtime.listWorkers().length,
      pluginCount: runtime.plugins.list().length,
      commandCount: runtime.commands.list().length,
      toolCount: runtime.tools.list().length,
      hookEventCount: runtime.hooks.listEvents().length,
      pluginConflictCount: runtime.pluginDiagnostics.commandConflicts.length + runtime.pluginDiagnostics.toolConflicts.length,
      mailbox: runtime.inbox.stats(),
    },
    policy: runtime.permissions.snapshot(),
    plugins: {
      count: runtime.plugins.list().length,
      capabilities: runtime.plugins.listCapabilities(),
      commands: runtime.plugins.listCommands(),
      tools: runtime.plugins.listTools(),
      diagnostics: runtime.pluginDiagnostics,
    },
    persistence: {
      rootDir: runtime.state.rootDir,
      sessionPath: runtime.state.getSessionPath(runtime.session.id),
      runtimePath: runtime.state.runtimePath,
      transcriptPath: runtime.telemetry.transcriptPath,
    },
  };
}
