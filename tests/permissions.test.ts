import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PermissionEngine } from '../src/permissions/engine.js';

test('PermissionEngine denies dangerous shell commands through bash classifier', () => {
  const engine = new PermissionEngine({ exec: 'allow' });
  const result = engine.evaluate({
    capability: 'exec',
    toolName: 'shell',
    toolInput: { command: 'rm -rf /' },
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'bash-classifier');
});

test('PermissionEngine applies explicit bash rules before classifier fallback', () => {
  const engine = new PermissionEngine({
    exec: 'allow',
    bashRules: [
      { pattern: 'git push', decision: 'deny', reason: 'blocked remote push' },
    ],
  });
  const result = engine.evaluate({
    capability: 'exec',
    toolName: 'shell',
    toolInput: { command: 'git push origin main' },
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'bash-rule');
  assert.equal(result.reason, 'blocked remote push');
});

test('PermissionEngine applies path rules to file operations', () => {
  const engine = new PermissionEngine({
    write: 'allow',
    pathRules: [
      { pattern: 'secrets/**', write: 'deny' },
    ],
  });
  const result = engine.evaluate({
    capability: 'write',
    toolName: 'write_file',
    toolInput: { path: path.join(process.cwd(), 'secrets', 'prod.env') },
    cwd: process.cwd(),
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.source, 'path-rule');
});
