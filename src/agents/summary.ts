export function summarizeAgentResult({ agent, execution, result }) {
  const toolCount = Array.isArray(result?.turns) ? result.turns.length : 0;
  const finalText = String(result?.finalText ?? '').trim();
  const headline = finalText
    ? finalText.replace(/\s+/g, ' ').slice(0, 160)
    : `${agent.role} completed ${execution.kind}`;

  return {
    headline,
    toolCount,
    stopReason: result?.stopReason ?? null,
    executionKind: execution.kind,
    updatedAt: new Date().toISOString(),
  };
}
