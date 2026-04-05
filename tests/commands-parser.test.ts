import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseCommandFile, loadCommandsFromDir } from '../src/commands/parser.js';

test('parses YAML frontmatter + markdown body', () => {
  const raw = `---
description: Review code changes
allowed-tools: Read, Bash(git:*)
model: sonnet
---

Review each file for quality issues.
Provide line numbers and severity.`;

  const cmd = parseCommandFile('review', raw);
  assert.equal(cmd.name, 'review');
  assert.equal(cmd.description, 'Review code changes');
  assert.deepEqual(cmd.allowedTools, ['Read', 'Bash(git:*)']);
  assert.equal(cmd.model, 'sonnet');
  assert.ok(cmd.prompt.includes('Review each file'));
});

test('handles missing frontmatter as pure prompt', () => {
  const cmd = parseCommandFile('simple', 'Just do the thing.');
  assert.equal(cmd.name, 'simple');
  assert.equal(cmd.prompt, 'Just do the thing.');
});

test('parses argument-hint field', () => {
  const raw = `---
description: Fix an issue
argument-hint: [issue-number]
---
Fix issue #$ARGUMENTS.`;
  const cmd = parseCommandFile('fix', raw);
  assert.equal(cmd.argumentHint, '[issue-number]');
  assert.ok(cmd.prompt.includes('$ARGUMENTS'));
});

test('loadCommandsFromDir reads .md files from directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-cmd-'));
  const cmdDir = path.join(root, 'commands');
  await mkdir(cmdDir, { recursive: true });
  await writeFile(path.join(cmdDir, 'deploy.md'), `---
description: Deploy to production
allowed-tools: Bash(git push:*)
---
Push to main and deploy.`);

  const commands = await loadCommandsFromDir(cmdDir);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, 'deploy');
  assert.equal(commands[0].description, 'Deploy to production');
});
