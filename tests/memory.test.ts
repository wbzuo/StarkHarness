import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { MemoryManager } from '../src/memory/index.js';

test('loads CLAUDE.md from project root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  await writeFile(path.join(root, 'CLAUDE.md'), '# Rules\nAlways test first');
  const mem = new MemoryManager({ projectDir: root });
  const claudeMd = await mem.loadClaudeMd();
  assert.ok(claudeMd.includes('Always test first'));
});

test('returns empty string when CLAUDE.md missing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  const mem = new MemoryManager({ projectDir: root });
  const claudeMd = await mem.loadClaudeMd();
  assert.equal(claudeMd, '');
});

test('loads CLAUDE.md with @include directives', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  await writeFile(path.join(root, 'extra.md'), 'Included rules here');
  await writeFile(path.join(root, 'CLAUDE.md'), '# Main\n@include extra.md\nFinal line');
  const mem = new MemoryManager({ projectDir: root });
  const claudeMd = await mem.loadClaudeMd();
  assert.match(claudeMd, /Main/);
  assert.match(claudeMd, /Included rules here/);
  assert.match(claudeMd, /Final line/);
});

test('loads dynamic memory files with frontmatter', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  const memDir = path.join(root, '.starkharness', 'memory');
  await mkdir(memDir, { recursive: true });
  await writeFile(path.join(memDir, 'user_role.md'), `---
name: user-role
type: user
description: User is a Go expert
---
Senior Go engineer, new to React.`);

  const mem = new MemoryManager({ projectDir: root });
  const memories = await mem.loadDynamicMemory();
  assert.equal(memories.length, 1);
  assert.equal(memories[0].name, 'user-role');
  assert.equal(memories[0].type, 'user');
  assert.ok(memories[0].content.includes('Go engineer'));
});

test('toPromptString combines CLAUDE.md and memories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-mem-'));
  await writeFile(path.join(root, 'CLAUDE.md'), 'Use TDD');
  const memDir = path.join(root, '.starkharness', 'memory');
  await mkdir(memDir, { recursive: true });
  await writeFile(path.join(memDir, 'feedback.md'), `---
name: feedback-terse
type: feedback
description: User wants terse output
---
No trailing summaries.`);

  const mem = new MemoryManager({ projectDir: root });
  const { claudeMd, memoryString } = await mem.toPromptStrings();
  assert.ok(claudeMd.includes('TDD'));
  assert.ok(memoryString.includes('trailing summaries'));
});
