import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMcpConfig, validateMcpServer } from '../src/mcp/config.js';
import { mapMcpTools } from '../src/mcp/tools.js';

test('parseMcpConfig reads server definitions', () => {
  const config = {
    mcpServers: {
      'context7': {
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        env: { API_KEY: 'test' },
      },
      'filesystem': {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
    },
  };
  const servers = parseMcpConfig(config);
  assert.equal(servers.length, 2);
  assert.equal(servers[0].name, 'context7');
  assert.equal(servers[0].command, 'npx');
  assert.deepEqual(servers[0].args, ['-y', '@upstash/context7-mcp']);
  assert.deepEqual(servers[0].env, { API_KEY: 'test' });
});

test('validateMcpServer rejects invalid configs', () => {
  assert.equal(validateMcpServer({}).valid, false);
  assert.equal(validateMcpServer({ command: 'npx' }).valid, true);
  assert.equal(validateMcpServer({ command: '' }).valid, false);
});

test('mapMcpTools converts MCP tool list to tool registry format', () => {
  const mcpTools = [
    {
      name: 'query-docs',
      description: 'Query documentation',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    },
  ];
  const mapped = mapMcpTools('context7', mcpTools);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].name, 'mcp__context7__query-docs');
  assert.equal(mapped[0].capability, 'network');
  assert.equal(mapped[0].source, 'mcp');
  assert.equal(mapped[0].server, 'context7');
  assert.equal(mapped[0].originalName, 'query-docs');
});

test('mapMcpTools preserves input schemas', () => {
  const mcpTools = [
    {
      name: 'read',
      description: 'Read resource',
      inputSchema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] },
    },
  ];
  const mapped = mapMcpTools('fs', mcpTools);
  assert.deepEqual(mapped[0].inputSchema.required, ['uri']);
});
