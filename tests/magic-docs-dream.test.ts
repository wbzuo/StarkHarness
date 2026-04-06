import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { loadRuntimeEnv } from '../src/config/env.js';

async function withStaticServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('magic-docs searches and summarizes documentation results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-magic-docs-'));
  const server = await withStaticServer((req, res) => {
    if (req.url?.startsWith('/search')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <li class="b_algo">
          <h2><a href="${server.url}/docs-a">Docs A</a></h2>
          <p>Alpha docs</p>
        </li>
      `);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Official documentation content');
  });

  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: { ...process.env, STARKHARNESS_WEB_SEARCH_BASE_URL: `${server.url}/search` },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'magic-docs' },
      envConfig,
    });
    runtime.providers.completeWithStrategy = async () => ({
      text: 'Concise docs summary',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: {},
    });

    const result = await runtime.dispatchCommand('magic-docs', { topic: 'starkharness' });
    assert.equal(result.summary, 'Concise docs summary');
    assert.equal(result.sources.length, 1);
    assert.equal(result.sources[0].title, 'Docs A');
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});

test('dream command consolidates transcript into memory output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-dream-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'dream' },
  });

  runtime.providers.completeWithStrategy = async ({ request }) => {
    if (Array.isArray(request.messages) && request.messages.length === 1) {
      return { text: '["Dreamed memory"]', toolCalls: [], stopReason: 'end_turn', usage: {} };
    }
    return { text: 'assistant reply', toolCalls: [], stopReason: 'end_turn', usage: {} };
  };

  await runtime.run('remember this conversation');
  const result = await runtime.dispatchCommand('dream');
  assert.equal(result.entries[0], 'Dreamed memory');
  assert.ok(result.path);
  await runtime.shutdown();
});
