import test from 'node:test';
import assert from 'node:assert/strict';
import { matchAndBind } from '../src/skills/binder.js';

test('matchAndBind returns null when no skill matches', () => {
  const skills = new Map();
  const result = matchAndBind('hello world', skills);
  assert.equal(result, null);
});

test('matchAndBind returns skill body when query matches', () => {
  const skills = new Map([
    ['review', { name: 'review', description: 'systematic code review with structured output', body: 'Review instructions here' }],
  ]);
  const result = matchAndBind('do a code review of src/', skills);
  assert.ok(result);
  assert.equal(result.name, 'review');
  assert.equal(result.body, 'Review instructions here');
});

test('matchAndBind enriches system prompt with skill body', () => {
  const skills = new Map([
    ['refactor', { name: 'refactor', description: 'refactor code following DRY YAGNI', body: 'Refactor guidelines' }],
  ]);
  const result = matchAndBind('refactor this code following YAGNI', skills);
  assert.ok(result);
  assert.ok(result.promptAddendum.includes('Refactor guidelines'));
});
