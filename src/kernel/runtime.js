import path from 'node:path';
import { EventBus } from './events.js';
import { HookDispatcher } from './hooks.js';
import { AgentLoop } from './loop.js';
import { SystemPromptBuilder } from './prompt.js';
import { createContextEnvelope } from './context.js';
import { createSession } from './session.js';
import { PermissionEngine } from '../permissions/engine.js';
import { TaskStore } from '../tasks/store.js';
import { AgentManager } from '../agents/manager.js';
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
import { createTelemetrySink } from '../telemetry/index.js';
import { StateStore } from '../state/store.js';
import { loadPolicyFile, mergePolicy } from '../permissions/policy.js';
import { getSandboxProfile } from '../permissions/profiles.js';
import { diagnosePluginConflicts } from '../plugins/diagnostics.js';
import { MemoryManager } from '../memory/index.js';
import { SkillLoader } from '../skills/loader.js';
import { AgentRunner } from './runner.js';

function createSnapshot(runtime) {
  return {
    session: runtime.session,
    tasks: runtime.tasks.snapshot(),
    agents: runtime.agents.snapshot(),
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
    ? await state.loadRuntimeSnapshot().catch(() => ({ tasks: [], agents: [], permissions: {}, plugins: [] }))
    : { tasks: [], agents: [], permissions: {}, plugins: [] };
  const filePolicy = await loadPolicyFile(options.policyPath, { includeDefaults: false });
  const providerConfig = await loadProviderConfig(options.providerConfigPath);
  const profilePolicy = getSandboxProfile(options.sandboxProfile);
  const policy = mergePolicy(profilePolicy, filePolicy);

  const events = new EventBus();
  const hooks = new HookDispatcher();
  const permissions = new PermissionEngine({ ...runtimeSnapshot.permissions, ...policy, ...options.permissions });
  const tasks = new TaskStore(runtimeSnapshot.tasks ?? []);
  const agents = new AgentManager(runtimeSnapshot.agents ?? []);
  const plugins = new PluginLoader(runtimeSnapshot.plugins ?? []);
  const providers = new ProviderRegistry(providerConfig);
  const tools = new ToolRegistry();
  const promptBuilder = new SystemPromptBuilder();

  for (const provider of createProviderBlueprint()) {
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

  // Memory and skills bind to session.cwd (correct for both new and resumed sessions)
  const memory = new MemoryManager({ projectDir: cwd });
  const skills = new SkillLoader(path.join(cwd, 'skills'));

  if (options.pluginManifestPath) {
    await plugins.loadManifestFile(options.pluginManifestPath);
  }
  for (const plugin of options.plugins ?? []) {
    plugins.register(plugin);
  }
  const builtinToolConflicts = tools.registerPluginTools(plugins.listTools());

  const commands = new CommandRegistry(createCommandRegistry());
  const builtinCommandConflicts = commands.registerPluginCommands(plugins.listCommands());

  const pluginDiagnostics = diagnosePluginConflicts(plugins, { builtinToolConflicts, builtinCommandConflicts });

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

  // Agent runner for multi-turn LLM conversations
  const runner = new AgentRunner({
    provider: {
      async complete({ systemPrompt, messages, tools }) {
        return providers.complete('anthropic', { systemPrompt, messages, tools });
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
    plugins,
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
    async persist() {
      await this.state.saveSession(this.session);
      await this.state.saveRuntimeSnapshot(createSnapshot(this));
    },
    async log(eventName, payload) {
      return this.telemetry.emit(eventName, payload);
    },
    async dispatchTurn(turn) {
      await this.log('turn:start', turn);
      const result = await this.loop.executeTurn(turn);
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
    async run(userMessage) {
      return this.runner.run({
        userMessage,
        systemPrompt: this.context.systemPrompt,
      });
    },
  };

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
    orchestration: {
      taskCount: runtime.tasks.list().length,
      agentCount: runtime.agents.list().length,
      pluginCount: runtime.plugins.list().length,
      commandCount: runtime.commands.list().length,
      toolCount: runtime.tools.list().length,
      hookEventCount: runtime.hooks.listEvents().length,
      pluginConflictCount: runtime.pluginDiagnostics.commandConflicts.length + runtime.pluginDiagnostics.toolConflicts.length,
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
