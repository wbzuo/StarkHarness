import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { SkillLoader } from '../src/skills/loader.js';

async function makeSkillDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sh-skill-'));
  const skillDir = path.join(root, 'skills', 'hook-dev');
  await mkdir(skillDir, { recursive: true });
  await mkdir(path.join(skillDir, 'references'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---
name: hook-development
description: This skill should be used when the user asks to "create a hook" or "add a PreToolUse hook".
version: 0.1.0
---

# Hook Development

Create hooks by defining event types and matchers.

## Quick Reference
| Event | When |
|-------|------|
| PreToolUse | Before tool runs |`);
  await writeFile(path.join(skillDir, 'references', 'patterns.md'), `# Hook Patterns\n\nDetailed pattern documentation here.`);
  return { root, skillsDir: path.join(root, 'skills') };
}

test('Level 1: loads skill metadata without body', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const skills = await loader.discoverSkills();
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'hook-development');
  assert.ok(skills[0].description.includes('create a hook'));
  assert.equal(skills[0].body, undefined);
});

test('Level 2: loads skill body on demand', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const skill = await loader.loadSkill('hook-dev');
  assert.ok(skill.body.includes('Hook Development'));
  assert.ok(skill.body.includes('Quick Reference'));
});

test('Level 3: loads references on deep request', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  const refs = await loader.loadReferences('hook-dev');
  assert.equal(refs.length, 1);
  assert.ok(refs[0].content.includes('Hook Patterns'));
});

test('matchSkill finds skill by trigger phrases', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  await loader.discoverSkills();
  const match = loader.matchSkill('I want to create a hook');
  assert.equal(match.name, 'hook-development');
});

test('matchSkill returns null for no match', async () => {
  const { skillsDir } = await makeSkillDir();
  const loader = new SkillLoader(skillsDir);
  await loader.discoverSkills();
  const match = loader.matchSkill('deploy to production');
  assert.equal(match, null);
});
