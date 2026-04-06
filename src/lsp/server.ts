import { spawn } from 'node:child_process';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const CONTENT_LENGTH_HEADER = 'Content-Length: ';

function encodeMessage(body) {
  const json = JSON.stringify(body);
  const buffer = Buffer.from(json, 'utf8');
  return `${CONTENT_LENGTH_HEADER}${buffer.length}\r\n\r\n${json}`;
}

function parseHeaders(raw) {
  const headers = {};
  for (const line of raw.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
  }
  return headers;
}

export class LanguageServer extends EventEmitter {
  #process = null;
  #requestId = 0;
  #pending = new Map();
  #buffer = '';
  #state = 'stopped';
  #capabilities = null;
  #serverInfo = null;
  #rootUri = null;
  #startedAt = null;
  #stoppedAt = null;
  #lastError = null;

  constructor({ command = 'typescript-language-server', args = ['--stdio'], cwd = process.cwd(), env } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.cwd = cwd;
    this.env = env;
  }

  get state() { return this.#state; }
  get capabilities() { return this.#capabilities; }
  get serverInfo() { return this.#serverInfo; }

  status() {
    return {
      state: this.#state,
      command: this.command,
      cwd: this.cwd,
      rootUri: this.#rootUri,
      capabilities: this.#capabilities,
      serverInfo: this.#serverInfo,
      startedAt: this.#startedAt,
      stoppedAt: this.#stoppedAt,
      lastError: this.#lastError,
      pendingRequests: this.#pending.size,
    };
  }

  async start({ rootUri, rootPath } = {}) {
    if (this.#state === 'running') return this.status();
    this.#rootUri = rootUri ?? `file://${path.resolve(rootPath ?? this.cwd)}`;
    this.#state = 'starting';
    this.#startedAt = new Date().toISOString();

    this.#process = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.#process.stdout.on('data', (chunk) => this.#onData(chunk.toString('utf8')));
    this.#process.stderr.on('data', (chunk) => {
      this.emit('stderr', chunk.toString('utf8'));
    });
    this.#process.on('exit', (code, signal) => {
      this.#state = 'stopped';
      this.#stoppedAt = new Date().toISOString();
      for (const [, pending] of this.#pending) {
        pending.reject(new Error(`server exited: code=${code} signal=${signal}`));
      }
      this.#pending.clear();
      this.emit('exit', { code, signal });
    });
    this.#process.on('error', (err) => {
      this.#lastError = err.message;
      this.#state = 'error';
      this.emit('error', err);
    });

    // Initialize handshake
    const initResult = await this.#sendRequest('initialize', {
      processId: process.pid,
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didChange: true, didClose: true },
          publishDiagnostics: { relatedInformation: true },
          completion: { completionItem: { snippetSupport: false } },
          hover: {},
          definition: {},
          references: {},
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      rootUri: this.#rootUri,
      workspaceFolders: [{ uri: this.#rootUri, name: path.basename(this.cwd) }],
    });

    this.#capabilities = initResult.capabilities ?? {};
    this.#serverInfo = initResult.serverInfo ?? null;
    this.#sendNotification('initialized', {});
    this.#state = 'running';
    this.emit('ready', this.status());
    return this.status();
  }

  async stop() {
    if (!this.#process || this.#state === 'stopped') return this.status();
    try {
      await this.#sendRequest('shutdown', null);
      this.#sendNotification('exit', null);
    } catch {
      // Force kill if graceful shutdown fails
      this.#process.kill('SIGTERM');
    }
    this.#state = 'stopped';
    this.#stoppedAt = new Date().toISOString();
    return this.status();
  }

  async restart(options = {}) {
    await this.stop();
    return this.start(options);
  }

  async didOpen(uri, languageId, version, text) {
    this.#sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  async didChange(uri, version, changes) {
    this.#sendNotification('textDocument/didChange', {
      textDocument: { uri, version },
      contentChanges: changes,
    });
  }

  async didClose(uri) {
    this.#sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  async completion(uri, line, character) {
    return this.#sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async hover(uri, line, character) {
    return this.#sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async definition(uri, line, character) {
    return this.#sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character },
    });
  }

  async references(uri, line, character, { includeDeclaration = true } = {}) {
    return this.#sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line, character },
      context: { includeDeclaration },
    });
  }

  #sendNotification(method, params) {
    const message = { jsonrpc: '2.0', method, params };
    this.#write(encodeMessage(message));
  }

  #sendRequest(method, params) {
    const id = ++this.#requestId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, 30000);
      this.#pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
        method,
      });
      const message = { jsonrpc: '2.0', id, method, params };
      this.#write(encodeMessage(message));
    });
  }

  #write(data) {
    if (this.#process?.stdin?.writable) {
      this.#process.stdin.write(data);
    }
  }

  #onData(chunk) {
    this.#buffer += chunk;
    while (true) {
      const headerEnd = this.#buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const headerRaw = this.#buffer.slice(0, headerEnd);
      const headers = parseHeaders(headerRaw);
      const contentLength = Number(headers['content-length'] ?? 0);
      const bodyStart = headerEnd + 4;
      if (this.#buffer.length < bodyStart + contentLength) break;
      const bodyRaw = this.#buffer.slice(bodyStart, bodyStart + contentLength);
      this.#buffer = this.#buffer.slice(bodyStart + contentLength);

      let body;
      try { body = JSON.parse(bodyRaw); } catch { continue; }

      if (body.id != null && this.#pending.has(body.id)) {
        const pending = this.#pending.get(body.id);
        this.#pending.delete(body.id);
        if (body.error) {
          pending.reject(new Error(`${body.error.message} (${body.error.code})`));
        } else {
          pending.resolve(body.result);
        }
      } else if (body.method) {
        // Server notification/request
        this.emit('notification', { method: body.method, params: body.params });
        if (body.method === 'textDocument/publishDiagnostics') {
          this.emit('diagnostics', body.params);
        }
      }
    }
  }
}
