import { ToolRegistry } from '../tools/registry.js';
import { AgentRunner } from '../kernel/runner.js';
import { createContextEnvelope } from '../kernel/context.js';

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

  createExecutionContext(agent, task) {
    return {
      agentId: agent.id,
      taskId: task.id,
      cwd: this.runtime.context.cwd,
      role: agent.role,
      scope: agent.scope,
      startedAt: new Date().toISOString(),
    };
  }

  async execute(agent, task) {
    const tools = buildToolRegistry(this.runtime, agent);
    const isolatedContext = createContextEnvelope({
      cwd: this.runtime.context.cwd,
      mode: `agent:${agent.id}`,
      metadata: this.createExecutionContext(agent, task),
    });
    isolatedContext.systemPrompt = this.runtime.context.systemPrompt;

    const runner = new AgentRunner({
      provider: {
        complete: ({ systemPrompt, messages, tools: schemas }) =>
          this.runtime.providers.completeWithStrategy({
            capability: 'chat',
            prefer: agent.model && agent.model !== 'inherit' ? agent.model : undefined,
            request: { systemPrompt, messages, tools: schemas },
            retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
          }),
      },
      hooks: this.runtime.hooks,
      tools,
      permissions: this.runtime.permissions,
    });
    runner.setRuntime({ ...this.runtime, context: isolatedContext });
    const userMessage = [agent.prompt, agent.description, task.subject, task.description].filter(Boolean).join('\n\n') || 'Complete the assigned task.';
    const result = await runner.run({ userMessage, systemPrompt: isolatedContext.systemPrompt, toolSchemas: tools.toSchemaList() });
    return {
      agentId: agent.id,
      taskId: task.id,
      context: isolatedContext.metadata,
      finalText: result.finalText,
      turns: result.turns,
      stopReason: result.stopReason,
      usage: result.usage,
    };
  }
}
