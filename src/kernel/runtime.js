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
import { createCommandRegistry } from '../commands/registry.js';
import { createWorkspaceBlueprint } from '../workspace/index.js';
import { createBridgeBlueprint } from '../bridge/index.js';
import { createReplBlueprint } from '../ui/repl.js';
import { createTelemetrySink } from '../telemetry/index.js';

export function createRuntime(options = {}) {
  const events = new EventBus();
  const permissions = new PermissionEngine(options.permissions);
  const tasks = new TaskStore();
  const agents = new AgentManager();
  const plugins = new PluginLoader();
  const providers = new ProviderRegistry();
  const tools = new ToolRegistry();

  for (const provider of createProviderBlueprint()) {
    providers.register(provider);
  }

  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }

  const telemetry = createTelemetrySink();
  const session = createSession(options.session);
  const context = createContextEnvelope({ cwd: session.cwd, mode: session.mode });

  return {
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
    commands: createCommandRegistry(),
    capabilities: createCapabilityMap(),
    workspace: createWorkspaceBlueprint(),
    bridge: createBridgeBlueprint(),
    ui: createReplBlueprint(),
    async dispatchTurn(turn) {
      const tool = this.tools.get(turn.tool);
      if (!tool) throw new Error(`Unknown tool: ${turn.tool}`);
      const gate = this.permissions.evaluate({ capability: tool.capability });
      if (gate.decision === 'deny') {
        return { ok: false, reason: 'permission-denied', tool: tool.name, gate };
      }
      if (gate.decision === 'ask') {
        return { ok: false, reason: 'permission-escalation-required', tool: tool.name, gate };
      }
      const result = await tool.execute(turn.input, this);
      this.session.turns.push({ turn, result });
      return result;
    },
  };
}

export function createBlueprintDocument(runtime) {
  return {
    name: 'StarkHarness',
    session: runtime.session,
    kernel: ['session', 'runtime', 'loop', 'context', 'events'],
    commands: runtime.commands,
    providers: runtime.providers.list(),
    tools: runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })),
    capabilities: runtime.capabilities,
    workspace: runtime.workspace,
    bridge: runtime.bridge,
    ui: runtime.ui,
  };
}
