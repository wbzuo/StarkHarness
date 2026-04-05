import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplBlueprint, tokenizeForStreaming } from '../src/ui/repl.js';

test('REPL blueprint reports readline-ready mode', () => {
  const repl = createReplBlueprint();
  assert.equal(repl.mode, 'readline');
  assert.equal(repl.status, 'ready');
});

test('tokenizeForStreaming preserves text chunks', () => {
  const tokens = tokenizeForStreaming('hello world');
  assert.deepEqual(tokens, ['hello', ' ', 'world']);
});
