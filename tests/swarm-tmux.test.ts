import test from 'node:test';
import assert from 'node:assert/strict';
import { launchTmuxSwarm, listTmuxSwarms, stopTmuxSwarm } from '../src/swarm/tmux.js';

test('tmux swarm helpers build the expected tmux commands', async () => {
  const calls = [];
  const exec = async (...args) => {
    calls.push(args);
    if (args[1][0] === 'list-sessions') {
      return { stdout: 'stark-demo\nother\n' };
    }
    return { stdout: '' };
  };

  const launched = await launchTmuxSwarm({
    id: 'demo',
    cwd: '/tmp/project',
    tasks: [{ prompt: 'first' }, { prompt: 'second' }],
    exec,
  });
  const listed = await listTmuxSwarms({ exec });
  const stopped = await stopTmuxSwarm({ id: 'demo', exec });

  assert.equal(launched.sessionName, 'stark-demo');
  assert.equal(listed[0].id, 'demo');
  assert.equal(stopped.sessionName, 'stark-demo');
  assert.equal(calls.some(([, argv]) => argv[0] === 'new-session'), true);
  assert.equal(calls.some(([, argv]) => argv[0] === 'split-window'), true);
  assert.equal(calls.some(([, argv]) => argv[0] === 'kill-session'), true);
});
