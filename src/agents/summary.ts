export function summarizeAgentResultFallback({ agent, execution, result }) {
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

export async function summarizeAgentResult({ agent, execution, result, provider = null }) {
  const fallback = summarizeAgentResultFallback({ agent, execution, result });
  if (!provider?.complete) return fallback;

  try {
    const response = await provider.complete({
      systemPrompt: 'Summarize the agent result into one short headline plus the key outcome. Return JSON with keys headline and outcome.',
      messages: [{
        role: 'user',
        content: JSON.stringify({
          agent: {
            id: agent.id,
            role: agent.role,
            description: agent.description,
          },
          execution,
          result: {
            finalText: result?.finalText ?? '',
            stopReason: result?.stopReason ?? null,
            turns: Array.isArray(result?.turns) ? result.turns.length : 0,
            usage: result?.usage ?? {},
          },
        }),
      }],
      tools: [],
    });
    const parsed = JSON.parse(response.text ?? '{}');
    return {
      ...fallback,
      headline: String(parsed.headline ?? fallback.headline),
      outcome: typeof parsed.outcome === 'string' ? parsed.outcome : null,
      strategy: 'llm',
    };
  } catch {
    return {
      ...fallback,
      strategy: 'fallback',
    };
  }
}
