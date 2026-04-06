#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcEntry = join(__dirname, '../src/index.ts');

const child = spawn('node', ['--import', 'tsx', srcEntry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_NO_WARNINGS: '1' }
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
