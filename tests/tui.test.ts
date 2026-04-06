import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTuiDashboard } from '../src/ui/tui.js';

test('renderTuiDashboard includes the main product panels', () => {
  const output = renderTuiDashboard({
    session: { id: 'sess-1', mode: 'interactive' },
    counts: { commands: 10, tools: 20 },
    features: { autoMode: true },
    bridge: { remoteControl: true },
    voice: { ready: true },
    webAccess: { ready: true },
  });

  assert.match(output, /StarkHarness TUI/);
  assert.match(output, /Session/);
  assert.match(output, /Counts/);
  assert.match(output, /Voice \/ Web/);
});
