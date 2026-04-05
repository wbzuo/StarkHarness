// Zero-dependency HTTP + WebSocket bridge for StarkHarness runtime.
// Exposes the runtime as a JSON API + real-time streaming via WebSocket.
//
// Usage:
//   const server = await createHttpBridge(runtime, { port: 3000 });
//   // server.close() to shut down

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  const payload = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(payload);
}

function cors(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

// Minimal WebSocket upgrade (RFC 6455) — no dependencies
function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const hash = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC85B11C')
    .digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${hash}`,
    '', '',
  ].join('\r\n'));
  return socket;
}

function decodeWsFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let payloadLen = buffer[1] & 0x7f;
  let offset = 2;
  if (payloadLen === 126) {
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  let mask = null;
  if (masked) {
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + payloadLen) return null;
  const data = buffer.slice(offset, offset + payloadLen);
  if (mask) {
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  }
  return { opcode, data, totalLength: offset + payloadLen };
}

function encodeWsFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const header = [0x81]; // text frame, FIN
  if (payload.length < 126) {
    header.push(payload.length);
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff);
  } else {
    header.push(127);
    const len = Buffer.alloc(8);
    len.writeBigUInt64BE(BigInt(payload.length));
    header.push(...len);
  }
  return Buffer.concat([Buffer.from(header), payload]);
}

function writeSse(res, payload, eventName = null) {
  if (res.writableEnded) return;
  if (eventName) res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function sendWebSocket(socket, event) {
  socket.write(encodeWsFrame(JSON.stringify(event)));
}

function sendWebSocketError(socket, error) {
  sendWebSocket(socket, { type: 'error', error: error instanceof Error ? error.message : String(error) });
}

function extractBearerToken(req, url) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const explicitHeader = req.headers['x-stark-token'];
  if (typeof explicitHeader === 'string') return explicitHeader;
  return url.searchParams.get('token');
}

function isAuthorized(req, url, authToken, tokenProfiles = {}) {
  const token = extractBearerToken(req, url);
  if (!authToken && Object.keys(tokenProfiles).length === 0) return true;
  if (url.pathname === '/health') return true;
  if (authToken && token === authToken) return true;
  return Object.prototype.hasOwnProperty.call(tokenProfiles, token);
}

export async function createHttpBridge(runtime, { port = 3000, host = '127.0.0.1', authToken = null, tokenProfiles = {} } = {}) {
  const wsClients = new Map();
  const { getSandboxProfile } = await import('../permissions/profiles.js');
  const { PermissionEngine } = await import('../permissions/engine.js');

  function getContextualPermissions(req, url) {
    const token = extractBearerToken(req, url);
    const profileName = tokenProfiles[token];
    if (profileName) {
      return new PermissionEngine(getSandboxProfile(profileName));
    }
    return runtime.permissions;
  }

  function broadcast(event, { topic = 'runs', traceId = null, agentId = null } = {}) {
    const frame = encodeWsFrame(JSON.stringify(event));
    for (const [id, client] of wsClients) {
      if (!client.topics.has('*') && !client.topics.has(topic)) continue;

      // Fine-grained filtering
      if (client.filters?.traceId && traceId && client.filters.traceId !== traceId) continue;
      if (client.filters?.agentId && agentId && client.filters.agentId !== agentId) continue;

      try { client.socket.write(frame); }
      catch { wsClients.delete(id); }
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') return cors(res);
    if (!isAuthorized(req, url, authToken, tokenProfiles)) return json(res, { error: 'unauthorized' }, 401);

    const permissions = getContextualPermissions(req, url);

    try {
      // Health check
      if (path === '/health') {
        return json(res, { ok: true, sessionId: runtime.session.id, uptime: process.uptime() });
      }

      // Run a prompt — POST /run { prompt: "..." }
      if (path === '/run' && req.method === 'POST') {
        const body = await parseBody(req);
        const prompt = body.prompt ?? body.message ?? '';
        if (!prompt) return json(res, { error: 'prompt is required' }, 400);
        const requestId = randomBytes(8).toString('hex');

        const result = await runtime.run(prompt, {
          permissions,
          onTextChunk(chunk, ctx) {
            broadcast({ type: 'chunk', chunk, requestId, traceId: ctx?.traceId, timestamp: Date.now() }, { topic: 'runs', traceId: ctx?.traceId });
          },
        });
        broadcast({
          type: 'complete',
          requestId,
          traceId: result.traceId,
          turns: result.turns?.length ?? 0,
        }, { topic: 'runs', traceId: result.traceId });
        return json(res, {
          finalText: result.finalText,
          turns: result.turns?.length ?? 0,
          stopReason: result.stopReason,
          usage: result.usage,
          traceId: result.traceId,
          activeSkill: result.activeSkill,
        });
      }

      // Stream run — POST /stream { prompt: "..." }
      // Server-Sent Events
      if (path === '/stream' && req.method === 'POST') {
        const body = await parseBody(req);
        const prompt = body.prompt ?? body.message ?? '';
        if (!prompt) return json(res, { error: 'prompt is required' }, 400);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        try {
          const result = await runtime.run(prompt, {
            permissions,
            onTextChunk(chunk) {
              writeSse(res, { type: 'chunk', chunk });
            },
          });

          writeSse(res, {
            type: 'complete',
            finalText: result.finalText,
            turns: result.turns?.length ?? 0,
            stopReason: result.stopReason,
            usage: result.usage,
            traceId: result.traceId,
          });
        } catch (error) {
          writeSse(res, {
            type: 'error',
            error: error instanceof Error ? error.message : String(error),
          }, 'error');
        } finally {
          res.end();
        }
        return;
      }

      // Command dispatch — POST /command/:name { ...args }
      if (path.startsWith('/command/') && req.method === 'POST') {
        const name = path.slice('/command/'.length);
        const args = await parseBody(req);
        const result = await runtime.dispatchCommand(name, { ...args, permissions });
        return json(res, result);
      }

      // GET endpoints
      if (req.method === 'GET') {
        if (path === '/session') return json(res, runtime.session);
        if (path === '/providers') return json(res, runtime.providers.list());
        if (path === '/tools') return json(res, runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })));
        if (path === '/agents') return json(res, runtime.agents.list());
        if (path === '/tasks') return json(res, runtime.tasks.list());
        if (path === '/workers') return json(res, runtime.listWorkers());
        if (path === '/traces') {
          const traces = await runtime.telemetry.queryTraces({
            traceId: url.searchParams.get('traceId'),
            agentId: url.searchParams.get('agentId'),
            since: url.searchParams.get('since'),
          });
          return json(res, traces);
        }
      }

      json(res, { error: 'Not found' }, 404);
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) {
          writeSse(res, { type: 'error', error: error instanceof Error ? error.message : String(error) }, 'error');
          res.end();
        }
        return;
      }
      json(res, { error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  // WebSocket upgrade
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host ?? `${host}:${port}`}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    if (!isAuthorized(req, url, authToken, tokenProfiles)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const ws = acceptWebSocket(req, socket, head);
    if (!ws) return;
    const clientId = randomBytes(8).toString('hex');
    const permissions = getContextualPermissions(req, url);
    wsClients.set(clientId, { socket: ws, topics: new Set(), filters: {}, permissions });

    let buffer = Buffer.alloc(0);
    ws.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (true) {
        const frame = decodeWsFrame(buffer);
        if (!frame) break;
        buffer = buffer.slice(frame.totalLength);
        if (frame.opcode === 8) { // close
          wsClients.delete(clientId);
          ws.end();
          return;
        }
        if (frame.opcode === 1) { // text
          try {
            const msg = JSON.parse(frame.data.toString('utf8'));
            const client = wsClients.get(clientId);
            if (!client) return;

            if (msg.type === 'subscribe') {
              const topics = Array.isArray(msg.topics) ? msg.topics.filter((topic) => typeof topic === 'string' && topic) : [];
              const filters = msg.filters && typeof msg.filters === 'object' ? msg.filters : {};
              client.topics = new Set(topics);
              client.filters = filters;
              sendWebSocket(ws, { type: 'subscribed', clientId, topics, filters });
              continue;
            }
            if (msg.type === 'unsubscribe') {
              const topics = Array.isArray(msg.topics) ? msg.topics.filter((topic) => typeof topic === 'string' && topic) : [];
              for (const topic of topics) client.topics.delete(topic);
              sendWebSocket(ws, { type: 'subscribed', clientId, topics: [...client.topics], filters: client.filters });
              continue;
            }
            if (msg.type === 'run' && msg.prompt) {
              const requestId = msg.requestId ?? randomBytes(8).toString('hex');
              const result = await runtime.run(msg.prompt, {
                permissions: client.permissions,
                onTextChunk(chunk, ctx) {
                  try { sendWebSocket(ws, { type: 'chunk', chunk, requestId, traceId: ctx?.traceId }); } catch {}
                },
              });
              sendWebSocket(ws, {
                type: 'complete',
                requestId,
                finalText: result.finalText,
                turns: result.turns?.length ?? 0,
                usage: result.usage,
                traceId: result.traceId,
              });
            } else if (msg.type === 'command') {
              const result = await runtime.dispatchCommand(msg.name, { ...(msg.args ?? {}), permissions: client.permissions });
              sendWebSocket(ws, { type: 'command-result', name: msg.name, result });
            }
          } catch (err) {
            sendWebSocketError(ws, err);
          }
        }
      }
    });
    ws.on('close', () => wsClients.delete(clientId));
    ws.on('error', () => wsClients.delete(clientId));

    sendWebSocket(ws, { type: 'connected', clientId, sessionId: runtime.session.id, topics: [] });
  });

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      const addr = server.address();
      resolve({
        server,
        port: addr.port,
        host,
        url: `http://${host}:${addr.port}`,
        wsUrl: `ws://${host}:${addr.port}/ws`,
        clientCount: () => wsClients.size,
        close: () => new Promise((r) => {
          for (const client of wsClients.values()) try { client.socket.end(); } catch {}
          wsClients.clear();
          server.close(r);
        }),
      });
    });
  });
}
