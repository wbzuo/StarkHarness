import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTuiDashboard } from '../src/ui/tui.js';

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

  assert.match(output, /StarkHarness TUI/);
  assert.match(output, /Overview/);
  assert.match(output, /Counts/);
  assert.match(output, /Bridge and Remote/);
  assert.match(output, /remote\.example\.com/);
  assert.match(output, /Visual Notes/);
});
