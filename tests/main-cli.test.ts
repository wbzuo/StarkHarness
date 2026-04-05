import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const mainPath = path.resolve('src/main.ts');

function runCli(args, { stdin = '', timeoutMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', mainPath, ...args], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('cli-timeout'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });

    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

test('CLI pipe mode reads stdin and prints JSON result', async () => {
  const { code, stdout } = await runCli(['pipe'], { stdin: 'hello from pipe\n' });
  assert.equal(code, 0);
  const result = JSON.parse(stdout);
  assert.ok(result.finalText);
  assert.ok(result.traceId);
});

test('CLI repl json mode emits structured JSON lines', async () => {
  const { code, stdout } = await runCli(['repl', '--json=true'], { stdin: 'hello from repl\nexit\n' });
  assert.equal(code, 0);
  const lines = stdout.trim().split('\n').filter(Boolean);
  assert.equal(lines.length >= 1, true);
  const first = JSON.parse(lines[0]);
  assert.equal(first.input, 'hello from repl');
  assert.ok(first.output);
  assert.ok(first.traceId);
});
