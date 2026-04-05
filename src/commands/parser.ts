import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content.trim() };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function parseAllowedTools(raw) {
  if (!raw) return [];
  const cleaned = raw.replace(/^\[/, '').replace(/\]$/, '');
  return cleaned.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

export function parseCommandFile(name, content) {
  const { meta, body } = parseFrontmatter(content);
  return {
    name,
    description: meta.description ?? '',
    allowedTools: parseAllowedTools(meta['allowed-tools']),
    model: meta.model ?? 'inherit',
    argumentHint: meta['argument-hint'] ?? '',
    disableModelInvocation: meta['disable-model-invocation'] === 'true',
    prompt: body,
  };
}

export async function loadCommandsFromDir(dirPath) {
  const files = await readdir(dirPath).catch(() => []);
  const commands = [];
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const content = await readFile(path.join(dirPath, file), 'utf8');
    const name = file.replace(/\.md$/, '');
    commands.push(parseCommandFile(name, content));
  }
  return commands;
}
