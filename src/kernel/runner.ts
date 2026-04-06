// maxTurns limits total tool executions, not API round-trips.
// A single response with N tool_use blocks counts as N turns.
import { tokenizeForStreaming } from '../utils/text.js';
import { compactMessages, estimateTokens, summarizeMessages } from './context.js';

const DEFAULT_MAX_TURNS = 25;
const DEFAULT_COMPACT_THRESHOLD = 60000;

async function emitTextChunks(onTextChunk, text) {
  if (typeof onTextChunk !== 'function' || !text) return;
  for (const chunk of tokenizeForStreaming(text)) {
    await onTextChunk(chunk);
  }
}

export class AgentRunner {
  constructor({ provider, hooks, tools, permissions, maxTurns = DEFAULT_MAX_TURNS }) {
    this.provider = provider;
    this.hooks = hooks;
    this.tools = tools;
    this.permissions = permissions;
    this.maxTurns = maxTurns;
  }

  async run({ userMessage, systemPrompt, toolSchemas, onTextChunk, compactThreshold = DEFAULT_COMPACT_THRESHOLD, permissions }) {
    let messages = [{ role: 'user', content: userMessage }];
    const schemas = toolSchemas ?? this.tools.toSchemaList();
    const turns = [];
    let finalText = '';
    let stopReason = 'end_turn';
    let totalUsage = { input_tokens: 0, output_tokens: 0 };
    let compactions = 0;
    const maxApiCalls = Math.max(1, this.maxTurns + 1);
    const effectivePermissions = permissions ?? this.permissions;

    for (let i = 0; i < maxApiCalls; i++) {
      // Auto-compact when messages grow beyond threshold
      if (compactThreshold > 0 && messages.length > 4) {
        const result = await this.#compactMessagesWithLlm(messages, { maxTokens: compactThreshold });
        if (result.compacted) {
          await this.hooks.fire('PreCompact', { messageCount: messages.length, removed: result.removed, estimatedTokens: result.estimatedTokens, strategy: result.strategy ?? 'mechanical' });
          messages = result.messages;
          compactions++;
        }
      }

      const response = await this.provider.complete({
        systemPrompt,
        messages,
        tools: schemas,
        onTextChunk,
      });

      totalUsage.input_tokens += response.usage?.input_tokens ?? 0;
      totalUsage.output_tokens += response.usage?.output_tokens ?? 0;
      if (response.streamed !== true) {
        await emitTextChunks(onTextChunk, response.text);
      }

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
      const remainingTurns = Math.max(0, this.maxTurns - turns.length);
      const toolCallsToExecute = response.toolCalls.slice(0, remainingTurns);
      if (toolCallsToExecute.length === 0) {
        stopReason = 'max-turns';
        break;
      }
      const toolResults = [];
      for (const tc of toolCallsToExecute) {
        const turnResult = await this.#executeTool(tc, effectivePermissions);
        turns.push({ toolName: tc.name, toolId: tc.id, input: tc.input, result: turnResult });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: JSON.stringify(turnResult),
        });
      }
      messages.push({ role: 'user', content: toolResults });

      // Check max turns
      if (toolCallsToExecute.length < response.toolCalls.length || turns.length >= this.maxTurns) {
        stopReason = 'max-turns';
        break;
      }
    }

    // Fire Stop hook — deny means a hook wants to prevent stopping
    const stopResult = await this.hooks.fire('Stop', { reason: stopReason, turns: turns.length });

    return { finalText, turns, messages, stopReason, stopHook: stopResult.decision, usage: totalUsage, compactions };
  }

  async #executeTool(toolCall, permissions) {
    const tool = this.tools.get(toolCall.name);
    if (!tool) return { ok: false, reason: 'unknown-tool', tool: toolCall.name };

    // Permission check
    const gate = permissions.evaluate({ capability: tool.capability, toolName: tool.name, toolInput: toolCall.input, cwd: this._runtime?.context?.cwd });
    if (gate.decision === 'deny') return { ok: false, reason: 'permission-denied', tool: toolCall.name, gate };
    if (gate.decision === 'ask') {
      const approved = await this._runtime?.requestPermission?.({
        toolName: toolCall.name,
        capability: tool.capability,
        toolInput: toolCall.input,
        gate,
      });
      if (approved !== true) {
        return { ok: false, reason: 'permission-escalation-required', tool: toolCall.name, gate };
      }
    }

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

  async #compactMessagesWithLlm(messages, { maxTokens = DEFAULT_COMPACT_THRESHOLD, keepRecent = 6 } = {}) {
    const estimate = estimateTokens(messages);
    if (estimate < maxTokens) {
      return { compacted: false, messages, removed: 0, estimatedTokens: estimate, strategy: 'none' };
    }

    const keep = Math.max(keepRecent, Math.floor(messages.length * 0.25));
    const removed = messages.slice(0, -keep);
    let summary = '';

    try {
      const serialized = removed
        .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`)
        .join('\n\n');
      const response = await this.provider.complete({
        systemPrompt: 'Summarize the earlier conversation context for continued agent work. Preserve user goals, files touched, tool usage, constraints, and unresolved work. Return only the summary.',
        messages: [{ role: 'user', content: serialized }],
        tools: [],
      });
      summary = response.text?.trim() ?? '';
    } catch {}

    const fallback = summarizeMessages(removed);
    const result = compactMessages(messages, {
      maxTokens,
      keepRecent,
      summaryOverride: summary
        ? `[Context compacted with LLM summary]\n${summary}`
        : fallback,
    });
    return {
      ...result,
      strategy: summary ? 'llm' : 'mechanical',
    };
  }
}
