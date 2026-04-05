import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createReplBlueprint, tokenizeForStreaming, streamText } from '../src/ui/repl.js';

test('REPL blueprint reports readline-ready mode', () => {
  const repl = createReplBlueprint();
  assert.equal(repl.mode, 'readline');
  assert.equal(repl.status, 'ready');
});

test('tokenizeForStreaming preserves text chunks', () => {
  const tokens = tokenizeForStreaming('hello world');
  assert.deepEqual(tokens, ['hello', ' ', 'world']);
});

test('streamText writes tokenized output incrementally', async () => {
  let written = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      written += chunk.toString();
      callback();
    },
  });
  await streamText(output, 'ship it');
  assert.equal(written, 'ship it\n');
});
