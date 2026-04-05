import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseBingSearchResults, webSearch } from '../src/search/web.js';
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';
import { loadRuntimeEnv } from '../src/config/env.js';

function sampleBingHtml() {
  return `
    <html><body>
      <li class="b_algo">
        <h2><a href="https://example.com/a">Example A</a></h2>
        <p>Alpha snippet</p>
      </li>
      <li class="b_algo">
        <h2><a href="https://example.com/b">Example B</a></h2>
        <p>Beta snippet</p>
      </li>
    </body></html>
  `;
}

async function withHtmlServer(html) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}/search`,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('parseBingSearchResults extracts titles, urls, and snippets', () => {
  const results = parseBingSearchResults(sampleBingHtml());
  assert.equal(results.length, 2);
  assert.equal(results[0].title, 'Example A');
  assert.equal(results[0].url, 'https://example.com/a');
  assert.equal(results[0].snippet, 'Alpha snippet');
});

test('webSearch fetches and parses configured Bing-style HTML', async () => {
  const server = await withHtmlServer(sampleBingHtml());
  try {
    const envConfig = {
      search: {
        provider: 'bing',
        baseUrl: server.url,
        count: 5,
        market: 'en-US',
      },
    };
    const result = await webSearch({ query: 'starkharness', envConfig });
    assert.equal(result.provider, 'bing');
    assert.equal(result.results.length, 2);
    assert.equal(result.results[1].title, 'Example B');
  } finally {
    await server.close();
  }
});

test('web_search tool uses runtime search env configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-web-search-'));
  const server = await withHtmlServer(sampleBingHtml());
  try {
    const envConfig = await loadRuntimeEnv({
      cwd: root,
      env: {
        ...process.env,
        STARKHARNESS_WEB_SEARCH_BASE_URL: server.url,
        STARKHARNESS_WEB_SEARCH_COUNT: '3',
      },
    });
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'web-search' },
      permissions: { network: 'allow' },
      envConfig,
    });
    const result = await runHarnessTurn(runtime, {
      tool: 'web_search',
      input: { query: 'starkharness' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 2);
    await runtime.shutdown();
  } finally {
    await server.close();
  }
});
