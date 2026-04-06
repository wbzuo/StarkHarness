import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ENGLISH_README = new URL('../README.md', import.meta.url);
const CHINESE_README = new URL('../README.zh-CN.md', import.meta.url);

test('README files point users at the current repo root and maintained Quick Start docs', async () => {
  const [english, chinese] = await Promise.all([
    readFile(ENGLISH_README, 'utf8'),
    readFile(CHINESE_README, 'utf8'),
  ]);

  assert.doesNotMatch(english, /cd StarkHarness\/Codex/);
  assert.doesNotMatch(chinese, /cd StarkHarness\/Codex/);
  assert.match(english, /\[docs\/QUICKSTART\.md\]\(\.\/docs\/QUICKSTART\.md\)/);
  assert.match(chinese, /\[docs\/QUICKSTART\.zh-CN\.md\]\(\.\/docs\/QUICKSTART\.zh-CN\.md\)/);
});
