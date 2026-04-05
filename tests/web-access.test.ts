import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/kernel/runtime.js';
import { runHarnessTurn } from '../src/kernel/loop.js';

async function createFakeWebAccess(root, { onMatchSite } = {}) {
  const skillDir = path.join(root, 'skills', 'web-access');
  await mkdir(path.join(skillDir, 'scripts'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '# web-access\n', 'utf8');
  await writeFile(path.join(skillDir, 'scripts', 'check-deps.mjs'), 'process.exit(0);\n', 'utf8');
  await writeFile(
    path.join(skillDir, 'scripts', 'match-site.mjs'),
    `process.stdout.write(${JSON.stringify(onMatchSite ?? 'matched site context')});\n`,
    'utf8',
  );
  return skillDir;
}

async function withProxyServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    port,
    async close() {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve(undefined)));
    },
  };
}

test('browser_targets lists proxy targets through built-in web-access integration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-web-access-'));
  const skillDir = await createFakeWebAccess(root);
  const proxy = await withProxyServer((req, res) => {
    if (req.url === '/targets') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([{ id: 'page-1', title: 'Example' }]));
      return;
    }
    res.writeHead(404).end();
  });
  const previousPort = process.env.CDP_PROXY_PORT;
  process.env.CDP_PROXY_PORT = String(proxy.port);

  try {
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'web-access-targets' },
      permissions: { network: 'allow' },
    });
    const result = await runHarnessTurn(runtime, { tool: 'browser_targets', input: {} });
    assert.equal(result.ok, true);
    assert.equal(result.skillDir, skillDir);
    assert.deepEqual(result.targets, [{ id: 'page-1', title: 'Example' }]);
    await runtime.shutdown();
  } finally {
    if (previousPort == null) delete process.env.CDP_PROXY_PORT;
    else process.env.CDP_PROXY_PORT = previousPort;
    await proxy.close();
  }
});

test('browser_eval posts expressions to the proxy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-browser-eval-'));
  await createFakeWebAccess(root);
  const proxy = await withProxyServer(async (req, res) => {
    if (req.url === '/targets') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify([]));
      return;
    }
    if (req.url === '/eval?target=tab-1' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk.toString();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ echoed: body }));
      return;
    }
    res.writeHead(404).end();
  });
  const previousPort = process.env.CDP_PROXY_PORT;
  process.env.CDP_PROXY_PORT = String(proxy.port);

  try {
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'browser-eval' },
      permissions: { network: 'allow' },
    });
    const result = await runHarnessTurn(runtime, {
      tool: 'browser_eval',
      input: { target: 'tab-1', expression: 'document.title' },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.result, { echoed: 'document.title' });
    await runtime.shutdown();
  } finally {
    if (previousPort == null) delete process.env.CDP_PROXY_PORT;
    else process.env.CDP_PROXY_PORT = previousPort;
    await proxy.close();
  }
});

test('browser_open and browser_close proxy browser tab lifecycle', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-browser-open-'));
  await createFakeWebAccess(root);
  const seen = [];
  const proxy = await withProxyServer((req, res) => {
    seen.push(req.url);
    if (req.url?.startsWith('/new?url=')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ targetId: 'tab-42' }));
      return;
    }
    if (req.url === '/close?target=tab-42') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    res.writeHead(404).end();
  });
  const previousPort = process.env.CDP_PROXY_PORT;
  process.env.CDP_PROXY_PORT = String(proxy.port);

  try {
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'browser-open-close' },
      permissions: { network: 'allow' },
    });
    const opened = await runHarnessTurn(runtime, {
      tool: 'browser_open',
      input: { url: 'https://example.com' },
    });
    assert.equal(opened.ok, true);
    assert.equal(opened.target.targetId, 'tab-42');

    const closed = await runHarnessTurn(runtime, {
      tool: 'browser_close',
      input: { target: 'tab-42' },
    });
    assert.equal(closed.ok, true);
    assert.equal(seen.some((url) => url?.includes('/new?url=')), true);
    assert.equal(seen.includes('/close?target=tab-42'), true);
    await runtime.shutdown();
  } finally {
    if (previousPort == null) delete process.env.CDP_PROXY_PORT;
    else process.env.CDP_PROXY_PORT = previousPort;
    await proxy.close();
  }
});

test('browser_click, browser_scroll, and browser_screenshot send the expected proxy calls', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-browser-actions-'));
  await createFakeWebAccess(root);
  const calls = [];
  const proxy = await withProxyServer(async (req, res) => {
    calls.push(req.url);
    if (req.url === '/click?target=tab-1' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ clicked: true }));
      return;
    }
    if (req.url === '/scroll?target=tab-1&direction=bottom') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ value: 'ok' }));
      return;
    }
    if (req.url?.startsWith('/screenshot?target=tab-1&file=')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true }));
      return;
    }
    res.writeHead(404).end();
  });
  const previousPort = process.env.CDP_PROXY_PORT;
  process.env.CDP_PROXY_PORT = String(proxy.port);

  try {
    const runtime = await createRuntime({
      stateDir: path.join(root, '.starkharness'),
      session: { cwd: root, goal: 'browser-actions' },
      permissions: { network: 'allow' },
    });
    const click = await runHarnessTurn(runtime, {
      tool: 'browser_click',
      input: { target: 'tab-1', selector: '#submit' },
    });
    const scroll = await runHarnessTurn(runtime, {
      tool: 'browser_scroll',
      input: { target: 'tab-1', direction: 'bottom' },
    });
    const shot = await runHarnessTurn(runtime, {
      tool: 'browser_screenshot',
      input: { target: 'tab-1', file: './shots/page.png' },
    });

    assert.equal(click.ok, true);
    assert.equal(scroll.ok, true);
    assert.equal(shot.ok, true);
    assert.equal(calls.includes('/click?target=tab-1'), true);
    assert.equal(calls.includes('/scroll?target=tab-1&direction=bottom'), true);
    assert.equal(calls.some((url) => url?.startsWith('/screenshot?target=tab-1&file=')), true);
    await runtime.shutdown();
  } finally {
    if (previousPort == null) delete process.env.CDP_PROXY_PORT;
    else process.env.CDP_PROXY_PORT = previousPort;
    await proxy.close();
  }
});

test('web_site_context loads site-pattern output from the bundled web-access skill', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-site-context-'));
  const skillDir = await createFakeWebAccess(root, { onMatchSite: '--- 站点经验: example.com ---\nKnown pattern' });
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'site-context' },
  });

  const result = await runHarnessTurn(runtime, {
    tool: 'web_site_context',
    input: { query: 'example.com upload flow' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.skillDir, skillDir);
  assert.match(result.context, /example\.com/);
  await runtime.shutdown();
});
