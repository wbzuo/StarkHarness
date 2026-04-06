import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key.trim()) meta[key.trim()] = rest.join(':').trim();
  }
  return { meta, body: match[2].trim() };
}

async function resolveClaudeIncludes(filePath, seen = new Set()) {
  if (seen.has(filePath)) return '';
  seen.add(filePath);
  const content = await readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) return '';

  const lines = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^@include\s+(.+)$/);
    if (!match) {
      lines.push(line);
      continue;
    }
    const includePath = path.resolve(path.dirname(filePath), match[1].trim());
    const included = await resolveClaudeIncludes(includePath, seen);
    if (included.trim()) {
      lines.push(`\n<!-- included from ${match[1].trim()} -->`);
      lines.push(included);
      lines.push(`<!-- end include ${match[1].trim()} -->\n`);
    }
  }
  return lines.join('\n').trim();
}

export class MemoryManager {
  constructor({ projectDir, userDir }) {
    this.projectDir = projectDir;
    this.userDir = userDir;
    this.memoryDir = path.join(projectDir, '.starkharness', 'memory');
  }

  async loadClaudeMd() {
    const paths = [
      path.join(this.projectDir, 'CLAUDE.md'),
      ...(this.userDir ? [path.join(this.userDir, 'CLAUDE.md')] : []),
    ];
    const sections = [];
    for (const p of paths) {
      const content = await resolveClaudeIncludes(p).catch(() => '');
      if (content.trim()) sections.push(content.trim());
    }
    return sections.join('\n\n');
  }

  async loadDynamicMemory() {
    await mkdir(this.memoryDir, { recursive: true }).catch(() => {});
    const files = await readdir(this.memoryDir).catch(() => []);
    const memories = [];
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const content = await readFile(path.join(this.memoryDir, file), 'utf8');
      const { meta, body } = parseFrontmatter(content);
      memories.push({
        file,
        name: meta.name ?? file.replace('.md', ''),
        type: meta.type ?? 'unknown',
        description: meta.description ?? '',
        content: body,
      });
    }
    return memories;
  }

  async toPromptStrings() {
    const claudeMd = await this.loadClaudeMd();
    const memories = await this.loadDynamicMemory();
    const memoryString = memories.map((m) => `[${m.type}:${m.name}] ${m.content}`).join('\n');
    return { claudeMd, memoryString, memories };
  }

  async persistAutoMemory(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    await mkdir(this.memoryDir, { recursive: true }).catch(() => {});
    const target = path.join(this.memoryDir, 'auto-memory.md');
    const existing = await readFile(target, 'utf8').catch(() => '');
    const current = existing.trim()
      ? parseFrontmatter(existing).body.split('\n').filter(Boolean)
      : [];
    const merged = [...new Set([...current, ...entries.map((entry) => `- ${entry}`)])];
    const content = [
      '---',
      'name: auto-memory',
      'type: auto',
      'description: Auto-extracted durable memories',
      '---',
      '',
      ...merged,
      '',
    ].join('\n');
    await writeFile(target, content, 'utf8');
    return target;
  }

  async extractAndPersistMemories({ messages = [], provider } = {}) {
    if (!provider || !Array.isArray(messages) || messages.length === 0) return { entries: [], path: null, strategy: 'disabled' };
    const transcript = messages
      .map((message) => `${message.role.toUpperCase()}: ${typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}`)
      .join('\n\n');

    let text = '';
    try {
      const response = await provider.complete({
        systemPrompt: 'Extract 0-5 durable memories from the conversation. Return only a JSON array of short strings.',
        messages: [{ role: 'user', content: transcript }],
        tools: [],
      });
      text = response.text ?? '';
    } catch {
      return { entries: [], path: null, strategy: 'error' };
    }

    let entries = [];
    try {
      entries = JSON.parse(text);
    } catch {
      entries = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean);
    }
    entries = entries
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0)
      .slice(0, 5);

    const memoryPath = await this.persistAutoMemory(entries);
    return { entries, path: memoryPath, strategy: 'llm' };
  }
}
