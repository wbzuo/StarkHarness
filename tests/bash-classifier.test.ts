import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyBashCommand } from '../src/security/bashClassifier.js';

test('classifyBashCommand denies destructive commands', () => {
  const result = classifyBashCommand('rm -rf /');
  assert.equal(result.decision, 'deny');
  assert.equal(result.severity, 'high');
});

test('classifyBashCommand asks for risky but not always destructive commands', () => {
  const result = classifyBashCommand('git push origin main');
  assert.equal(result.decision, 'ask');
  assert.equal(result.severity, 'medium');
});

test('classifyBashCommand allows ordinary commands', () => {
  const result = classifyBashCommand('echo hello');
  assert.equal(result.decision, 'allow');
});
