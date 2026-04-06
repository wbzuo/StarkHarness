import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import vm from 'node:vm';
import { defineTool } from '../types.js';
import { ensureWebAccessReady, callWebAccessProxy, loadSiteContext } from '../../web-access/index.js';
import { webSearch } from '../../search/web.js';
import { getFileDiagnostics, searchWorkspaceSymbols } from '../../lsp/diagnostics.js';

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

function lineNumberFromIndex(content, index) {
  return content.slice(0, index).split('\n').length;
}

function snippetAroundLine(content, lineNumber, radius = 1) {
  const lines = content.split('\n');
  const start = Math.max(0, lineNumber - 1 - radius);
  const end = Math.min(lines.length, lineNumber + radius);
  return lines.slice(start, end).join('\n');
}

function collectOccurrences(content, search) {
  const occurrences = [];
  let fromIndex = 0;
  while (true) {
    const index = content.indexOf(search, fromIndex);
    if (index === -1) break;
    const line = lineNumberFromIndex(content, index);
    occurrences.push({
      index,
      line,
      preview: snippetAroundLine(content, line),
    });
    fromIndex = index + Math.max(search.length, 1);
  }
  return occurrences;
}

function createEditDiff(current, next, occurrence) {
  const changedLine = occurrence?.line ?? 1;
  return {
    line: changedLine,
    before: snippetAroundLine(current, changedLine),
    after: snippetAroundLine(next, changedLine),
  };
}

function createRegex(query, { caseSensitive = false } = {}) {
  return new RegExp(query, caseSensitive ? 'g' : 'gi');
}

function grepFile(content, filePath, regex, { before = 0, after = 0 } = {}) {
  const lines = content.split('\n');
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    regex.lastIndex = 0;
    if (!regex.test(lines[index])) continue;
    matches.push({
      path: filePath,
      line: index + 1,
      text: lines[index],
      before: lines.slice(Math.max(0, index - before), index),
      after: lines.slice(index + 1, Math.min(lines.length, index + 1 + after)),
    });
  }
  return matches;
}

function resolveWorkspacePath(runtime, targetPath = '.') {
  if (!targetPath) return runtime.context.cwd;
  return path.resolve(runtime.context.cwd, targetPath);
}

