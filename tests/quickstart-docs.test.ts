import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { createRuntime } from '../src/kernel/runtime.js';
import { createHttpBridge } from '../src/bridge/http.js';

const ENGLISH_QUICKSTART = new URL('../docs/QUICKSTART.md', import.meta.url);
const CHINESE_QUICKSTART = new URL('../docs/QUICKSTART.zh-CN.md', import.meta.url);
const COMMAND_PATTERN = /node --import tsx src\/main\.ts ([a-z0-9:-]+)/g;
const ENDPOINT_PATTERN = /^(GET|POST|WS)\s+(\S+)/gm;
const CLI_ONLY_COMMANDS = new Set(['pipe', 'serve', 'dev', 'chat']);

function extractQuickstartSurface(markdown) {
  const commands = [...markdown.matchAll(COMMAND_PATTERN)].map((match) => match[1]);
  const endpoints = [...markdown.matchAll(ENDPOINT_PATTERN)].map((match) => ({
    method: match[1],
    path: match[2],
  }));
  return {
    commands: [...new Set(commands)],
    endpoints,
  };
}

function normalizeEndpointPath(pathname) {
  if (pathname === '/docs/page?name=...') return '/docs/page?name=quickstart';
  return pathname;
}

async function makeBridge() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-quickstart-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'quickstart-docs' },
  });
  const bridge = await createHttpBridge(runtime, { port: 0, host: '127.0.0.1' });
  return { runtime, bridge };
}

async function closeBridge({ runtime, bridge }) {
  await bridge.close();
  await runtime.shutdown();
}

function decodeServerFrame(buffer) {
  if (buffer.length < 2) return null;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  if (buffer.length < offset + length) return null;
  return {
    text: buffer.slice(offset, offset + length).toString('utf8'),
    totalLength: offset + length,
  };
}

async function connectWs(wsUrl) {
  const url = new URL(wsUrl);
  const key = randomBytes(16).toString('base64');
  const socket = net.createConnection({ host: url.hostname, port: Number(url.port) });
  let buffer = Buffer.alloc(0);

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}:${url.port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('ws-timeout'));
    }, 1000);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd >= 0) {
        buffer = buffer.slice(headerEnd + 4);
      }
      const frame = decodeServerFrame(buffer);
      if (!frame) return;
      clearTimeout(timer);
      const payload = JSON.parse(frame.text);
      socket.end(() => resolve(payload));
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('Quickstart command examples resolve to live CLI or runtime commands', async () => {
  const [english, chinese] = await Promise.all([
    readFile(ENGLISH_QUICKSTART, 'utf8'),
    readFile(CHINESE_QUICKSTART, 'utf8'),
  ]);
  const englishSurface = extractQuickstartSurface(english);
  const chineseSurface = extractQuickstartSurface(chinese);
  const root = await mkdtemp(path.join(os.tmpdir(), 'starkharness-quickstart-runtime-'));
  const runtime = await createRuntime({
    stateDir: path.join(root, '.starkharness'),
    session: { cwd: root, goal: 'quickstart-commands' },
  });

  try {
    assert.deepEqual(chineseSurface.commands, englishSurface.commands);
    const available = new Set(runtime.commands.list().map((command) => command.name));
    const missing = englishSurface.commands.filter((command) => !available.has(command) && !CLI_ONLY_COMMANDS.has(command));
    assert.deepEqual(missing, []);
  } finally {
    await runtime.shutdown();
  }
});

test('Quickstart serve endpoints respond on the live bridge', async () => {
  const [english, chinese] = await Promise.all([
    readFile(ENGLISH_QUICKSTART, 'utf8'),
    readFile(CHINESE_QUICKSTART, 'utf8'),
  ]);
  const englishSurface = extractQuickstartSurface(english);
  const chineseSurface = extractQuickstartSurface(chinese);
  const ctx = await makeBridge();

  try {
    assert.deepEqual(chineseSurface.endpoints, englishSurface.endpoints);
    for (const endpoint of englishSurface.endpoints) {
      const requestPath = normalizeEndpointPath(endpoint.path);
      if (endpoint.method === 'GET') {
        const response = await fetch(`${ctx.bridge.url}${requestPath}`);
        assert.equal(response.status, 200, `${endpoint.method} ${endpoint.path} should exist`);
        continue;
      }
      if (endpoint.method === 'POST') {
        const body = requestPath === '/command/doctor' ? {} : { prompt: 'quickstart docs verification' };
        const response = await fetch(`${ctx.bridge.url}${requestPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 200, `${endpoint.method} ${endpoint.path} should accept POST`);
        continue;
      }
      if (endpoint.method === 'WS') {
        const payload = await connectWs(ctx.bridge.wsUrl);
        assert.equal(payload.type, 'connected');
      }
    }

    const chineseQuickstart = await fetch(`${ctx.bridge.url}/docs/page?name=quickstart-zh`);
    assert.equal(chineseQuickstart.status, 200, 'The Chinese quickstart page should be served by the docs index');
  } finally {
    await closeBridge(ctx);
  }
});

test('English and Chinese Quickstart docs stay aligned on commands and serve endpoints', async () => {
  const [english, chinese] = await Promise.all([
    readFile(ENGLISH_QUICKSTART, 'utf8'),
    readFile(CHINESE_QUICKSTART, 'utf8'),
  ]);

  const englishSurface = extractQuickstartSurface(english);
  const chineseSurface = extractQuickstartSurface(chinese);

  assert.deepEqual(chineseSurface.commands, englishSurface.commands);
  assert.deepEqual(chineseSurface.endpoints, englishSurface.endpoints);
});
