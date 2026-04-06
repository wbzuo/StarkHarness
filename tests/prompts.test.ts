import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInteractivePrompts } from '../src/ui/prompts.js';

test('attachInteractivePrompts wires interactive approval and questions onto the runtime', async () => {
  const asked = [];
  const rl = {
    async question(prompt) {
      asked.push(prompt);
      return asked.length === 1 ? 'yes' : 'second answer';
    },
  };
  const runtime = {};

  attachInteractivePrompts(runtime, rl);

  const approved = await runtime.requestPermission({
    toolName: 'shell',
    capability: 'exec',
    toolInput: { command: 'git push' },
    gate: { reason: 'remote mutation' },
  });
  const answer = await runtime.askUserQuestion({
    question: 'Which model?',
    choices: ['openai', 'anthropic'],
  });

  assert.equal(approved, true);
  assert.equal(answer, 'second answer');
  assert.match(asked[0], /Permission required for shell/);
  assert.match(asked[1], /Which model/);
});
