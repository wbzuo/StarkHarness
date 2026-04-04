import test from 'node:test';
import assert from 'node:assert/strict';
import { SystemPromptBuilder } from '../src/kernel/prompt.js';

test('builds prompt with identity section', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '' });
  assert.ok(prompt.includes('You are StarkHarness'));
});

test('includes tool descriptions in prompt', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({
    tools: [{ name: 'read_file', description: 'Read a file', input_schema: { type: 'object', properties: {} } }],
    claudeMd: '',
    memory: '',
  });
  assert.ok(prompt.includes('read_file'));
  assert.ok(prompt.includes('Read a file'));
});

test('includes CLAUDE.md content', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '# Rules\nAlways use TDD', memory: '' });
  assert.ok(prompt.includes('Always use TDD'));
});

test('includes memory content', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: 'User is a Go expert' });
  assert.ok(prompt.includes('Go expert'));
});

test('includes hook-injected context', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '', hookContext: 'Learning mode enabled' });
  assert.ok(prompt.includes('Learning mode'));
});

test('includes environment info', () => {
  const builder = new SystemPromptBuilder();
  const prompt = builder.build({ tools: [], claudeMd: '', memory: '', cwd: '/projects/myapp', platform: 'darwin' });
  assert.ok(prompt.includes('/projects/myapp'));
  assert.ok(prompt.includes('darwin'));
});
