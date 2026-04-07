import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInteractivePrompts } from '../src/ui/prompts.js';
import { stripAnsi } from '../src/ui/theme.js';

test('attachInteractivePrompts wires interactive approval and questions onto the runtime', async () => {
  const written = [];
  const asked = [];
  const rl = {
    output: {
      write(data) { written.push(data); },
    },
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

  // Permission info is now written to the output stream, not via rl.question prompt
  const permissionOutput = stripAnsi(written.join(''));
  assert.match(permissionOutput, /Permission Required/);
  assert.match(permissionOutput, /shell/);
  assert.match(permissionOutput, /git push/);

  // Question is also written to output stream
  const questionOutput = stripAnsi(written.join(''));
  assert.match(questionOutput, /Which model/);
});
