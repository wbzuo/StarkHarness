export function parseMcpConfig(config = {}) {
  const servers = config.mcpServers ?? {};
  return Object.entries(servers).map(([name, def]) => ({
    name,
    command: def.command,
    args: def.args ?? [],
    env: def.env ?? {},
    disabled: def.disabled ?? false,
  }));
}

export function validateMcpServer(server) {
  if (!server.command || typeof server.command !== 'string') {
    return { valid: false, reason: 'command is required and must be a non-empty string' };
  }
  return { valid: true };
}
