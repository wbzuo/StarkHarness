import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineTool } from '../types.js';

const execFileAsync = promisify(execFile);

function normalizePathForMatch(filePath) {
  return filePath.split(path.sep).join('/');
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern) {
  const normalized = normalizePathForMatch(pattern);
  let regex = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === '*' && next === '*') {
      regex += '.*';
      index += 1;
      continue;
    }
    if (char === '*') {
      regex += '[^/]*';
      continue;
    }
    if (char === '?') {
      regex += '[^/]';
      continue;
    }
    regex += escapeRegex(char);
  }
  regex += '$';
  return new RegExp(regex);
}

function matchesGlob(filePath, pattern, cwd) {
  if (!pattern) return true;
  const relative = normalizePathForMatch(path.relative(cwd, filePath));
  const base = normalizePathForMatch(path.basename(filePath));
  const regex = globToRegExp(pattern);
  return regex.test(relative) || (!pattern.includes('/') && regex.test(base));
}

function resolveWorkspacePath(runtime, targetPath = '.') {
  if (!targetPath) return runtime.context.cwd;
  return path.resolve(runtime.context.cwd, targetPath);
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.starkharness') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) results.push(...(await walkFiles(fullPath)));
    else results.push(fullPath);
  }
  return results;
}

export function createBuiltinTools() {
  return [
    defineTool({
      name: 'read_file',
      capability: 'read',
      description: 'Read a file from the workspace. Returns the file content as a string.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file to read' },
          offset: { type: 'number', description: 'Line number to start reading from (0-based)' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
        },
        required: ['path'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        let content = await readFile(filePath, 'utf8');
        if (input.offset !== undefined || input.limit !== undefined) {
          const lines = content.split('\n');
          const start = input.offset ?? 0;
          const end = input.limit ? start + input.limit : lines.length;
          content = lines.slice(start, end).join('\n');
        }
        return { ok: true, tool: 'read_file', path: filePath, content };
      },
    }),

    defineTool({
      name: 'write_file',
      capability: 'write',
      description: 'Create or overwrite a file. Creates parent directories as needed.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to write' },
          content: { type: 'string', description: 'File content to write' },
        },
        required: ['path', 'content'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, input.content ?? '', 'utf8');
        return { ok: true, tool: 'write_file', path: filePath, bytes: Buffer.byteLength(input.content ?? '', 'utf8') };
      },
    }),

    defineTool({
      name: 'edit_file',
      capability: 'write',
      description: 'Perform exact string replacement in a file. old_string must be unique in the file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the file' },
          old_string: { type: 'string', description: 'Exact text to find and replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        const current = await readFile(filePath, 'utf8');
        if (!current.includes(input.old_string ?? input.oldString ?? '')) {
          return { ok: false, tool: 'edit_file', reason: 'old-string-not-found', path: filePath };
        }
        const search = input.old_string ?? input.oldString;
        const replacement = input.new_string ?? input.newString ?? '';
        const next = input.replace_all ? current.replaceAll(search, replacement) : current.replace(search, replacement);
        await writeFile(filePath, next, 'utf8');
        return { ok: true, tool: 'edit_file', path: filePath };
      },
    }),

    defineTool({
      name: 'shell',
      capability: 'exec',
      description: 'Execute a shell command in the workspace directory. Returns stdout and stderr.',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 120000 },
        },
        required: ['command'],
      },
      async execute(input = {}, runtime) {
        const command = input.command ?? 'pwd';
        const timeout = input.timeout ?? 120000;
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: runtime.context.cwd,
          maxBuffer: 4 * 1024 * 1024,
          timeout,
        });
        return { ok: true, tool: 'shell', command, stdout, stderr };
      },
    }),

    defineTool({
      name: 'search',
      capability: 'read',
      description: 'Search workspace file contents for a text pattern. Returns matching file paths and lines.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text pattern to search for' },
          glob: { type: 'string', description: 'File pattern filter (e.g. "*.js")' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const query = String(input.query ?? '');
        const files = await walkFiles(runtime.context.cwd);
        const filtered = input.glob
          ? files.filter((filePath) => matchesGlob(filePath, String(input.glob), runtime.context.cwd))
          : files;
        const matches = [];
        for (const filePath of filtered) {
          const content = await readFile(filePath, 'utf8').catch(() => null);
          if (!content || !query) continue;
          content.split('\n').forEach((line, index) => {
            if (line.includes(query)) matches.push({ path: filePath, line: index + 1, text: line.trim() });
          });
        }
        return { ok: true, tool: 'search', query, matches };
      },
    }),

    defineTool({
      name: 'glob',
      capability: 'read',
      description: 'Find files matching a pattern in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'File pattern to match (e.g. "**/*.js")' },
        },
        required: ['pattern'],
      },
      async execute(input = {}, runtime) {
        const pattern = String(input.pattern ?? '');
        const files = await walkFiles(runtime.context.cwd);
        const matches = files.filter((filePath) => matchesGlob(filePath, pattern, runtime.context.cwd));
        return { ok: true, tool: 'glob', pattern, matches };
      },
    }),

    defineTool({
      name: 'fetch_url',
      capability: 'network',
      description: 'Fetch content from a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
        },
        required: ['url'],
      },
      async execute(input = {}) {
        const response = await fetch(input.url);
        const content = await response.text();
        return { ok: true, tool: 'fetch_url', url: input.url, status: response.status, content };
      },
    }),

    defineTool({
      name: 'spawn_agent',
      capability: 'delegate',
      description: 'Spawn a bounded child agent for parallel or isolated work.',
      inputSchema: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Agent role (e.g. "code-reviewer", "explorer")' },
          scope: { type: 'string', description: 'Scope restriction for the agent' },
          prompt: { type: 'string', description: 'Task description for the agent' },
          model: { type: 'string', description: 'Model override (inherit, sonnet, opus, haiku)' },
          isolation: { type: 'string', enum: ['local', 'process', 'docker'], description: 'Execution isolation mode: local (in-process), process (child node), docker (container)' },
          tools: { type: 'array', items: { type: 'string' }, description: 'Tool whitelist' },
        },
        required: ['role'],
      },
      async execute(input = {}, runtime) {
        const agent = runtime.agents.spawn(input);
        runtime.inbox.ensure(agent.id);
        await runtime.persist();
        return { ok: true, tool: 'spawn_agent', agent };
      },
    }),

    defineTool({
      name: 'send_message',
      capability: 'delegate',
      description: 'Send a message to another agent.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Sender agent ID' },
          to: { type: 'string', description: 'Recipient agent ID' },
          body: { type: 'string', description: 'Message content' },
          kind: { type: 'string', enum: ['event', 'request', 'response'], description: 'Mailbox message kind' },
          correlationId: { type: 'string', description: 'RPC correlation id' },
          replyTo: { type: 'string', description: 'Reply target agent id' },
          expectReply: { type: 'boolean', description: 'Whether a request expects a response' },
          awaitReply: { type: 'boolean', description: 'Wait for a response when sending a request' },
          timeoutMs: { type: 'number', description: 'Timeout for awaitReply in milliseconds' },
          payload: { type: 'object', description: 'Structured payload' },
        },
        required: ['to', 'body'],
      },
      async execute(input = {}, runtime) {
        const base = { from: input.from ?? 'runtime', to: input.to, body: input.body ?? '', sentAt: new Date().toISOString(), kind: input.kind, correlationId: input.correlationId, replyTo: input.replyTo, expectReply: input.expectReply, payload: input.payload };
        runtime.session.messages = [...(runtime.session.messages ?? []), base];
        const routed = input.kind === 'request'
          ? runtime.inbox.request(input.to, base)
          : runtime.inbox.send(input.to, base);
        await runtime.persist();
        if (input.kind === 'request' && input.awaitReply === true) {
          const response = await runtime.awaitResponse(base.from, routed.correlationId, { timeoutMs: input.timeoutMs });
          return { ok: true, tool: 'send_message', message: routed, response };
        }
        return { ok: true, tool: 'send_message', message: routed };
      },
    }),

    defineTool({
      name: 'tasks',
      capability: 'delegate',
      description: 'Create, update, or list tasks for tracking work.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'list'], description: 'Task action' },
          id: { type: 'string', description: 'Task ID (for update)' },
          task: { type: 'object', description: 'Task data (for create)' },
          patch: { type: 'object', description: 'Fields to update (for update)' },
        },
      },
      async execute(input = {}, runtime) {
        let task;
        switch (input.action) {
          case 'create':
            task = runtime.tasks.create(input.task ?? {});
            break;
          case 'update':
            task = runtime.tasks.update(input.id, input.patch ?? {});
            break;
          case 'dispatch':
            return {
              ok: true,
              tool: 'tasks',
              results: await runtime.orchestrator.runReadyTasks({
                parallel: input.parallel !== false,
                concurrency: input.concurrency ?? Infinity,
                timeoutMs: input.timeoutMs,
                maxInboxSize: input.maxInboxSize ?? Infinity,
              }),
              tasks: runtime.tasks.list(),
            };
          default:
            return { ok: true, tool: 'tasks', tasks: runtime.tasks.list() };
        }
        await runtime.persist();
        return { ok: true, tool: 'tasks', task, tasks: runtime.tasks.list() };
      },
    }),
  ];
}
