// maxTurns limits total tool executions, not API round-trips.
// A single response with N tool_use blocks counts as N turns.
const DEFAULT_MAX_TURNS = 25;

export class AgentRunner {
  constructor({ provider, hooks, tools, permissions, maxTurns = DEFAULT_MAX_TURNS }) {
    this.provider = provider;
    this.hooks = hooks;
    this.tools = tools;
    this.permissions = permissions;
    this.maxTurns = maxTurns;
  }

  async run({ userMessage, systemPrompt, toolSchemas }) {
    const messages = [{ role: 'user', content: userMessage }];
    const schemas = toolSchemas ?? this.tools.toSchemaList();
    const turns = [];
    let finalText = '';
    let stopReason = 'end_turn';
    let totalUsage = { input_tokens: 0, output_tokens: 0 };

    for (let i = 0; i < this.maxTurns; i++) {
      const response = await this.provider.complete({
        systemPrompt,
        messages,
        tools: schemas,
      });

      totalUsage.input_tokens += response.usage?.input_tokens ?? 0;
      totalUsage.output_tokens += response.usage?.output_tokens ?? 0;

      // Build assistant message content
      const assistantContent = [];
      if (response.text) assistantContent.push({ type: 'text', text: response.text });
      for (const tc of response.toolCalls) {
        assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({
        role: 'assistant',
        content: assistantContent.length === 1 && assistantContent[0].type === 'text'
          ? response.text
          : assistantContent,
      });

      // No tool calls — we're done
      if (response.toolCalls.length === 0) {
        finalText = response.text;
        stopReason = response.stopReason ?? 'end_turn';
        break;
      }

      // Execute each tool call through the hook pipeline
      const toolResults = [];
      for (const tc of response.toolCalls) {
        const turnResult = await this.#executeTool(tc);
        turns.push({ toolName: tc.name, toolId: tc.id, input: tc.input, result: turnResult });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify(turnResult),
        });
      }
      messages.push({ role: 'user', content: toolResults });

      // Check max turns
      if (turns.length >= this.maxTurns) {
        stopReason = 'max-turns';
        break;
      }
    }

    // Fire Stop hook
    await this.hooks.fire('Stop', { reason: stopReason, turns: turns.length });

    return { finalText, turns, messages, stopReason, usage: totalUsage };
  }

  async #executeTool(toolCall) {
    const tool = this.tools.get(toolCall.name);
    if (!tool) return { ok: false, reason: 'unknown-tool', tool: toolCall.name };

    // Permission check
    const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
    if (gate.decision === 'deny') return { ok: false, reason: 'permission-denied', tool: toolCall.name, gate };
    if (gate.decision === 'ask') return { ok: false, reason: 'permission-escalation-required', tool: toolCall.name, gate };

    // PreToolUse hook
    const preResult = await this.hooks.fire('PreToolUse', { toolName: toolCall.name, toolInput: toolCall.input });
    if (preResult.decision === 'deny') {
      return { ok: false, reason: 'hook-denied', tool: toolCall.name, hookReason: preResult.reason };
    }

    // Execute
    const result = await tool.execute(preResult.updatedInput ?? toolCall.input, this._runtime);

    // PostToolUse hook
    await this.hooks.fire('PostToolUse', { toolName: toolCall.name, toolInput: toolCall.input, toolResult: result });

    return result;
  }

  setRuntime(runtime) {
    this._runtime = runtime;
  }
}
