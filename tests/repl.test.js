import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplBlueprint } from '../src/ui/repl.js';

test('REPL blueprint reports readline-ready mode', () => {
  const repl = createReplBlueprint();
  assert.equal(repl.mode, 'readline');
  assert.equal(repl.status, 'ready');
});
