import test from 'node:test';
import assert from 'node:assert/strict';
import { launchTmuxSwarm, listTmuxSwarms, stopTmuxSwarm } from '../src/swarm/tmux.js';

test('tmux swarm helpers build the expected tmux commands', async () => {
  const calls = [];
  const exec = async (...args) => {
    calls.push(args);
    if (args[1][0] === 'list-sessions') {
      return { stdout: 'stark-demo\nstarkharness-demo\nother\n' };
    }
    if (args[1][0] === 'kill-session' && args[1][2] === 'stark-web') {
      throw new Error('missing-session');
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
  const stopped = await stopTmuxSwarm('starkharness-demo', { exec });
  const stoppedById = await stopTmuxSwarm({ id: 'web', exec });

  assert.equal(launched.sessionName, 'stark-demo');
  assert.equal(listed[0].id, 'demo');
  assert.equal(listed[1].id, 'demo');
  assert.equal(listed[1].sessionName, 'starkharness-demo');
  assert.equal(stopped.sessionName, 'starkharness-demo');
  assert.equal(stoppedById.sessionName, 'starkharness-web');
  assert.equal(calls.some(([, argv]) => argv[0] === 'new-session'), true);
  assert.equal(calls.some(([, argv]) => argv[0] === 'split-window'), true);
  assert.equal(calls.some(([, argv]) => argv[0] === 'kill-session'), true);
  assert.deepEqual(calls[0][1].slice(0, 6), ['new-session', '-d', '-s', 'stark-demo', '-c', '/tmp/project']);
  assert.deepEqual(calls[1][1].slice(0, 6), ['split-window', '-t', 'stark-demo', '-d', '-c', '/tmp/project']);
});
