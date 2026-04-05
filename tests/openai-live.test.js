import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseOpenAIResponse,
  streamChatCompletionsAPI,
} from '../src/providers/openai-live.js';

test('parseOpenAIResponse extracts text and tool calls', () => {
  const parsed = parseOpenAIResponse({
    choices: [{
      finish_reason: 'tool_calls',
      message: {
        content: 'Planning',
        tool_calls: [{
          id: 'call_1',
          function: { name: 'read_file', arguments: '{"path":"src/index.js"}' },
        }],
      },
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });

  assert.equal(parsed.text, 'Planning');
  assert.equal(parsed.toolCalls.length, 1);
  assert.equal(parsed.toolCalls[0].name, 'read_file');
  assert.deepEqual(parsed.toolCalls[0].input, { path: 'src/index.js' });
  assert.equal(parsed.stopReason, 'tool_use');
});

test('streamChatCompletionsAPI emits text deltas from SSE responses', async () => {
  const originalFetch = global.fetch;
  const encoder = new TextEncoder();
  global.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}',
        '',
        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":{"prompt_tokens":8,"completion_tokens":2}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')));
      controller.close();
    },
  }), { status: 200 });

  try {
    const chunks = [];
    const result = await streamChatCompletionsAPI({
      apiKey: 'test',
      baseUrl: 'https://example.com',
      messages: [{ role: 'user', content: 'hi' }],
      onTextChunk: async (chunk) => {
        chunks.push(chunk);
      },
    });

    assert.equal(result.streamed, true);
    assert.equal(result.text, 'Hello');
    assert.deepEqual(chunks, ['Hel', 'lo']);
    assert.equal(result.usage.input_tokens, 8);
    assert.equal(result.usage.output_tokens, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
