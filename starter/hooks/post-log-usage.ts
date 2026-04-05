// PostToolUse hook that logs tool execution for observability
export default {
  event: 'PostToolUse',
  matcher: '*',
  async handler({ toolName, toolResult }) {
    const ok = toolResult?.ok ?? false;
    const ts = new Date().toISOString();
    console.error(`[${ts}] tool=${toolName} ok=${ok}`);
    return { decision: 'allow' };
  },
};
