import { readFile, readdir, mkdir } from 'node:fs/promises';
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
      const content = await readFile(p, 'utf8').catch(() => '');
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
}
