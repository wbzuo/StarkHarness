import { defineTool } from '../tools/types.js';

// Map MCP tools into the StarkHarness tool registry format
// Tool names are namespaced: mcp__{server}__{tool}
export function mapMcpTools(serverName, mcpTools = []) {
  return mcpTools.map((t) => ({
    name: `mcp__${serverName}__${t.name}`,
    capability: 'network',
    description: t.description ?? `MCP tool from ${serverName}`,
    inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    source: 'mcp',
    server: serverName,
    originalName: t.name,
  }));
}

// Create a tool definition that proxies calls to the MCP client
export function createMcpToolProxy(serverName, mcpTool, client) {
  const mapped = mapMcpTools(serverName, [mcpTool])[0];
  return defineTool({
    ...mapped,
    async execute(input = {}) {
      const result = await client.callTool(mcpTool.name, input);
      return { ok: true, tool: mapped.name, source: 'mcp', server: serverName, result };
    },
  });
}
