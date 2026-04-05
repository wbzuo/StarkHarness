export function buildDiagnostics(runtime) {
  return {
    session: runtime.session.id,
    tools: runtime.tools.list().map(({ name, capability, description }) => ({ name, capability, description })),
    commands: runtime.commands.list(),
    providers: runtime.providers.list(),
    plugins: runtime.plugins.list(),
    pluginCapabilities: runtime.plugins.listCapabilities(),
    hooks: {
      events: runtime.hooks.listEvents(),
      handlers: runtime.hooks.listHandlers?.() ?? [],
    },
    workers: runtime.listWorkers?.() ?? [],
    mailbox: runtime.inbox?.stats?.() ?? { totalQueued: 0, pendingResponses: 0, agents: {} },
    skills: runtime.skills?.listDiscovered?.() ?? [],
    policy: runtime.permissions.snapshot(),
    conflicts: {
      commands: runtime.pluginDiagnostics.commandConflicts,
      tools: runtime.pluginDiagnostics.toolConflicts,
    },
  };
}
