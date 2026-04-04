// Demonstrates MCP server integration (requires an MCP server binary)
import { createRuntime } from '../src/kernel/runtime.js';

const runtime = await createRuntime({
  session: { cwd: process.cwd(), goal: 'mcp demo' },
  mcpConfig: {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
  },
});

console.log('Registered tools:', runtime.tools.list().map((t) => t.name));
console.log('MCP clients:', [...runtime.mcpClients.keys()]);

// Cleanup
for (const client of runtime.mcpClients.values()) {
  await client.disconnect();
}
