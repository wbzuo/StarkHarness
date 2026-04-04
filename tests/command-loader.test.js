import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { discoverCommands } from '../src/commands/loader.js';

test('discoverCommands loads .md files from multiple directories', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cmd-loader-'));
  const userDir = path.join(root, 'user-commands');
  const projectDir = path.join(root, 'project-commands');
  await mkdir(userDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(userDir, 'review.md'), '---\ndescription: Review code\n---\nReview the code.', 'utf8');
  await writeFile(path.join(projectDir, 'deploy.md'), '---\ndescription: Deploy\n---\nDeploy to prod.', 'utf8');

  const commands = await discoverCommands([userDir, projectDir]);
  assert.equal(commands.length, 2);
  assert.ok(commands.some((c) => c.name === 'review'));
  assert.ok(commands.some((c) => c.name === 'deploy'));
});

test('discoverCommands project-level overrides user-level', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cmd-override-'));
  const userDir = path.join(root, 'user');
  const projectDir = path.join(root, 'project');
  await mkdir(userDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(path.join(userDir, 'review.md'), '---\ndescription: User review\n---\nUser version.', 'utf8');
  await writeFile(path.join(projectDir, 'review.md'), '---\ndescription: Project review\n---\nProject version.', 'utf8');

  const commands = await discoverCommands([userDir, projectDir]);
  const review = commands.find((c) => c.name === 'review');
  assert.equal(review.description, 'Project review');
});

test('discoverCommands handles missing directories gracefully', async () => {
  const commands = await discoverCommands(['/nonexistent/path']);
  assert.equal(commands.length, 0);
});
