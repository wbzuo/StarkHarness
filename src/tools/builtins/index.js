import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defineTool } from '../types.js';

const execFileAsync = promisify(execFile);

function resolveWorkspacePath(runtime, targetPath = '.') {
  if (!targetPath) return runtime.context.cwd;
  return path.resolve(runtime.context.cwd, targetPath);
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

function createReadFileTool() {
  return defineTool({
    name: 'read_file',
    capability: 'read',
    description: 'Read workspace files',
    async execute(input = {}, runtime) {
      const filePath = resolveWorkspacePath(runtime, input.path);
      const content = await readFile(filePath, 'utf8');
      return { ok: true, tool: 'read_file', path: filePath, content };
    },
  });
}

function createWriteFileTool() {
  return defineTool({
    name: 'write_file',
    capability: 'write',
    description: 'Create or overwrite files',
    async execute(input = {}, runtime) {
      const filePath = resolveWorkspacePath(runtime, input.path);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content ?? '', 'utf8');
      return { ok: true, tool: 'write_file', path: filePath, bytes: Buffer.byteLength(input.content ?? '', 'utf8') };
    },
  });
}

function createEditFileTool() {
  return defineTool({
    name: 'edit_file',
    capability: 'write',
    description: 'Perform surgical file edits',
    async execute(input = {}, runtime) {
      const filePath = resolveWorkspacePath(runtime, input.path);
      const current = await readFile(filePath, 'utf8');
      if (!current.includes(input.oldString ?? '')) {
        return { ok: false, tool: 'edit_file', reason: 'old-string-not-found', path: filePath };
      }
      const next = current.replace(input.oldString, input.newString ?? '');
      await writeFile(filePath, next, 'utf8');
      return { ok: true, tool: 'edit_file', path: filePath };
    },
  });
}

function createShellTool() {
  return defineTool({
    name: 'shell',
    capability: 'exec',
    description: 'Execute shell commands',
    async execute(input = {}, runtime) {
      const command = input.command ?? 'pwd';
      const { stdout, stderr } = await execFileAsync('/bin/zsh', ['-lc', command], {
        cwd: runtime.context.cwd,
        maxBuffer: 1024 * 1024,
      });
      return { ok: true, tool: 'shell', command, stdout, stderr };
    },
  });
}

function createSearchTool() {
  return defineTool({
    name: 'search',
    capability: 'read',
    description: 'Search workspace content',
    async execute(input = {}, runtime) {
      const query = String(input.query ?? '');
      const files = await walkFiles(runtime.context.cwd);
      const matches = [];
      for (const filePath of files) {
        const content = await readFile(filePath, 'utf8').catch(() => null);
        if (!content || !query) continue;
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.includes(query)) {
            matches.push({ path: filePath, line: index + 1, text: line.trim() });
          }
        });
      }
      return { ok: true, tool: 'search', query, matches };
    },
  });
}

function createGlobTool() {
  return defineTool({
    name: 'glob',
    capability: 'read',
    description: 'Resolve file patterns',
    async execute(input = {}, runtime) {
      const pattern = String(input.pattern ?? '');
      const files = await walkFiles(runtime.context.cwd);
      const needle = pattern.replaceAll('*', '');
      const matches = files.filter((filePath) => filePath.includes(needle));
      return { ok: true, tool: 'glob', pattern, matches };
    },
  });
}

function createFetchUrlTool() {
  return defineTool({
    name: 'fetch_url',
    capability: 'network',
    description: 'Fetch remote content',
    async execute(input = {}) {
      const response = await fetch(input.url);
      const content = await response.text();
      return {
        ok: true,
        tool: 'fetch_url',
        url: input.url,
        status: response.status,
        content,
      };
    },
  });
}

function placeholder(name, capability, description) {
  return defineTool({
    name,
    capability,
    description,
    async execute(input = {}) {
      return {
        ok: true,
        tool: name,
        capability,
        input,
        note: 'placeholder implementation',
      };
    },
  });
}

export function createBuiltinTools() {
  return [
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createShellTool(),
    createSearchTool(),
    createGlobTool(),
    createFetchUrlTool(),
    placeholder('spawn_agent', 'delegate', 'Spawn a bounded child agent'),
    placeholder('send_message', 'delegate', 'Send messages between agents'),
    placeholder('tasks', 'delegate', 'Manage task state'),
  ];
}
