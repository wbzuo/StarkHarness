import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTuiDashboard } from '../src/ui/tui.js';
import { stripAnsi } from '../src/ui/theme.js';

test('renderTuiDashboard includes the main product panels', () => {
  const output = renderTuiDashboard({
    session: { id: 'sess-1', mode: 'interactive' },
    counts: { commands: 10, tools: 20, agents: 2, tasks: 3, plugins: 1 },
    providers: { openai: true, anthropic: false, compatible: true },
    features: { autoMode: true },
    bridge: { remoteControl: true, remoteUrl: 'https://remote.example.com' },
    voice: { ready: true },
    webAccess: { ready: true },
    workers: { active: 1 },
    swarms: [{ id: 'swarm-1' }],
  });

  const plain = stripAnsi(output);
  assert.match(plain, /StarkHarness/);
  assert.match(plain, /Overview/);
  assert.match(plain, /Counts/);
  assert.match(plain, /Bridge & Remote/);
  assert.match(plain, /remote\.example\.com/);
  assert.match(plain, /:status/);
  assert.match(plain, /sess-1/);
  assert.match(plain, /interactive/);
  assert.match(plain, /openai/);
  assert.match(plain, /swarm-1/);
});
