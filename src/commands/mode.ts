const MODE_COMMANDS = [
  { from: 'interactive', to: 'coordinator', enter: 'enter-coordinator-mode', exit: 'exit-coordinator-mode', status: 'coordinator-status', desc: 'coordinator mode for delegation-first orchestration' },
  { from: 'interactive', to: 'plan', enter: 'enter-plan-mode', exit: 'exit-plan-mode', status: 'plan-status', desc: 'read-only planning mode' },
];

export function createModeCommands() {
  const commands = [];
  for (const mode of MODE_COMMANDS) {
    commands.push({
      name: mode.enter,
      description: `Switch the session into ${mode.desc}`,
      async execute(runtime) {
        runtime.session.mode = mode.to;
        runtime.context.mode = mode.to;
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    });
    commands.push({
      name: mode.exit,
      description: `Exit ${mode.desc} and return to interactive mode`,
      async execute(runtime) {
        runtime.session.mode = mode.from;
        runtime.context.mode = mode.from;
        await runtime.persist();
        return { ok: true, mode: runtime.session.mode };
      },
    });
    commands.push({
      name: mode.status,
      description: `Show whether ${mode.desc} is active`,
      async execute(runtime) {
        return {
          enabled: runtime.session.mode === mode.to,
          mode: runtime.session.mode,
        };
      },
    });
  }
  return commands;
}
