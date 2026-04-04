import { randomBytes } from 'node:crypto';

export function createSession({ goal = 'boot', mode = 'interactive', cwd = process.cwd() } = {}) {
  return {
    id: `sh-${randomBytes(6).toString('hex')}`,
    goal,
    mode,
    cwd,
    status: 'idle',
    turns: [],
    messages: [],
    hookState: {},
    createdAt: new Date().toISOString(),
  };
}