async function loadNotebook(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function saveNotebook(filePath, notebook) {
  await writeFile(filePath, JSON.stringify(notebook, null, 2), 'utf8');
  return filePath;
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
      name: 'ask_user_question',
      capability: 'delegate',
      description: 'Ask the user a direct question and capture the response inside the runtime.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question to ask the user' },
          choices: { type: 'array', items: { type: 'string' }, description: 'Optional suggested choices' },
        },
        required: ['question'],
      },
      async execute(input = {}, runtime) {
        if (!runtime.askUserQuestion) {
          return {
            ok: false,
            tool: 'ask_user_question',
            reason: 'interactive-user-input-unavailable',
            question: input.question,
            choices: input.choices ?? [],
          };
        }
        const answer = await runtime.askUserQuestion({
          question: String(input.question),
          choices: Array.isArray(input.choices) ? input.choices.map(String) : [],
        });
        return {
          ok: true,
          tool: 'ask_user_question',
          question: input.question,
          answer,
        };
      },
    }),

    defineTool({
      name: 'notebook_edit',
      capability: 'write',
      description: 'Edit a Jupyter notebook cell by inserting, replacing, or deleting cells.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the .ipynb notebook file' },
          action: { type: 'string', enum: ['replace_cell', 'insert_cell', 'delete_cell'], description: 'Notebook edit action' },
          index: { type: 'number', description: 'Cell index to edit' },
          cellType: { type: 'string', enum: ['markdown', 'code'], description: 'Cell type for inserted cells' },
          source: { type: 'string', description: 'Cell source text' },
        },
        required: ['path', 'action', 'index'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        const notebook = await loadNotebook(filePath);
        const cells = Array.isArray(notebook.cells) ? [...notebook.cells] : [];
        if (input.action === 'delete_cell') {
          cells.splice(input.index, 1);
        } else if (input.action === 'replace_cell') {
          cells[input.index] = {
            ...(cells[input.index] ?? {}),
            cell_type: input.cellType ?? cells[input.index]?.cell_type ?? 'markdown',
            metadata: cells[input.index]?.metadata ?? {},
            source: String(input.source ?? '').split('\n').map((line, idx, arr) => idx < arr.length - 1 ? `${line}\n` : line),
            outputs: cells[input.index]?.outputs ?? [],
            execution_count: cells[input.index]?.execution_count ?? null,
          };
        } else if (input.action === 'insert_cell') {
          cells.splice(input.index, 0, {
            cell_type: input.cellType ?? 'markdown',
            metadata: {},
            source: String(input.source ?? '').split('\n').map((line, idx, arr) => idx < arr.length - 1 ? `${line}\n` : line),
            outputs: [],
            execution_count: null,
          });
        }
        notebook.cells = cells;
        await saveNotebook(filePath, notebook);
        return { ok: true, tool: 'notebook_edit', path: filePath, action: input.action, cells: notebook.cells.length };
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
        const occurrences = collectOccurrences(current, search);
        if (!input.replace_all && occurrences.length > 1) {
          return {
            ok: false,
            tool: 'edit_file',
            reason: 'old-string-not-unique',
            path: filePath,
            occurrences: occurrences.length,
            matches: occurrences.map(({ line, preview }) => ({ line, preview })),
          };
        }
        const next = input.replace_all ? current.replaceAll(search, replacement) : current.replace(search, replacement);
        await writeFile(filePath, next, 'utf8');
        return {
          ok: true,
          tool: 'edit_file',
          path: filePath,
          occurrences: occurrences.length,
          replacements: input.replace_all ? occurrences.length : 1,
          diff: createEditDiff(current, next, occurrences[0]),
        };
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
        const runtimeEnv = runtime.env?.raw ?? process.env;
        const skillEnv = runtime.context.activeSkill?.dir
          ? {
            CLAUDE_SKILL_DIR: runtime.context.activeSkill.dir,
            STARKHARNESS_ACTIVE_SKILL: runtime.context.activeSkill.name ?? '',
          }
          : {};
        const { stdout, stderr } = await execFileAsync('/bin/sh', ['-c', command], {
          cwd: runtime.context.cwd,
          env: { ...runtimeEnv, ...skillEnv },
          maxBuffer: 4 * 1024 * 1024,
          timeout,
        });
        return { ok: true, tool: 'shell', command, stdout, stderr };
      },
    }),

    defineTool({
      name: 'repl_tool',
      capability: 'exec',
      description: 'Evaluate JavaScript or Python snippets in a lightweight REPL-style session.',
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string', enum: ['javascript', 'python'], description: 'REPL language', default: 'javascript' },
          code: { type: 'string', description: 'Code snippet to execute' },
          session: { type: 'string', description: 'Logical REPL session identifier', default: 'default' },
        },
        required: ['code'],
      },
      async execute(input = {}, runtime) {
        const language = input.language ?? 'javascript';
        const sessionId = input.session ?? 'default';
        if (language === 'javascript') {
          const key = `${language}:${sessionId}`;
          let context = runtime.replSessions.get(key);
          if (!context) {
            context = vm.createContext({
              console,
              setTimeout,
              clearTimeout,
              Buffer,
              process,
            });
            runtime.replSessions.set(key, context);
          }
          const fn = vm.compileFunction(String(input.code), [], {
            parsingContext: context,
          });
          const value = await fn.call(context);
          return {
            ok: true,
            tool: 'repl_tool',
            language,
            session: sessionId,
            value,
          };
        }

        const runtimeEnv = runtime.env?.raw ?? process.env;
        const { stdout, stderr } = await execFileAsync('python3', ['-c', String(input.code)], {
          cwd: runtime.context.cwd,
          env: runtimeEnv,
          timeout: 120000,
        });
        return {
          ok: true,
          tool: 'repl_tool',
          language,
          session: sessionId,
          stdout,
          stderr,
        };
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
      name: 'grep',
      capability: 'read',
      description: 'Search workspace file contents using a regex pattern with optional context lines.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regular expression pattern to search for' },
          glob: { type: 'string', description: 'Optional file glob filter' },
          before: { type: 'number', description: 'Number of context lines before each match', default: 0 },
          after: { type: 'number', description: 'Number of context lines after each match', default: 0 },
          caseSensitive: { type: 'boolean', description: 'Whether matching should be case-sensitive', default: false },
          maxMatches: { type: 'number', description: 'Maximum number of matches to return', default: 100 },
        },
        required: ['pattern'],
      },
      async execute(input = {}, runtime) {
        const files = await walkFiles(runtime.context.cwd);
        const filtered = input.glob
          ? files.filter((filePath) => matchesGlob(filePath, String(input.glob), runtime.context.cwd))
          : files;
        let regex;
        try {
          regex = createRegex(String(input.pattern ?? ''), { caseSensitive: input.caseSensitive === true });
        } catch (error) {
          return { ok: false, tool: 'grep', reason: 'invalid-pattern', error: error instanceof Error ? error.message : String(error) };
        }
        const before = Number(input.before ?? 0);
        const after = Number(input.after ?? 0);
        const maxMatches = Number(input.maxMatches ?? 100);
        const matches = [];
        for (const filePath of filtered) {
          const content = await readFile(filePath, 'utf8').catch(() => null);
          if (!content) continue;
          matches.push(...grepFile(content, filePath, regex, { before, after }));
          if (matches.length >= maxMatches) break;
        }
        return {
          ok: true,
          tool: 'grep',
          pattern: String(input.pattern ?? ''),
          matches: matches.slice(0, maxMatches),
        };
      },
    }),

    defineTool({
      name: 'tool_search',
      capability: 'read',
      description: 'Search available tools by name or description.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Substring query to match against tool names and descriptions' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const query = String(input.query ?? '').toLowerCase();
        const matches = runtime.tools.list()
          .filter((tool) => tool.name.toLowerCase().includes(query) || String(tool.description ?? '').toLowerCase().includes(query))
          .map((tool) => ({
            name: tool.name,
            capability: tool.capability,
            description: tool.description,
          }));
        return { ok: true, tool: 'tool_search', query, matches };
      },
    }),

    defineTool({
      name: 'lsp_diagnostics',
      capability: 'read',
      description: 'Collect TypeScript/JavaScript diagnostics for a file.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path to the source file' },
        },
        required: ['path'],
      },
      async execute(input = {}, runtime) {
        const filePath = resolveWorkspacePath(runtime, input.path);
        const diagnostics = getFileDiagnostics(filePath, { cwd: runtime.context.cwd });
        return { ok: true, tool: 'lsp_diagnostics', file: filePath, diagnostics };
      },
    }),

    defineTool({
      name: 'lsp_workspace_symbols',
      capability: 'read',
      description: 'Search workspace symbols using a lightweight TypeScript-backed index.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Symbol name or pattern to search for' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const symbols = searchWorkspaceSymbols(runtime.context.cwd, String(input.query ?? ''));
        return { ok: true, tool: 'lsp_workspace_symbols', query: input.query, symbols };
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
      name: 'web_search',
      capability: 'network',
      description: 'Search the web using the configured search provider.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          count: { type: 'number', description: 'Number of results to return' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const result = await webSearch({
          query: input.query,
          count: input.count,
          envConfig: runtime.env,
        });
        return { ok: true, tool: 'web_search', ...result };
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
      name: 'browser_targets',
      capability: 'network',
      description: 'List browser targets from the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      async execute(_input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const result = await callWebAccessProxy('/targets', { env: runtime.env?.raw });
        return { ok: true, tool: 'browser_targets', skillDir, targets: result.data };
      },
    }),

    defineTool({
      name: 'browser_open',
      capability: 'network',
      description: 'Open a URL in a browser tab through the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to open in a new browser tab' },
        },
        required: ['url'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const result = await callWebAccessProxy(`/new?url=${encodeURIComponent(input.url)}`, { env: runtime.env?.raw });
        return { ok: true, tool: 'browser_open', skillDir, target: result.data };
      },
    }),

    defineTool({
      name: 'browser_eval',
      capability: 'network',
      description: 'Evaluate JavaScript in a browser target through the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Browser target id' },
          expression: { type: 'string', description: 'JavaScript expression to evaluate' },
        },
        required: ['target', 'expression'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const result = await callWebAccessProxy(`/eval?target=${encodeURIComponent(input.target)}`, {
          method: 'POST',
          body: input.expression,
          env: runtime.env?.raw,
        });
        return { ok: true, tool: 'browser_eval', skillDir, result: result.data };
      },
    }),

    defineTool({
      name: 'browser_click',
      capability: 'network',
      description: 'Click an element in a browser target using JS click or a real mouse event.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Browser target id' },
          selector: { type: 'string', description: 'CSS selector to click' },
          mode: { type: 'string', enum: ['js', 'mouse'], description: 'Click mode: js for element.click(), mouse for CDP mouse events', default: 'js' },
        },
        required: ['target', 'selector'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const endpoint = input.mode === 'mouse' ? 'clickAt' : 'click';
        const result = await callWebAccessProxy(`/${endpoint}?target=${encodeURIComponent(input.target)}`, {
          method: 'POST',
          body: input.selector,
          env: runtime.env?.raw,
        });
        return { ok: true, tool: 'browser_click', skillDir, mode: input.mode ?? 'js', result: result.data };
      },
    }),

    defineTool({
      name: 'browser_scroll',
      capability: 'network',
      description: 'Scroll a browser target through the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Browser target id' },
          y: { type: 'number', description: 'Absolute scroll offset' },
          direction: { type: 'string', enum: ['top', 'bottom'], description: 'Convenience scroll direction' },
        },
        required: ['target'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const params = new URLSearchParams({ target: input.target });
        if (input.y !== undefined) params.set('y', String(input.y));
        if (input.direction) params.set('direction', input.direction);
        const result = await callWebAccessProxy(`/scroll?${params.toString()}`, { env: runtime.env?.raw });
        return { ok: true, tool: 'browser_scroll', skillDir, result: result.data };
      },
    }),

    defineTool({
      name: 'browser_screenshot',
      capability: 'network',
      description: 'Capture a browser target screenshot through the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Browser target id' },
          file: { type: 'string', description: 'Absolute or relative output file path' },
        },
        required: ['target', 'file'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const filePath = path.resolve(runtime.context.cwd, input.file);
        const result = await callWebAccessProxy(`/screenshot?target=${encodeURIComponent(input.target)}&file=${encodeURIComponent(filePath)}`, { env: runtime.env?.raw });
        return { ok: true, tool: 'browser_screenshot', skillDir, file: filePath, result: result.data };
      },
    }),

    defineTool({
      name: 'browser_close',
      capability: 'network',
      description: 'Close a browser target through the bundled web-access CDP proxy.',
      inputSchema: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'Browser target id' },
        },
        required: ['target'],
      },
      async execute(input = {}, runtime) {
        const skillDir = await ensureWebAccessReady({ cwd: runtime.context.cwd, env: runtime.env?.raw });
        const result = await callWebAccessProxy(`/close?target=${encodeURIComponent(input.target)}`, { env: runtime.env?.raw });
        return { ok: true, tool: 'browser_close', skillDir, result: result.data };
      },
    }),

    defineTool({
      name: 'web_site_context',
      capability: 'read',
      description: 'Read bundled web-access site-pattern guidance for a user query or domain.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural-language query or domain to match against site patterns' },
        },
        required: ['query'],
      },
      async execute(input = {}, runtime) {
        const result = await loadSiteContext(input.query, { cwd: runtime.context.cwd, env: runtime.env?.raw });
        return { ok: true, tool: 'web_site_context', skillDir: result.skillDir, context: result.context };
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

    defineTool({
      name: 'todo_write',
      capability: 'delegate',
      description: 'Persist a user-facing todo list for the current workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                status: { type: 'string' },
                priority: { type: 'string' },
              },
              required: ['content'],
            },
          },
        },
        required: ['todos'],
      },
      async execute(input = {}, runtime) {
        const todos = (input.todos ?? []).map((todo, index) => ({
          id: todo.id ?? `todo-${index + 1}`,
          content: todo.content,
          status: todo.status ?? 'pending',
          priority: todo.priority ?? 'medium',
        }));
        const filePath = await runtime.state.saveTodos(todos);
        return {
          ok: true,
          tool: 'todo_write',
          filePath,
          todos,
        };
      },
    }),
  ];
}
