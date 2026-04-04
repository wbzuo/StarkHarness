let sessionCounter = 0;

export function createSession({ goal = 'boot', mode = 'interactive', cwd = process.cwd() } = {}) {
  sessionCounter += 1;
  return {
    id: `sh-${sessionCounter}`,
    goal,
    mode,
    cwd,
    status: 'idle',
    turns: [],
    createdAt: new Date().toISOString(),
  };
}
