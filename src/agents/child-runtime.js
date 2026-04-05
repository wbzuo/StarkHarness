import { HookDispatcher } from '../kernel/hooks.js';
import { AgentRunner } from '../kernel/runner.js';
import { PermissionEngine } from '../permissions/engine.js';
import { ProviderRegistry, createProviderBlueprint } from '../providers/index.js';
import { ToolRegistry } from '../tools/registry.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { PluginLoader } from '../plugins/loader.js';

function buildToolRegistry({ cwd, plugins = [], allowedToolNames = [] }) {
  const tools = new ToolRegistry();
  const pluginLoader = new PluginLoader(plugins);
  const runtime = { context: { cwd }, session: { id: 'child-session' }, inbox: {}, tasks: {}, agents: {} };
  for (const tool of createBuiltinTools()) {
    tools.register(tool);
  }
  tools.registerPluginTools(pluginLoader.listTools());
  const allowed = new Set(allowedToolNames);
  if (allowed.size === 0) return tools;
  const filtered = new ToolRegistry();
  for (const tool of tools.list()) {
    if (allowed.has(tool.name)) filtered.register(tool);
  }
  filtered._runtime = runtime;
  return filtered;
}

async function executePayload(payload) {
  const providers = new ProviderRegistry(payload.providerConfig ?? {});
  for (const provider of createProviderBlueprint(payload.providerConfig ?? {})) {
    providers.register(provider);
  }

  const tools = buildToolRegistry({
    cwd: payload.cwd,
    plugins: payload.plugins ?? [],
    allowedToolNames: payload.allowedToolNames ?? [],
  });
  const hooks = new HookDispatcher();
  const permissions = new PermissionEngine(payload.permissions ?? {});

  const runner = new AgentRunner({
    provider: {
      complete: ({ systemPrompt, messages, tools: schemas, onTextChunk }) =>
        providers.completeWithStrategy({
          capability: 'chat',
          prefer: payload.agent?.model && payload.agent.model !== 'inherit' ? payload.agent.model : undefined,
          request: { systemPrompt, messages, tools: schemas, onTextChunk },
          retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
        }),
    },
    hooks,
    tools,
    permissions,
  });

  runner.setRuntime({ context: { cwd: payload.cwd } });
  return runner.run({
    userMessage: payload.userMessage,
    systemPrompt: payload.systemPrompt,
    toolSchemas: tools.toSchemaList(),
    onTextChunk: async (chunk) => {
      process.send?.({ type: 'chunk', chunk });
    },
  });
}

process.on('message', async (payload) => {
  try {
    const result = await executePayload(payload);
    process.send?.({ type: 'result', result });
  } catch (error) {
    process.send?.({
      type: 'error',
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
    });
  } finally {
    process.exit(0);
  }
});
