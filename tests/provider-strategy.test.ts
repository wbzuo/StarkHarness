import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelStrategy, selectProvider, withRetry, isRetryableError } from '../src/providers/strategy.js';

test('ModelStrategy selects provider by capability', () => {
  const strategy = new ModelStrategy({
    providers: [
      { id: 'anthropic', capabilities: ['chat', 'tools'], priority: 1 },
      { id: 'openai', capabilities: ['chat'], priority: 2 },
    ],
  });

  assert.equal(strategy.select({ require: 'tools' }), 'anthropic');
  assert.equal(strategy.select({ require: 'chat' }), 'anthropic'); // higher priority
});

test('ModelStrategy falls back when primary unavailable', () => {
  const strategy = new ModelStrategy({
    providers: [
      { id: 'anthropic', capabilities: ['chat', 'tools'], priority: 1 },
      { id: 'openai', capabilities: ['chat', 'tools'], priority: 2 },
    ],
    unavailable: new Set(['anthropic']),
  });

  assert.equal(strategy.select({ require: 'tools' }), 'openai');
});

test('ModelStrategy can prefer provider aliases and model families', () => {
  const strategy = new ModelStrategy({
    providers: [
      { id: 'anthropic', modelFamily: 'claude', aliases: ['sonnet'], capabilities: ['chat'], priority: 1 },
      { id: 'openai', modelFamily: 'gpt', aliases: ['codex'], capabilities: ['chat'], priority: 2 },
    ],
  });

  assert.equal(strategy.select({ require: 'chat', prefer: 'sonnet' }), 'anthropic');
  assert.equal(strategy.select({ require: 'chat', prefer: 'gpt' }), 'openai');
});

test('selectProvider returns first capable provider id', () => {
  const providers = [
    { id: 'a', capabilities: ['chat'] },
    { id: 'b', capabilities: ['chat', 'tools'] },
  ];
  assert.equal(selectProvider(providers, 'tools'), 'b');
  assert.equal(selectProvider(providers, 'chat'), 'a');
  assert.equal(selectProvider(providers, 'vision'), null);
});

test('withRetry retries on failure', async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts < 3) throw new Error('transient');
    return 'ok';
  };

  const result = await withRetry(fn, { maxRetries: 3, baseDelay: 1 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('withRetry throws after max retries', async () => {
  const fn = async () => { throw new Error('always fail'); };
  await assert.rejects(
    () => withRetry(fn, { maxRetries: 2, baseDelay: 1 }),
    /always fail/,
  );
});

test('withRetry respects timeout', async () => {
  const fn = async () => new Promise((resolve) => setTimeout(resolve, 5000));
  await assert.rejects(
    () => withRetry(fn, { maxRetries: 1, baseDelay: 1, timeout: 50 }),
    /timed out/i,
  );
});

test('withRetry does not retry non-retryable client errors', async () => {
  let attempts = 0;
  const fn = async () => {
    attempts += 1;
    const error = new Error('bad request');
    error.status = 400;
    throw error;
  };

  await assert.rejects(() => withRetry(fn, { maxRetries: 3, baseDelay: 1 }), /bad request/);
  assert.equal(attempts, 1);
});

test('isRetryableError distinguishes retryable transport errors from client errors', () => {
  const timeout = new Error('Request timed out');
  timeout.name = 'TimeoutError';
  const client = new Error('unauthorized');
  client.status = 401;
  assert.equal(isRetryableError(timeout), true);
  assert.equal(isRetryableError(client), false);
});
