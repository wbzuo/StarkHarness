import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMessages,
  formatTools,
  parseContentBlocks,
  buildRequestBody,
  callMessagesAPI,
  streamMessagesAPI,
} from '../src/providers/anthropic-live.js';

test('formatMessages converts context messages to Anthropic format', () => {
  const messages = [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there' },
    { role: 'user', content: 'Read file foo.js' },
  ];
  const formatted = formatMessages(messages);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[0].role, 'user');
  assert.equal(formatted[0].content, 'Hello');
});

test('formatMessages handles tool_result messages', () => {
  const messages = [
    { role: 'user', content: 'Read foo.js' },
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: 'foo.js' } }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: 'file contents here' }],
    },
  ];
  const formatted = formatMessages(messages);
  assert.equal(formatted.length, 3);
  assert.equal(formatted[2].content[0].type, 'tool_result');
});

test('formatTools converts tool schemas to Anthropic tool format', () => {
  const schemas = [
    {
      name: 'read_file',
      description: 'Read a file',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  ];
  const tools = formatTools(schemas);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'read_file');
  assert.equal(tools[0].input_schema.type, 'object');
});

test('parseContentBlocks extracts text and tool_use from response', () => {
  const response = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Let me read that file.' },
      { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: { path: 'foo.js' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };

  const parsed = parseContentBlocks(response);
  assert.equal(parsed.text, 'Let me read that file.');
  assert.equal(parsed.toolCalls.length, 1);
  assert.equal(parsed.toolCalls[0].name, 'read_file');
  assert.equal(parsed.toolCalls[0].id, 'toolu_1');
  assert.deepEqual(parsed.toolCalls[0].input, { path: 'foo.js' });
  assert.equal(parsed.stopReason, 'tool_use');
  assert.equal(parsed.usage.input_tokens, 100);
});

test('parseContentBlocks handles text-only final response', () => {
  const response = {
    id: 'msg_2',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Done! The file has been updated.' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 200, output_tokens: 30 },
  };

  const parsed = parseContentBlocks(response);
  assert.equal(parsed.text, 'Done! The file has been updated.');
  assert.equal(parsed.toolCalls.length, 0);
  assert.equal(parsed.stopReason, 'end_turn');
});

test('buildRequestBody assembles a valid API request', () => {
  const body = buildRequestBody({
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a coding assistant.',
    messages: [{ role: 'user', content: 'Hello' }],
    tools: [{ name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: {} } }],
    maxTokens: 4096,
  });

  assert.equal(body.model, 'claude-sonnet-4-20250514');
  assert.equal(body.system, 'You are a coding assistant.');
  assert.equal(body.messages.length, 1);
  assert.equal(body.tools.length, 1);
  assert.equal(body.max_tokens, 4096);
});

test('callMessagesAPI throws without API key', async () => {
  await assert.rejects(() => callMessagesAPI({}), /ANTHROPIC_API_KEY is required/);
});

test('streamMessagesAPI emits text chunks from SSE responses', async () => {
  const originalFetch = global.fetch;
  const encoder = new TextEncoder();
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode([
        'event: message_start',
        'data: {"type":"message_start","message":{"usage":{"input_tokens":11}}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
        '',
        'event: content_block_delta',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
        '',
        'event: message_delta',
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
        '',
      ].join('\n')));
      controller.close();
    },
  }), { status: 200 });

  try {
    const chunks = [];
    const result = await streamMessagesAPI({
      apiKey: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      onTextChunk: async (chunk) => {
        chunks.push(chunk);
      },
    });

    assert.equal(result.streamed, true);
    assert.equal(result.text, 'Hello');
    assert.deepEqual(chunks, ['Hel', 'lo']);
    assert.equal(result.usage.input_tokens, 11);
    assert.equal(result.usage.output_tokens, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
