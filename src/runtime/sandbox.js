// ExecutionProvider abstraction — unified interface for running agent code
// in different isolation modes: local (in-process), process (child process),
// docker (container), or custom providers.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const childRuntimePath = fileURLToPath(new URL('../agents/child-runtime.js', import.meta.url));

export class ExecutionProvider {
  constructor({ mode = 'local', options = {} } = {}) {
    this.mode = mode;
    this.options = options;
  }

  async execute(payload, callbacks = {}) {
    switch (this.mode) {
      case 'local': return this.#executeLocal(payload, callbacks);
      case 'process': return this.#executeProcess(payload, callbacks);
      case 'docker': return this.#executeDocker(payload, callbacks);
      default: throw new Error(`Unknown execution mode: ${this.mode}`);
    }
  }

  capabilities() {
    switch (this.mode) {
      case 'local': return { isolated: false, filesystem: 'shared', network: 'shared' };
      case 'process': return { isolated: true, filesystem: 'shared', network: 'shared' };
      case 'docker': return { isolated: true, filesystem: 'sandboxed', network: this.options.network ?? 'none' };
      default: return { isolated: false };
    }
  }

  // Mode: local — run inline with shared runtime (fastest, no isolation)
  async #executeLocal(payload, callbacks) {
    // Caller (AgentExecutor) handles inline execution directly.
    // This is a passthrough that signals "no special execution needed".
    return { mode: 'local', delegated: false };
  }

  // Mode: process — run in a child Node.js process via IPC
  async #executeProcess(payload, callbacks) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [childRuntimePath], {
        cwd: payload.cwd,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        env: { ...process.env, ...(this.options.env ?? {}) },
      });

      let stderrBuffer = '';
      let settled = false;
      const timeoutMs = this.options.timeoutMs ?? 300000;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`Execution timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const settle = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };

      child.on('message', async (event) => {
        try {
          if (event.type === 'chunk') {
            await callbacks.onTextChunk?.(event.chunk);
          } else if (event.type === 'result') {
            settle(resolve, { mode: 'process', ...event.result });
          } else if (event.type === 'error') {
            settle(reject, new Error(event.error?.message ?? 'child-execution-failed'));
          }
        } catch (err) {
          settle(reject, err);
        }
      });

      child.stderr.on('data', (chunk) => { stderrBuffer += chunk.toString(); });
      child.on('error', (err) => settle(reject, err));
      child.on('close', (code) => {
        if (!settled) {
          settle(reject, new Error(stderrBuffer || `child-exit:${code}`));
        }
      });

      child.send(payload);
    });
  }

  // Mode: docker — run in a Docker container
  async #executeDocker(payload, callbacks) {
    const image = this.options.image ?? 'node:20-slim';
    const networkMode = this.options.network ?? 'none';
    const memoryLimit = this.options.memoryLimit ?? '512m';
    const cpus = this.options.cpus ?? '1';

    // Serialize payload to JSON and pipe via stdin
    const payloadJson = JSON.stringify(payload);

    return new Promise((resolve, reject) => {
      const args = [
        'run', '--rm',
        '--network', networkMode,
        '--memory', memoryLimit,
        '--cpus', cpus,
        '--read-only',
        '-i',
        image,
        'node', '-e', `
          let data = '';
          process.stdin.on('data', chunk => data += chunk);
          process.stdin.on('end', async () => {
            const payload = JSON.parse(data);
            // Minimal in-container execution
            const result = {
              finalText: 'Docker execution placeholder — implement container runtime bridge',
              toolCalls: [],
              turns: [],
              stopReason: 'end_turn',
              usage: { input_tokens: 0, output_tokens: 0 },
            };
            process.stdout.write(JSON.stringify({ type: 'result', result }));
          });
        `,
      ];

      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

      child.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Docker execution failed (exit ${code}): ${stderr}`));
        }
        try {
          const event = JSON.parse(stdout);
          resolve({ mode: 'docker', image, ...event.result });
        } catch {
          reject(new Error(`Invalid Docker output: ${stdout.slice(0, 200)}`));
        }
      });

      child.on('error', (err) => {
        if (err.code === 'ENOENT') {
          reject(new Error('Docker is not installed or not in PATH. Install Docker to use container isolation.'));
        } else {
          reject(err);
        }
      });

      child.stdin.write(payloadJson);
      child.stdin.end();
    });
  }
}

// Profiles for common isolation needs
export const SANDBOX_PROFILES = {
  // No isolation — run inline
  local: { mode: 'local' },

  // Process isolation — separate Node.js process, shared filesystem
  process: { mode: 'process', options: { timeoutMs: 300000 } },

  // Container isolation — Docker, no network, read-only filesystem
  docker: { mode: 'docker', options: { network: 'none', memoryLimit: '512m', cpus: '1' } },

  // Container with network — for tools that need HTTP access
  'docker-network': { mode: 'docker', options: { network: 'bridge', memoryLimit: '1g', cpus: '2' } },
};

export function createExecutionProvider(profile = 'local') {
  const config = typeof profile === 'string' ? SANDBOX_PROFILES[profile] ?? SANDBOX_PROFILES.local : profile;
  return new ExecutionProvider(config);
}
