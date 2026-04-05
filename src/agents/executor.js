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

function createAgentSession(agent, execution, result) {
  return {
    id: `${agent.id}:${execution.kind}:${Date.now()}`,
    agentId: agent.id,
    execution,
    result,
    createdAt: new Date().toISOString(),
  };
}

export class AgentExecutor {
  constructor(runtime) {
    this.runtime = runtime;
  }

  createExecutionContext(agent, payload) {
    return {
      agentId: agent.id,
      taskId: payload.taskId ?? null,
      messageId: payload.messageId ?? null,
      correlationId: payload.correlationId ?? null,
      cwd: this.runtime.context.cwd,
      role: agent.role,
      scope: agent.scope,
      startedAt: new Date().toISOString(),
    };
  }

  async #persistAgent(agent, execution, result) {
    const previous = await this.runtime.state.loadAgentState(agent.id).catch(() => ({ runs: 0, completedTasks: 0, handledMessages: 0 }));
    const nextState = {
      agentId: agent.id,
      runs: Number(previous.runs ?? 0) + 1,
      completedTasks: Number(previous.completedTasks ?? 0) + (execution.kind === 'task' ? 1 : 0),
      handledMessages: Number(previous.handledMessages ?? 0) + (execution.kind === 'message' ? 1 : 0),
      lastExecution: execution,
      lastResult: result.finalText ?? '',
      updatedAt: new Date().toISOString(),
    };
    await this.runtime.state.saveAgentState(agent.id, nextState);
    await this.runtime.state.saveAgentSession(agent.id, createAgentSession(agent, execution, result));
    await this.runtime.state.appendAgentTranscript(agent.id, { execution, result, recordedAt: new Date().toISOString() });
  }

  async #run(agent, execution, userMessage, systemPrompt, tools) {
    const isolatedContext = createContextEnvelope({
      cwd: this.runtime.context.cwd,
      mode: `agent:${agent.id}`,
      metadata: this.createExecutionContext(agent, execution),
    });
    isolatedContext.systemPrompt = systemPrompt;

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
      hooks: this.runtime.hooks.fork(),
      tools,
      permissions: this.runtime.permissions,
    });
    runner.setRuntime({ ...this.runtime, context: isolatedContext });
    const result = await runner.run({ userMessage, systemPrompt: isolatedContext.systemPrompt, toolSchemas: tools.toSchemaList() });
    await this.#persistAgent(agent, execution, result);
    return {
      agentId: agent.id,
      execution,
      context: isolatedContext.metadata,
      finalText: result.finalText,
      turns: result.turns,
      stopReason: result.stopReason,
      usage: result.usage,
    };
  }

  async execute(agent, task) {
    const tools = buildToolRegistry(this.runtime, agent);
    const userMessage = [agent.prompt, agent.description, task.subject, task.description].filter(Boolean).join('\n\n') || 'Complete the assigned task.';
    return this.#run(agent, { kind: 'task', taskId: task.id }, userMessage, this.runtime.context.systemPrompt, tools);
  }

  async executeMessage(agent, message) {
    const tools = buildToolRegistry(this.runtime, agent);
    const userMessage = [message.body, JSON.stringify(message.payload ?? null)].filter(Boolean).join('\n\n') || 'Process inbox message.';
    return this.#run(agent, { kind: 'message', messageId: message.id, correlationId: message.correlationId }, userMessage, this.runtime.context.systemPrompt, tools);
  }
}
