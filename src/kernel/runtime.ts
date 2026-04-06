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
import { loadProviderConfig, mergeProviderConfig } from '../providers/config.js';
import { ToolRegistry } from '../tools/registry.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { createCapabilityMap } from '../capabilities/index.js';
import { createCommandRegistry, CommandRegistry } from '../commands/registry.js';
import { createWorkspaceBlueprint } from '../workspace/index.js';
import { FileStateCache } from '../workspace/cache.js';
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
import { describeVoice } from '../voice/index.js';
import { createObservabilityManager } from '../enterprise/observability.js';
import { createFeatureFlagManager } from '../enterprise/growthbook.js';
import { mergeManagedSettingsIntoEnv, fetchManagedSettings } from '../config/managed.js';
import { describeRemoteBridge, emitRemoteBridgeEvent, pollRemoteBridge, startRemoteBridge, stopRemoteBridge } from '../bridge/remote.js';

const COORDINATOR_ALLOWED_TOOLS = new Set(['spawn_agent', 'send_message', 'tasks']);

const MODE_CONFIG = {
  interactive: { promptSuffix: null, restrictTools: false },
  plan: {
    promptSuffix: '# Plan Mode\nYou are in read-only planning mode. Do not edit files or execute mutating work. Produce plans, analysis, and implementation guidance only.',
    restrictTools: false,
  },
  coordinator: {
    promptSuffix: '# Coordinator Mode\nYou are in coordinator mode. Prefer delegating work, coordinating agents, and synthesizing results over directly performing implementation work yourself.',
    restrictTools: true,
    allowedTools: COORDINATOR_ALLOWED_TOOLS,
  },
};

