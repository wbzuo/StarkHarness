import { spawn } from 'node:child_process';

// Minimal JSON-RPC over stdio MCP client
export class McpStdioClient {
  #process = null;
  #requestId = 0;
  #pending = new Map();
  #buffer = '';
  #serverName;

  constructor(serverName, { command, args = [], env = {} }) {
    this.#serverName = serverName;
    this.command = command;
    this.args = args;
    this.env = env;
  }

  async connect() {
    this.#process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.#process.stdout.on('data', (chunk) => {
      this.#buffer += chunk.toString();
      this.#processBuffer();
    });

    this.#process.on('error', (err) => {
      for (const [, { reject }] of this.#pending) {
        reject(err);
      }
      this.#pending.clear();
    });

    // Initialize with JSON-RPC
    const initResult = await this.#send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'starkharness', version: '0.1.0' },
    });

    await this.#notify('notifications/initialized', {});
    return initResult;
  }

  async listTools() {
    const result = await this.#send('tools/list', {});
    return result.tools ?? [];
  }

  async callTool(name, args = {}) {
    return this.#send('tools/call', { name, arguments: args });
  }

  async disconnect() {
    if (this.#process) {
      this.#process.stdin.end();
      this.#process.kill();
      this.#process = null;
    }
  }

  #send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.#requestId;
      this.#pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.#process.stdin.write(msg);
    });
  }

  #notify(method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.#process.stdin.write(msg);
    return Promise.resolve();
  }

  #processBuffer() {
    const lines = this.#buffer.split('\n');
    this.#buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && this.#pending.has(msg.id)) {
          const { resolve, reject } = this.#pending.get(msg.id);
          this.#pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message ?? 'MCP error'));
          else resolve(msg.result);
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  get serverName() { return this.#serverName; }
}
