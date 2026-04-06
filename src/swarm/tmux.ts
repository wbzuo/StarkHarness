import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

function quoteShell(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function buildTaskCommand(task, { cwd = process.cwd() } = {}) {
  if (task.command) return task.command;
  if (task.prompt) {
    const mainPath = path.join(cwd, 'src', 'main.ts');
    return `node --import tsx ${quoteShell(mainPath)} run --prompt=${quoteShell(task.prompt)}`;
  }
  return 'printf "idle pane\\n"';
}

export function buildTmuxSwarmPlan({ sessionName, id, cwd = process.cwd(), cliCommand = '', tasks = [] } = {}) {
  const resolvedSession = sessionName ?? (id ? `stark-${id}` : null);
  if (!resolvedSession) throw new Error('tmux-swarm requires id or sessionName');
  if (tasks.length === 0) throw new Error('tmux-swarm requires at least one task');
  const [first, ...rest] = tasks;
  const commands = [
    { cmd: 'tmux', args: ['new-session', '-d', '-s', resolvedSession, buildTaskCommand(first, { cwd })], options: { cwd } },
    ...rest.map((task) => ({ cmd: 'tmux', args: ['split-window', '-t', resolvedSession, '-d', buildTaskCommand(task, { cwd })], options: { cwd } })),
    { cmd: 'tmux', args: ['select-layout', '-t', resolvedSession, 'tiled'], options: { cwd } },
  ];
  if (cliCommand) {
    commands.push({ cmd: 'tmux', args: ['display-message', '-t', resolvedSession, cliCommand], options: { cwd } });
  }
  return commands;
}

export async function launchTmuxSwarm({ id, sessionName, cwd = process.cwd(), tasks = [], prompts = [], cliPath = '', exec = execFileAsync } = {}) {
  const normalizedTasks = tasks.length > 0 ? tasks : prompts.map((prompt) => ({ prompt }));
  const plan = buildTmuxSwarmPlan({ id, sessionName, cwd, cliCommand: cliPath, tasks: normalizedTasks });
  for (const step of plan) {
    await exec(step.cmd, step.args, step.options);
  }
  return {
    ok: true,
    sessionName: sessionName ?? `stark-${id}`,
    taskCount: normalizedTasks.length,
  };
}

export async function listTmuxSwarms({ exec = execFileAsync } = {}) {
  const { stdout } = await exec('tmux', ['list-sessions', '-F', '#{session_name}']).catch(() => ({ stdout: '' }));
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((name) => name.startsWith('stark-'))
    .map((name) => ({ backend: 'tmux', sessionName: name, id: name.replace(/^stark-/, '') }));
}

export async function stopTmuxSwarm(idOrOptions, maybeOptions = {}) {
  const options = typeof idOrOptions === 'object' && idOrOptions !== null
    ? idOrOptions
    : { id: idOrOptions, ...maybeOptions };
  const { id, sessionName: rawSessionName, exec = execFileAsync } = options;
  const sessionName = rawSessionName ?? (String(id).startsWith('stark-') ? String(id) : `stark-${id}`);
  await exec('tmux', ['kill-session', '-t', sessionName]);
  return {
    ok: true,
    sessionName,
  };
}
