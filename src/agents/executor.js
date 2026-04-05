import { ToolRegistry } from '../tools/registry.js';
import { AgentRunner } from '../kernel/runner.js';

function buildToolRegistry(runtime, agent) {
  const registry = new ToolRegistry();
  const whitelist = Array.isArray(agent.tools) && agent.tools.length > 0 ? new Set(agent.tools) : null;
  for (const tool of runtime.tools.list()) {
    if (!whitelist || whitelist.has(tool.name)) registry.register(tool);
  }
  return registry;
}

export class AgentExecutor {
  constructor(runtime) {
    this.runtime = runtime;
  }

  async execute(agent, task) {
    const tools = buildToolRegistry(this.runtime, agent);
    const runner = new AgentRunner({
      provider: {
        complete: ({ systemPrompt, messages, tools: schemas }) =>
          this.runtime.providers.completeWithStrategy({
            capability: schemas?.length ? 'chat' : 'chat',
            prefer: agent.model && agent.model !== 'inherit' ? agent.model : undefined,
            request: { systemPrompt, messages, tools: schemas },
            retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
          }),
      },
      hooks: this.runtime.hooks,
      tools,
      permissions: this.runtime.permissions,
    });
    runner.setRuntime(this.runtime);
    const userMessage = [agent.prompt, agent.description, task.subject, task.description].filter(Boolean).join('\n\n') || 'Complete the assigned task.';
    return runner.run({ userMessage, systemPrompt: this.runtime.context.systemPrompt, toolSchemas: tools.toSchemaList() });
  }
}
