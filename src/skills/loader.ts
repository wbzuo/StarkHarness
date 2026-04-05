import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }
  return { meta, body: match[2].trim() };
}

export class SkillLoader {
  #skillsDir;
  #metadata = new Map();

  constructor(skillsDir) {
    this.#skillsDir = skillsDir;
  }

  async discoverSkills() {
    const entries = await readdir(this.#skillsDir, { withFileTypes: true }).catch(() => []);
    const skills = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(this.#skillsDir, entry.name, 'SKILL.md');
      const content = await readFile(skillPath, 'utf8').catch(() => null);
      if (!content) continue;
      const { meta } = parseFrontmatter(content);
      const metadata = {
        dir: entry.name,
        path: path.join(this.#skillsDir, entry.name),
        name: meta.name ?? entry.name,
        description: meta.description ?? '',
        version: meta.version ?? '0.0.0',
      };
      this.#metadata.set(entry.name, metadata);
      skills.push(metadata);
    }
    return skills;
  }

  async loadSkill(dirName) {
    const skillPath = path.join(this.#skillsDir, dirName, 'SKILL.md');
    const content = await readFile(skillPath, 'utf8');
    const { meta, body } = parseFrontmatter(content);
    return {
      dir: dirName,
      path: path.join(this.#skillsDir, dirName),
      name: meta.name ?? dirName,
      description: meta.description ?? '',
      version: meta.version ?? '0.0.0',
      body,
    };
  }

  async loadReferences(dirName) {
    const refDir = path.join(this.#skillsDir, dirName, 'references');
    const files = await readdir(refDir).catch(() => []);
    const refs = [];
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const content = await readFile(path.join(refDir, file), 'utf8');
      refs.push({ file, content });
    }
    return refs;
  }

  listDiscovered() {
    return [...this.#metadata.values()];
  }

  matchSkill(query) {
    const lower = query.toLowerCase();
    for (const [, meta] of this.#metadata) {
      const triggers = [...meta.description.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
      if (triggers.some((t) => lower.includes(t))) return meta;
      const descWords = meta.description.toLowerCase().split(/\s+/);
      const queryWords = lower.split(/\s+/);
      const overlap = queryWords.filter((w) => descWords.includes(w) && w.length > 3).length;
      if (overlap >= 2) return meta;
    }
    return null;
  }
}
