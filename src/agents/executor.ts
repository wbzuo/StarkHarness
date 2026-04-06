import { ToolRegistry } from '../tools/registry.js';
import { AgentRunner } from '../kernel/runner.js';
import { createContextEnvelope } from '../kernel/context.js';
import { createBuiltinTools } from '../tools/builtins/index.js';
import { createExecutionProvider } from '../runtime/sandbox.js';
import { summarizeAgentResult } from './summary.js';

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

function resolveIsolationMode(agent, runtime, tools) {
  const mode = agent.isolation === 'inline' ? 'local' : (agent.isolation ?? 'local');
  if (mode === 'local') return 'local';
  // Process/docker isolation requires portable tools (no delegate tools, no custom hooks)
  if ((runtime.hooks.listHandlers?.() ?? []).length > 0) return 'local';
  const portableToolNames = new Set([
    ...createBuiltinTools()
      .filter((tool) => tool.capability !== 'delegate')
      .map((tool) => tool.name),
    ...runtime.plugins.listTools().map((tool) => tool.name),
  ]);
  const allPortable = tools.list().every((tool) => portableToolNames.has(tool.name) && tool.capability !== 'delegate');
  return allPortable ? mode : 'local';
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

  async #runIsolated(agent, execution, payload, options = {}) {
    const mode = resolveIsolationMode(agent, this.runtime, buildToolRegistry(this.runtime, agent));
    const provider = createExecutionProvider(mode);
    return provider.execute({
      cwd: this.runtime.context.cwd,
      providerConfig: this.runtime.providers.config,
      permissions: this.runtime.permissions.snapshot(),
      plugins: this.runtime.plugins.snapshot(),
      allowedToolNames: payload.allowedToolNames,
      agent,
      execution,
      userMessage: payload.userMessage,
      systemPrompt: payload.systemPrompt,
    }, { onTextChunk: options.onTextChunk });
  }

  async #persistAgent(agent, execution, result) {
    const previous = await this.runtime.state.loadAgentState(agent.id).catch(() => ({ runs: 0, completedTasks: 0, handledMessages: 0 }));
    const prevUsage = previous.usage ?? { inputTokens: 0, outputTokens: 0 };
    const raw = result.usage ?? {};
    // Normalize snake_case (from runner) and camelCase usage keys
    const curInputTokens = Number(raw.inputTokens ?? raw.input_tokens ?? 0);
    const curOutputTokens = Number(raw.outputTokens ?? raw.output_tokens ?? 0);
    const nextState = {
      agentId: agent.id,
      runs: Number(previous.runs ?? 0) + 1,
      completedTasks: Number(previous.completedTasks ?? 0) + (execution.kind === 'task' ? 1 : 0),
      handledMessages: Number(previous.handledMessages ?? 0) + (execution.kind === 'message' ? 1 : 0),
      lastExecution: execution,
      lastResult: result.finalText ?? '',
      lastSummary: summarizeAgentResult({ agent, execution, result }),
      usage: {
        inputTokens: Number(prevUsage.inputTokens ?? 0) + curInputTokens,
        outputTokens: Number(prevUsage.outputTokens ?? 0) + curOutputTokens,
      },
      lastUsage: { inputTokens: curInputTokens, outputTokens: curOutputTokens },
      updatedAt: new Date().toISOString(),
    };
    await this.runtime.state.saveAgentState(agent.id, nextState);
    await this.runtime.state.saveAgentSession(agent.id, createAgentSession(agent, execution, result));
    await this.runtime.state.appendAgentTranscript(agent.id, { execution, result, recordedAt: new Date().toISOString() });
  }

  async #run(agent, execution, userMessage, systemPrompt, tools, options = {}) {
    const isolatedContext = createContextEnvelope({
      cwd: this.runtime.context.cwd,
      mode: `agent:${agent.id}`,
      metadata: this.createExecutionContext(agent, execution),
    });
    isolatedContext.systemPrompt = systemPrompt;

    const isolationMode = resolveIsolationMode(agent, this.runtime, tools);
    if (isolationMode !== 'local') {
      const result = await this.#runIsolated(agent, execution, {
        allowedToolNames: tools.list().map((tool) => tool.name),
        userMessage,
        systemPrompt: isolatedContext.systemPrompt,
      }, options);
      await this.#persistAgent(agent, execution, result);
      return {
        agentId: agent.id,
        execution,
        context: isolatedContext.metadata,
        finalText: result.finalText,
        turns: result.turns,
        stopReason: result.stopReason,
        usage: result.usage,
        isolation: isolationMode,
      };
    }

    const runner = new AgentRunner({
      provider: {
        complete: ({ systemPrompt, messages, tools: schemas, onTextChunk }) =>
          this.runtime.providers.completeWithStrategy({
            capability: 'chat',
            prefer: agent.model && agent.model !== 'inherit' ? agent.model : undefined,
            request: { systemPrompt, messages, tools: schemas, onTextChunk },
            retryOptions: { maxRetries: 2, baseDelay: 50, timeout: 120000 },
          }),
      },
      hooks: this.runtime.hooks.fork(),
      tools,
      permissions: this.runtime.permissions,
    });
    runner.setRuntime({ ...this.runtime, context: isolatedContext });
    const result = await runner.run({
      userMessage,
      systemPrompt: isolatedContext.systemPrompt,
      toolSchemas: tools.toSchemaList(),
      onTextChunk: options.onTextChunk,
    });
    await this.#persistAgent(agent, execution, result);
    return {
      agentId: agent.id,
      execution,
      context: isolatedContext.metadata,
      finalText: result.finalText,
      turns: result.turns,
      stopReason: result.stopReason,
      usage: result.usage,
      isolation: 'local',
    };
  }

  async execute(agent, task, options = {}) {
    const tools = buildToolRegistry(this.runtime, agent);
    const userMessage = [agent.prompt, agent.description, task.subject, task.description].filter(Boolean).join('\n\n') || 'Complete the assigned task.';
    return this.#run(agent, { kind: 'task', taskId: task.id }, userMessage, this.runtime.context.systemPrompt, tools, { ...options, task });
  }

  async executeMessage(agent, message, options = {}) {
    const tools = buildToolRegistry(this.runtime, agent);
    const userMessage = [message.body, JSON.stringify(message.payload ?? null)].filter(Boolean).join('\n\n') || 'Process inbox message.';
    return this.#run(agent, { kind: 'message', messageId: message.id, correlationId: message.correlationId }, userMessage, this.runtime.context.systemPrompt, tools, { ...options, payload: message.payload, message });
  }
}
