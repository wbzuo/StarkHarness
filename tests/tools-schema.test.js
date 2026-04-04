import test from 'node:test';
import assert from 'node:assert/strict';
import { defineTool } from '../src/tools/types.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { createBuiltinTools } from '../src/tools/builtins/index.js';

test('defineTool requires inputSchema', () => {
  assert.throws(() => defineTool({
    name: 'test', capability: 'read', description: 'test', execute: () => {},
  }), /inputSchema/);
});

test('defineTool accepts valid inputSchema', () => {
  const tool = defineTool({
    name: 'test',
    capability: 'read',
    description: 'test',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    execute: () => {},
  });
  assert.equal(tool.inputSchema.type, 'object');
});

test('all builtin tools have inputSchema', () => {
  const tools = createBuiltinTools();
  for (const tool of tools) {
    assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema must be object`);
  }
});

test('ToolRegistry.toSchemaList generates LLM-ready tool list', () => {
  const registry = new ToolRegistry();
  const tools = createBuiltinTools();
  tools.forEach((t) => registry.register(t));
  const schemas = registry.toSchemaList();
  assert.ok(schemas.length >= 10);
  for (const schema of schemas) {
    assert.ok(schema.name);
    assert.ok(schema.description);
    assert.ok(schema.input_schema);
    assert.equal(schema.input_schema.type, 'object');
  }
});
