export class AgentLoop {
  constructor({ hooks, tools, permissions }) {
    this.hooks = hooks;
    this.tools = tools;
    this.permissions = permissions;
    this.turnLog = [];
  }

  async executeTurn(turn) {
    const { tool: toolName, input = {} } = turn;
    const tool = this.tools.get(toolName);
    if (!tool) return { ok: false, reason: 'unknown-tool', tool: toolName };

    // 1. Permission check
    const gate = this.permissions.evaluate({ capability: tool.capability, toolName: tool.name });
    if (gate.decision === 'deny') return { ok: false, reason: 'permission-denied', tool: toolName, gate };
    if (gate.decision === 'ask') return { ok: false, reason: 'permission-escalation-required', tool: toolName, gate };

    // 2. PreToolUse hooks
    const preResult = await this.hooks.fire('PreToolUse', { toolName, toolInput: input });
    if (preResult.decision === 'deny') {
      return { ok: false, reason: 'hook-denied', tool: toolName, hookReason: preResult.reason };
    }
    const effectiveInput = preResult.updatedInput ?? input;

    // 3. Execute tool
    const result = await tool.execute(effectiveInput, this._runtime);

    // 4. PostToolUse hooks
    const postResult = await this.hooks.fire('PostToolUse', { toolName, toolInput: effectiveInput, toolResult: result });

    // 5. Record turn
    const record = {
      turn,
      result,
      preHook: preResult,
      postHook: postResult,
      recordedAt: new Date().toISOString(),
    };
    this.turnLog.push(record);

    return { ...result, postHook: postResult };
  }

  async requestStop(reason) {
    const result = await this.hooks.fire('Stop', { reason });
    return result.decision !== 'deny';
  }

  setRuntime(runtime) {
    this._runtime = runtime;
  }
}

// Backward compat
export async function runHarnessTurn(runtime, turn) {
  runtime.events.emit('turn:start', turn);
  const result = await runtime.dispatchTurn(turn);
  runtime.events.emit('turn:end', result);
  return result;
}