function parseEverySchedule(schedule = '') {
  const match = String(schedule).trim().match(/^@every:(\d+)(ms|s|m|h)$/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  return value * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit];
}

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
  const projectDir = options.projectDir ?? options.app?.rootDir ?? options.session?.cwd ?? process.cwd();
  const stateDir = options.stateDir ?? path.join(projectDir, '.starkharness');
  const state = new StateStore({ rootDir: stateDir });
  await state.init();

  const resumed = options.resumeSessionId
    ? await state.loadSession(options.resumeSessionId)
    : null;
  const runtimeSnapshot = options.resumeSessionId
    ? await state.loadRuntimeSnapshot().catch(() => ({ tasks: [], agents: [], inbox: {}, permissions: {}, plugins: [] }))
    : { tasks: [], agents: [], inbox: {}, permissions: {}, plugins: [] };
  const baseEnvConfig = options.envConfig ?? {
    raw: process.env,
    providers: {},
    bridge: {},
    features: {},
    telemetry: {},
  };
  const managedSettingsRecord = await state.loadManagedSettings().catch(() => ({}));
  const managedSettings = managedSettingsRecord?.settings ?? managedSettingsRecord ?? {};
  const envConfig = mergeManagedSettingsIntoEnv(baseEnvConfig, managedSettings);
  const authProfiles = await state.loadAuthProfiles().catch(() => ({}));
  const filePolicy = await loadPolicyFile(options.policyPath ?? options.app?.paths?.policyPath, { includeDefaults: false });
  const loadedProviderConfig = await loadProviderConfig(options.providerConfigPath ?? options.app?.paths?.providerConfigPath);
  const providerConfig = mergeProviderConfig(
    mergeProviderConfig(mergeProviderConfig(loadedProviderConfig, envConfig.providers), authProfiles),
    options.providerConfig ?? {},
  );
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
  const fileCache = new FileStateCache();

  for (const provider of createProviderBlueprint(providerConfig)) {
    providers.register(provider);
  }
  function reloadProviders(nextConfig = providers.config) {
    providers.config = nextConfig;
    providers.clear();
    for (const provider of createProviderBlueprint(nextConfig)) {
      providers.register(provider);
    }
  }
  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }

  const telemetry = createTelemetrySink({ rootDir: stateDir });
  await telemetry.init();

  // Determine session first, then derive cwd from it
  const session = resumed ?? createSession({ cwd: projectDir, ...(options.session ?? {}) });
  const cwd = session.cwd ?? process.cwd();
  const context = createContextEnvelope({ cwd, mode: session.mode });
  const webAccess = await describeWebAccess({ cwd, env: envConfig.raw });
  const voice = describeVoice(envConfig);
  const observability = createObservabilityManager(envConfig.telemetry);
  const featureFlags = createFeatureFlagManager(envConfig.telemetry);

  // Memory and skills bind to session.cwd (correct for both new and resumed sessions)
  const memory = new MemoryManager({ projectDir: projectDir });
  const skills = new SkillLoader(options.skillsDir ?? options.app?.paths?.skillsDir ?? path.join(projectDir, 'skills'));
  // Auto-discover skills at boot
  await skills.discoverSkills();

  if (options.pluginManifestPath ?? options.app?.paths?.pluginManifestPath) {
    await plugins.loadManifestFile(options.pluginManifestPath ?? options.app?.paths?.pluginManifestPath);
  }
  if (options.pluginDirs) {
    for (const dir of options.pluginDirs) {
      await plugins.loadManifestDir(dir);
    }
  } else if (options.app?.paths?.pluginsDir) {
    await plugins.loadManifestDir(options.app.paths.pluginsDir);
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
    options.commandDirs?.[0],
    options.commandDirs?.[1],
    options.app?.paths?.commandsDir,
    path.join(projectDir, 'commands'),
  ].filter(Boolean);
  const fileCommands = await discoverCommands(commandDirs);
  commands.registerMany(fileCommands.map(wrapFileCommand));

  const builtinCommandConflicts = commands.registerPluginCommands(plugins.listCommands());

  const pluginDiagnostics = diagnosePluginConflicts(plugins, { builtinToolConflicts, builtinCommandConflicts });

  // Auto-discover filesystem hooks (state-level → project-level, later dirs register later)
  const { discoverHooks } = await import('./hook-loader.js');
  const hookDirs = [
    path.join(stateDir, 'hooks'),
    options.hookDirs?.[0],
    options.hookDirs?.[1],
    options.app?.paths?.hooksDir,
    path.join(projectDir, 'hooks'),
  ].filter(Boolean);
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
    fileCache,
    capabilities: createCapabilityMap(),
    workspace: createWorkspaceBlueprint(),
    bridge: createBridgeBlueprint(),
    ui: createReplBlueprint(),
    webAccess,
    voice,
    app: options.app ?? null,
    env: envConfig,
    managedSettings,
    observability,
    featureFlags,
    scheduler,
    executor: null,
    orchestrator: null,
    requestPermission: options.requestPermission ?? null,
    askUserQuestion: options.askUserQuestion ?? null,
    replSessions: new Map(),
    remoteBridgeState: {
      connected: false,
      lastPollAt: null,
      lastCommandAt: null,
      lastError: null,
    },
    remoteBridgeTimer: null,
    remoteBridgeSocket: null,
    backgroundTimer: null,
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
      const event = await this.telemetry.emit(eventName, payload, this.trace);
      await this.observability.report(eventName, payload);
      emitRemoteBridgeEvent(this, { eventName, payload, traceId: this.trace?.traceId ?? null });
      return event;
    },
    async reloadEnvAndProviders() {
      const { loadRuntimeEnv } = await import('../config/env.js');
      const loadedEnv = await loadRuntimeEnv({
        cwd: this.app?.rootDir ?? this.context.cwd,
        envFilePath: this.app?.paths?.envPath ?? null,
      });
      const nextEnv = mergeManagedSettingsIntoEnv(loadedEnv, this.managedSettings);
      this.env = nextEnv;
      reloadProviders(mergeProviderConfig(
        mergeProviderConfig(loadedProviderConfig, nextEnv.providers),
        options.providerConfig ?? {},
      ));
      this.webAccess = await describeWebAccess({ cwd: this.context.cwd, env: nextEnv.raw });
      this.voice = describeVoice(nextEnv);
      this.observability = createObservabilityManager(nextEnv.telemetry);
      this.featureFlags = createFeatureFlagManager(nextEnv.telemetry);
      return nextEnv;
    },
    async applyManagedSettings(settings = {}) {
      this.managedSettings = settings;
      await this.state.saveManagedSettings(settings);
      const nextEnv = mergeManagedSettingsIntoEnv(this.env, settings);
      this.env = nextEnv;
      reloadProviders(mergeProviderConfig(
        mergeProviderConfig(loadedProviderConfig, nextEnv.providers),
        options.providerConfig ?? {},
      ));
      this.webAccess = await describeWebAccess({ cwd: this.context.cwd, env: nextEnv.raw });
      this.voice = describeVoice(nextEnv);
      this.observability = createObservabilityManager(nextEnv.telemetry);
      this.featureFlags = createFeatureFlagManager(nextEnv.telemetry);
      return settings;
    },
    async syncManagedSettings() {
      const settings = await fetchManagedSettings({
        url: this.env?.settings?.managedUrl,
        token: this.env?.settings?.managedToken,
      });
      await this.applyManagedSettings(settings);
      return settings;
    },
    async tickBackgroundJobs() {
      const crons = await this.state.loadCrons();
      let changed = false;
      if (this.env?.features?.autoDream && !crons.some((entry) => entry.id === 'dream-auto')) {
        crons.push({
          id: 'dream-auto',
          schedule: this.env?.dream?.schedule ?? '@every:15m',
          command: 'dream',
          enabled: true,
          kind: 'dream',
          createdAt: new Date().toISOString(),
        });
        changed = true;
      }
      const now = new Date();
      for (const entry of crons) {
        if (!entry.enabled) continue;
        if ((entry.kind ?? '') !== 'dream' && (entry.command ?? '') !== 'dream') continue;
        if (!this.isCronDue(entry, now)) continue;
        const result = await this.dispatchCommand('dream', { sessionId: entry.sessionId ?? this.session.id, background: true });
        entry.lastRunAt = now.toISOString();
        entry.lastResult = {
          entries: result.entries?.length ?? 0,
          path: result.path ?? null,
        };
        changed = true;
      }
      if (changed) await this.state.saveCrons(crons);
      if (this.env?.settings?.managedUrl && this.env?.settings?.autoSync) {
        await this.syncManagedSettings().catch((error) => {
          this.remoteBridgeState.lastError = error instanceof Error ? error.message : String(error);
        });
      }
      if (this.remoteBridgeState.connected) {
        await pollRemoteBridge(this).catch((error) => {
          this.remoteBridgeState.lastError = error instanceof Error ? error.message : String(error);
        });
      }
    },
    startBackgroundJobs() {
      if (this.backgroundTimer) return;
      this.backgroundTimer = setInterval(() => {
        this.tickBackgroundJobs().catch(() => {});
      }, Number(this.env?.dream?.pollIntervalMs ?? 1000));
      this.backgroundTimer.unref?.();
    },
    stopBackgroundJobs() {
      if (this.backgroundTimer) {
        clearInterval(this.backgroundTimer);
        this.backgroundTimer = null;
      }
    },
    isCronDue(entry, now = new Date()) {
      const schedule = String(entry.schedule ?? '* * * * *').trim();
      const everyMs = parseEverySchedule(schedule);
      if (everyMs) {
        const lastRunMs = entry.lastRunAt ? Date.parse(entry.lastRunAt) : 0;
        return !lastRunMs || (now.getTime() - lastRunMs) >= everyMs;
      }
      const [minute = '*', hour = '*', day = '*', month = '*', weekday = '*'] = schedule.split(/\s+/);
      const lastRun = entry.lastRunAt ? new Date(entry.lastRunAt) : null;
      if (lastRun && lastRun.getUTCFullYear() === now.getUTCFullYear() && lastRun.getUTCMonth() === now.getUTCMonth() && lastRun.getUTCDate() === now.getUTCDate() && lastRun.getUTCHours() === now.getUTCHours() && lastRun.getUTCMinutes() === now.getUTCMinutes()) {
        return false;
      }
      const matchesPart = (part, value) => {
        if (part === '*') return true;
        if (part.startsWith('*/')) {
          const interval = Number(part.slice(2));
          return interval > 0 && value % interval === 0;
        }
        return part.split(',').map((item) => Number(item)).includes(value);
      };
      return matchesPart(minute, now.getUTCMinutes())
        && matchesPart(hour, now.getUTCHours())
        && matchesPart(day, now.getUTCDate())
        && matchesPart(month, now.getUTCMonth() + 1)
        && matchesPart(weekday, now.getUTCDay());
    },
    describeRemoteBridge() {
      return describeRemoteBridge(this.env, this.remoteBridgeState);
    },
    startRemoteBridge() {
      return startRemoteBridge(this);
    },
    stopRemoteBridge() {
      return stopRemoteBridge(this);
    },
    async pollRemoteBridge() {
      return pollRemoteBridge(this);
    },
    async dispatchTurn(turn, options = {}) {
      await this.log('turn:start', turn);
      await this.state.appendSessionTranscript(this.session.id, {
        type: 'tool-turn:start',
        turn,
        recordedAt: new Date().toISOString(),
      });
      const result = await this.loop.executeTurn(turn, options);
      if (result.ok) {
        this.session.turns.push({ turn, result, recordedAt: new Date().toISOString() });
        await this.persist();
      }
      await this.state.appendSessionTranscript(this.session.id, {
        type: 'tool-turn:result',
        turn,
        result,
        recordedAt: new Date().toISOString(),
      });
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
      await this.state.appendSessionTranscript(this.session.id, {
        type: 'message',
        role: 'user',
        content: userMessage,
        recordedAt: new Date().toISOString(),
      });
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
      const mode = MODE_CONFIG[this.session.mode] ?? MODE_CONFIG.interactive;
      const modePrompt = mode.promptSuffix
        ? `${effectiveSystemPrompt}\n\n${mode.promptSuffix}`
        : effectiveSystemPrompt;
      const previousActiveSkill = this.context.activeSkill ?? null;
      this.context.activeSkill = binding?.path
        ? { name: binding.name, dir: binding.path }
        : null;
      const scopedTools = mode.restrictTools
        ? (() => {
          const registry = new ToolRegistry();
          registry.registerMany(this.tools.list().filter((tool) => mode.allowedTools.has(tool.name)));
          return registry;
        })()
        : this.tools;
      const scopedRunner = mode.restrictTools
        ? (() => {
          const runner = new AgentRunner({
            provider: {
              async complete({ systemPrompt, messages, tools, onTextChunk }) {
                return providers.completeWithStrategy({
                  capability: 'chat',
                  request: { systemPrompt, messages, tools, onTextChunk },
                  retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
                });
              },
            },
            hooks: hooks.fork(),
            tools: scopedTools,
            permissions: options.permissions ?? this.permissions,
          });
          runner.setRuntime(this);
          return runner;
        })()
        : this.runner;
      const result = await scopedRunner.run({
        userMessage,
        systemPrompt: modePrompt,
        toolSchemas: scopedTools.toSchemaList(),
        onTextChunk: (chunk) => options.onTextChunk?.(chunk, { traceId: trace.traceId }),
        permissions: options.permissions,
      }).finally(() => {
        this.context.activeSkill = previousActiveSkill;
      });
      await this.state.appendSessionTranscript(this.session.id, {
        type: 'message',
        role: 'assistant',
        content: result.finalText,
        traceId: trace.traceId,
        recordedAt: new Date().toISOString(),
      });
      // Persist each tool turn back into the session
      for (const turn of result.turns) {
        this.session.turns.push({
          turn: { tool: turn.toolName, input: turn.input },
          result: turn.result,
          recordedAt: new Date().toISOString(),
        });
        await this.state.appendSessionTranscript(this.session.id, {
          type: 'tool-result',
          tool: turn.toolName,
          input: turn.input,
          result: turn.result,
          traceId: trace.traceId,
          recordedAt: new Date().toISOString(),
        });
      }
      await this.persist();
      const memoryResult = await this.memory.extractAndPersistMemories({
        messages: result.messages,
        provider: {
          complete: ({ systemPrompt, messages, tools }) =>
            this.providers.completeWithStrategy({
              capability: 'chat',
              request: { systemPrompt, messages, tools },
              retryOptions: { maxRetries: 1, baseDelay: 50, timeout: 30000 },
            }),
        },
      });
      if (memoryResult.strategy === 'error') {
        await this.log('memory:extract:error', { traceId: trace.traceId });
      } else if (memoryResult.entries.length > 0) {
        await this.log('memory:extract:complete', {
          traceId: trace.traceId,
          count: memoryResult.entries.length,
          path: memoryResult.path,
        });
      }
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
    async refreshFeatureFlags() {
      return this.featureFlags.sync();
    },
    async shutdown() {
      this.stopBackgroundJobs();
      this.stopRemoteBridge();
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
        fileCache: this.fileCache.status(),
      });
    },
  };

  runtime.executor = new AgentExecutor(runtime);
  runtime.orchestrator = new AgentOrchestrator({ agents, tasks, scheduler, executor: runtime.executor, inbox, state, telemetry });
  loop.setRuntime(runtime);
  runner.setRuntime(runtime);
  if (runtime.env?.bridge?.remoteBridgeUrl) {
    await runtime.startRemoteBridge();
  }
  runtime.startBackgroundJobs();
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
    fileCache: runtime.fileCache.status(),
    bridge: runtime.bridge,
    ui: runtime.ui,
    webAccess: runtime.webAccess,
    voice: runtime.voice,
    app: runtime.app,
    env: runtime.env ? {
      filePath: runtime.env.filePath ?? null,
      features: runtime.env.features,
      bridge: {
        host: runtime.env.bridge?.host,
        port: runtime.env.bridge?.port,
        remoteControl: runtime.env.bridge?.remoteControl,
      },
      telemetry: runtime.env.telemetry,
    } : null,
    observability: runtime.observability.status(),
    featureFlags: runtime.featureFlags.getAll(),
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
      fileCache: runtime.fileCache?.status?.() ?? null,
    },
  };
}
