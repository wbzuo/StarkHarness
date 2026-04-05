export class SystemPromptBuilder {
  build({ tools = [], claudeMd = '', memory = '', hookContext = '', cwd = process.cwd(), platform = process.platform } = {}) {
    const sections = [];

    sections.push(`You are StarkHarness, an agentic coding runtime that lives in your terminal.
You understand codebases, edit files, run commands, and handle workflows through natural language.`);

    sections.push(`# Environment
- Working directory: ${cwd}
- Platform: ${platform}
- Date: ${new Date().toISOString().split('T')[0]}`);

    if (claudeMd.trim()) {
      sections.push(`# Project Instructions (CLAUDE.md)\n${claudeMd.trim()}`);
    }

    if (memory.trim()) {
      sections.push(`# Memory\n${memory.trim()}`);
    }

    if (hookContext.trim()) {
      sections.push(`# Additional Context\n${hookContext.trim()}`);
    }

    if (tools.length > 0) {
      const toolDocs = tools.map((t) => {
        const params = t.input_schema?.properties ?? {};
        const paramLines = Object.entries(params)
          .map(([key, val]) => `    ${key}: ${val.type}${val.description ? ` — ${val.description}` : ''}`)
          .join('\n');
        return `- **${t.name}**: ${t.description}${paramLines ? '\n' + paramLines : ''}`;
      }).join('\n');
      sections.push(`# Available Tools\n${toolDocs}`);
    }

    sections.push(`# Rules
- Read files before editing them.
- Prefer editing existing files over creating new ones.
- Use the permission system. Do not bypass safety checks.
- Be concise. Lead with the answer, not the reasoning.`);

    return sections.join('\n\n');
  }
}
