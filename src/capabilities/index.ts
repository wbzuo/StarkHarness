export function createCapabilityMap() {
  return {
    kernel: ['session', 'runtime', 'loop', 'context', 'events'],
    providers: ['anthropic', 'openai', 'compatible'],
    tools: ['fs', 'shell', 'search', 'web', 'mcp', 'lsp', 'orchestration'],
    orchestration: ['agents', 'team', 'tasks', 'handoff'],
    interfaces: ['cli', 'repl', 'bridge', 'remote'],
    advanced: ['browser', 'computer-use', 'voice', 'telemetry'],
  };
}
