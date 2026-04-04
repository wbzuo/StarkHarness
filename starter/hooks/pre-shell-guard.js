// PreToolUse hook that blocks dangerous shell commands
export default {
  event: 'PreToolUse',
  matcher: 'shell',
  async handler({ toolInput }) {
    const dangerous = ['rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod -R 777', '> /dev/sd'];
    const cmd = toolInput?.command ?? '';
    for (const pattern of dangerous) {
      if (cmd.includes(pattern)) {
        return { decision: 'deny', reason: `Blocked dangerous command pattern: ${pattern}` };
      }
    }
    return { decision: 'allow' };
  },
};
