import path from 'node:path';
import { EventBus } from './events.js';
import { createContextEnvelope } from './context.js';
import { createSession } from './session.js';
import { PermissionEngine } from '../permissions/engine.js';
import { TaskStore } from '../tasks/store.js';
import { AgentManager } from '../agents/manager.js';
import { PluginLoader } from '../plugins/loader.js';
import { ProviderRegistry, createProviderBlueprint } from '../providers/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { createCapabilityMap } from '../capabilities/index.js';
import { createCommandRegistry, CommandRegistry } from '../commands/registry.js';
import { createWorkspaceBlueprint } from '../workspace/index.js';
import { createBridgeBlueprint } from '../bridge/index.js';
import { createReplBlueprint } from '../ui/repl.js';
import { createTelemetrySink } from '../telemetry/index.js';
import { StateStore } from '../state/store.js';
import { loadPolicyFile } from '../permissions/policy.js';

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
  const policy = await loadPolicyFile(options.policyPath);

  const events = new EventBus();
  const permissions = new PermissionEngine({ ...runtimeSnapshot.permissions, ...policy, ...options.permissions });
  const tasks = new TaskStore(runtimeSnapshot.tasks ?? []);
  const agents = new AgentManager(runtimeSnapshot.agents ?? []);
  const plugins = new PluginLoader(runtimeSnapshot.plugins ?? []);
  const providers = new ProviderRegistry();
  const tools = new ToolRegistry();

  for (const provider of createProviderBlueprint()) {
    providers.register(provider);
  }

  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }

  const telemetry = createTelemetrySink({ rootDir: stateDir });
  await telemetry.init();

  const session = resumed ?? createSession(options.session);
  const context = createContextEnvelope({ cwd: session.cwd, mode: session.mode });
  if (options.pluginManifestPath) {
    await plugins.loadManifestFile(options.pluginManifestPath);
  }
  for (const plugin of options.plugins ?? []) {
    plugins.register(plugin);
  }

  const commands = new CommandRegistry(createCommandRegistry());

  const runtime = {
    session,
    context,
    events,
    permissions,
    tasks,
    agents,
    plugins,
    providers,
    tools,
    telemetry,
    state,
    commands,
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
      const tool = this.tools.get(turn.tool);
      if (!tool) throw new Error(`Unknown tool: ${turn.tool}`);

      const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
      if (gate.decision === 'deny') {
        const denied = { ok: false, reason: 'permission-denied', tool: tool.name, gate };
        await this.log('turn:denied', denied);
        return denied;
      }
      if (gate.decision === 'ask') {
        const gated = { ok: false, reason: 'permission-escalation-required', tool: tool.name, gate };
        await this.log('turn:gated', gated);
        return gated;
      }

      const result = await tool.execute(turn.input, this);
      this.session.turns.push({
        turn,
        result,
        recordedAt: new Date().toISOString(),
      });
      await this.persist();
      await this.log('turn:complete', { turn, result });
      return result;
    },
    async dispatchCommand(name, args = {}) {
      await this.log('command:start', { name, args });
      const result = await this.commands.dispatch(name, this, args);
      await this.log('command:complete', { name, args, result });
      return result;
    },
  };

  await runtime.persist();
  await runtime.log('runtime:boot', { sessionId: runtime.session.id, stateDir, resumed: Boolean(options.resumeSessionId) });
  return runtime;
}

export function createBlueprintDocument(runtime) {
  return {
    name: 'StarkHarness',
    session: runtime.session,
    kernel: ['session', 'runtime', 'loop', 'context', 'events'],
    commands: runtime.commands.list(),
    providers: runtime.providers.list(),
    tools: runtime.tools.list().map(({ name, capability, description }) => ({
      name,
      capability,
      description,
    })),
    capabilities: runtime.capabilities,
    workspace: runtime.workspace,
    bridge: runtime.bridge,
    ui: runtime.ui,
    orchestration: {
      taskCount: runtime.tasks.list().length,
      agentCount: runtime.agents.list().length,
      pluginCount: runtime.plugins.list().length,
    },
    policy: runtime.permissions.snapshot(),
    plugins: {
      count: runtime.plugins.list().length,
      capabilities: runtime.plugins.listCapabilities(),
    },
    persistence: {
      rootDir: runtime.state.rootDir,
      sessionPath: runtime.state.getSessionPath(runtime.session.id),
      runtimePath: runtime.state.runtimePath,
      transcriptPath: runtime.telemetry.transcriptPath,
    },
  };
}
