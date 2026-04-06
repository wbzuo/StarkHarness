import { runHarnessTurn } from '../kernel/loop.js';
import { createBlueprintDocument } from '../kernel/runtime.js';
import { listSandboxProfiles } from '../permissions/profiles.js';
import { createReplayPlan, evaluateReplayPlan } from '../replay/runner.js';
import { getWebAccessStatus } from '../web-access/index.js';
import { listStarterApps, scaffoldApp } from '../app/scaffold.js';
import { writeEnvValues, removeEnvKeys } from '../config/env.js';
import { envKeysForProvider, PROVIDER_ENV_KEYS } from '../config/provider-keys.js';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generatePkcePair, buildAuthorizationUrl } from '../oauth/pkce.js';
import { exchangeAuthorizationCode, refreshAccessToken, waitForOAuthCode } from '../oauth/client.js';
import { webSearch } from '../search/web.js';
import { describeVoice, transcribeAudio } from '../voice/index.js';
import { packagePluginAsDxt, validateDxtPackage, installDxtPackage } from '../plugins/dxt.js';
import { startTui } from '../ui/tui.js';
import { launchTmuxSwarm, listTmuxSwarms, stopTmuxSwarm } from '../swarm/tmux.js';
import { writeFile, rm } from 'node:fs/promises';
import { createPassthroughCommands } from './passthrough.js';
import { createModeCommands } from './mode.js';

const execFileAsync = promisify(execFile);

function filterTranscript(entries, args = {}) {
  let next = entries;
  if (args.event) next = next.filter((entry) => entry.eventName === args.event);
  if (args.query) next = next.filter((entry) => JSON.stringify(entry).includes(args.query));
  if (args.limit) next = next.slice(-Number(args.limit));
  return next;
}

function createPluginCommand(command) {
  return {
    name: command.name,
    description: command.description ?? `Plugin command from ${command.plugin}`,
    async execute(_runtime) {
      return {
        ok: true,
        source: 'plugin',
        plugin: command.plugin,
        command: command.name,
        output: command.output ?? null,
      };
    },
  };
}

function createSessionSummary(runtime) {
  return {
    id: runtime.session.id,
    goal: runtime.session.goal,
    mode: runtime.session.mode,
    cwd: runtime.session.cwd,
    turns: runtime.session.turns.length,
    tasks: runtime.tasks.list().length,
    agents: runtime.agents.list().length,
    messages: (runtime.session.messages ?? []).length,
    queuedMessages: runtime.inbox.totalCount(),
  };
}

function createStatusSummary(runtime) {
  const swarms = summarizeSwarms(runtime);
  return {
    app: runtime.app
      ? {
        name: runtime.app.name,
        version: runtime.app.version,
        startup: runtime.app.startup,
        automation: runtime.app.automation,
      }
      : null,
    session: createSessionSummary(runtime),
    providers: runtime.env ? {
      anthropic: Boolean(runtime.env.providers?.anthropic?.apiKey),
      openai: Boolean(runtime.env.providers?.openai?.apiKey),
      compatible: Boolean(runtime.env.providers?.compatible?.apiKey),
    } : {},
    features: {
      webAccess: runtime.env?.features?.webAccess ?? true,
      remoteControl: runtime.env?.features?.remoteControl ?? true,
      autoMode: runtime.env?.features?.autoMode ?? false,
      autoUpdate: runtime.env?.features?.autoUpdate ?? false,
      debug: runtime.env?.features?.debug ?? false,
      voice: runtime.env?.features?.voice ?? true,
      autoDream: runtime.env?.features?.autoDream ?? false,
    },
    webAccess: {
      available: runtime.webAccess?.available ?? false,
      ready: runtime.webAccess?.ready ?? false,
      proxyUrl: runtime.webAccess?.proxyUrl ?? null,
    },
    voice: runtime.voice ?? describeVoice(runtime.env),
    bridge: runtime.env?.bridge ?? {},
    remoteBridge: runtime.describeRemoteBridge?.() ?? null,
    managedSettings: {
      configured: Boolean(runtime.env?.settings?.managedUrl),
      keys: Object.keys(runtime.managedSettings ?? {}),
    },
    observability: runtime.observability?.status?.() ?? null,
    workers: {
      active: runtime.listWorkers().length,
      queuedMessages: runtime.inbox.totalCount(),
      pendingResponses: runtime.inbox.pendingCount?.() ?? 0,
    },
    counts: {
      commands: runtime.commands.list().length,
      tools: runtime.tools.list().length,
      agents: runtime.agents.list().length,
      tasks: runtime.tasks.list().length,
      plugins: runtime.plugins.list().length,
    },
    swarms,
    fileCache: runtime.fileCache?.status?.() ?? null,
  };
}

function parseListArgument(value, { separator = ',' } = {}) {
  if (!value) return [];
  return String(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArgument(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function compareVersions(left = '0.0.0', right = '0.0.0') {
  const leftParts = String(left).split('.').map((part) => Number(part) || 0);
  const rightParts = String(right).split('.').map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function normalizeSwarmTasks(args = {}) {
  const explicit = parseJsonArgument(args.tasksJson ?? args.tasks, null);
  let tasks = [];
  if (Array.isArray(explicit)) {
    tasks = explicit;
  } else if (explicit && typeof explicit === 'object') {
    tasks = [explicit];
  } else if (typeof args.tasks === 'string' && args.tasks.trim()) {
    tasks = String(args.tasks)
      .split(/\n{2,}|;;/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  } else if (args.goal ?? args.prompt) {
    tasks = [args.goal ?? args.prompt];
  }

  return tasks.map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        subject: `Swarm task ${index + 1}`,
        description: entry,
      };
    }
    return {
      subject: entry.subject ?? entry.title ?? `Swarm task ${index + 1}`,
      description: entry.description ?? entry.prompt ?? entry.goal ?? '',
      role: entry.role ?? null,
      tools: Array.isArray(entry.tools) ? entry.tools : [],
    };
  }).filter((task) => task.description);
}

function summarizeSwarms(runtime) {
  const groups = new Map();
  for (const agent of runtime.agents.list()) {
    if (!agent.swarmId) continue;
    const current = groups.get(agent.swarmId) ?? { id: agent.swarmId, agents: 0, tasks: 0, completedTasks: 0, failedTasks: 0 };
    current.agents += 1;
    groups.set(agent.swarmId, current);
  }
  for (const task of runtime.tasks.list()) {
    if (!task.swarmId) continue;
    const current = groups.get(task.swarmId) ?? { id: task.swarmId, agents: 0, tasks: 0, completedTasks: 0, failedTasks: 0 };
    current.tasks += 1;
    if (task.status === 'completed') current.completedTasks += 1;
    if (task.status === 'failed') current.failedTasks += 1;
    groups.set(task.swarmId, current);
  }
  return [...groups.values()];
}

async function executeSwarm(runtime, tasks, agents, { parallel = true } = {}) {
  const queue = [...tasks];
  const results = [];

  async function runAssignment(task, agent) {
    runtime.tasks.update(task.id, {
      status: 'running',
      owner: agent.id,
      startedAt: new Date().toISOString(),
    });
    runtime.agents.update(agent.id, {
      status: 'running',
      currentTaskId: task.id,
      dispatchCount: Number(agent.dispatchCount ?? 0) + 1,
    });
    await runtime.persist();
    try {
      const result = await runtime.executor.execute(agent, task);
      runtime.tasks.update(task.id, {
        status: 'completed',
        owner: agent.id,
        completedAt: new Date().toISOString(),
        result,
      });
      runtime.agents.update(agent.id, {
        status: 'idle',
        currentTaskId: null,
        lastResult: result.finalText ?? '',
        lastError: null,
      });
      results.push({ taskId: task.id, agentId: agent.id, finalText: result.finalText, stopReason: result.stopReason });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.tasks.update(task.id, {
        status: 'failed',
        owner: agent.id,
        failedAt: new Date().toISOString(),
        error: message,
      });
      runtime.agents.update(agent.id, {
        status: 'idle',
        currentTaskId: null,
        lastError: message,
      });
      results.push({ taskId: task.id, agentId: agent.id, error: message });
    }
    await runtime.persist();
  }

  const runWorker = async (agent, index) => {
    if (!parallel) {
      const task = tasks[index];
      if (task) await runAssignment(task, agent);
      return;
    }
    while (queue.length > 0) {
      const task = queue.shift();
      if (!task) break;
      await runAssignment(task, agent);
    }
  };

  await Promise.all(agents.map((agent, index) => runWorker(agent, index)));
  return results;
}

export function createCommandRegistry() {
  return [
    ...createPassthroughCommands(),
    ...createModeCommands(),
    {
      name: 'blueprint',
      description: 'Print module blueprint',
      async execute(runtime) {
        return createBlueprintDocument(runtime);
      },
    },
    {
      name: 'doctor',
      description: 'Validate harness wiring',
      async execute(runtime) {
        return {
          ok: true,
          providers: runtime.providers.list().length,
          tools: runtime.tools.list().length,
          commands: runtime.commands.list().length,
          capabilityDomains: Object.keys(runtime.capabilities).length,
          sessionPath: runtime.state.getSessionPath(runtime.session.id),
          policy: runtime.permissions.snapshot(),
          transcriptPath: runtime.telemetry.transcriptPath,
          plugins: runtime.plugins.list().length,
          sandboxProfiles: listSandboxProfiles(),
          app: runtime.app,
          webAccess: runtime.webAccess,
          env: runtime.env ? {
            filePath: runtime.env.filePath ?? null,
            features: runtime.env.features,
            bridge: runtime.env.bridge,
          } : null,
        };
      },
    },
    {
      name: 'status',
      description: 'Show a product-style runtime status summary',
      async execute(runtime) {
        return createStatusSummary(runtime);
      },
    },
    {
      name: 'settings-status',
      description: 'Show managed settings configuration and persisted snapshot summary',
      async execute(runtime) {
        const snapshotRecord = await runtime.state.loadManagedSettings();
        const snapshot = snapshotRecord?.settings ?? snapshotRecord ?? {};
        return {
          configured: Boolean(runtime.env?.settings?.managedUrl),
          url: runtime.env?.settings?.managedUrl ?? null,
          autoSync: runtime.env?.settings?.autoSync ?? false,
          keys: Object.keys(snapshot ?? {}),
          updatedAt: snapshotRecord?.updatedAt ?? null,
          source: snapshotRecord?.source ?? null,
          snapshot,
        };
      },
    },
    {
      name: 'settings-sync',
      description: 'Fetch and apply managed settings from the configured remote endpoint',
      async execute(runtime) {
        const snapshot = await runtime.syncManagedSettings();
        return {
          ok: true,
          keys: Object.keys(snapshot ?? {}),
          snapshot,
        };
      },
    },
    {
      name: 'voice-transcribe',
      description: 'Transcribe a local audio file through the configured voice provider',
      async execute(runtime, args = {}) {
        if (!args.path) throw new Error('voice-transcribe requires --path');
        const filePath = path.resolve(runtime.context.cwd, args.path);
        const result = await transcribeAudio({
          filePath,
          prompt: args.prompt ?? '',
          language: args.language ?? '',
          envConfig: runtime.env,
        });
        return {
          ok: true,
          path: filePath,
          ...result,
        };
      },
    },
    {
      name: 'magic-docs',
      description: 'Search for related documentation and summarize the top results',
      async execute(runtime, args = {}) {
        const topic = args.topic ?? args.prompt ?? '';
        if (!topic) {
          throw new Error('magic-docs requires --topic or --prompt');
        }
        const search = await webSearch({
          query: `${topic} documentation`,
          envConfig: runtime.env,
          count: Number(args.count ?? 3),
        });
        const pages = [];
        for (const result of search.results.slice(0, Number(args.count ?? 3))) {
          try {
            const response = await fetch(result.url);
            const content = await response.text();
            pages.push({
              ...result,
              content: content.slice(0, 4000),
            });
          } catch {
            pages.push({
              ...result,
              content: '',
            });
          }
        }

        const summaryProvider = {
          complete: ({ systemPrompt, messages, tools }) =>
            runtime.providers.completeWithStrategy({
              capability: 'chat',
              request: { systemPrompt, messages, tools },
              retryOptions: { maxRetries: 1, baseDelay: 50, timeout: 30000 },
            }),
        };

        let summary = pages.map((page) => `- ${page.title}: ${page.snippet}`).join('\n');
        try {
          const response = await summaryProvider.complete({
            systemPrompt: 'Summarize the following documentation findings into a concise developer-oriented brief. Mention the strongest sources.',
            messages: [{
              role: 'user',
              content: JSON.stringify({ topic, pages }),
            }],
            tools: [],
          });
          summary = response.text ?? summary;
        } catch {}

        return {
          topic,
          summary,
          sources: pages.map(({ title, url, snippet }) => ({ title, url, snippet })),
        };
      },
    },
    {
      name: 'swarm-start',
      description: 'Create a scoped swarm of agents and run a batch of tasks across them',
      async execute(runtime, args = {}) {
        const swarmId = args.id ?? `swarm-${Date.now().toString(36)}`;
        const tasks = normalizeSwarmTasks(args);
        if (tasks.length === 0) {
          throw new Error('swarm-start requires --goal, --prompt, --tasks, or --tasksJson');
        }

        const requestedRoles = parseListArgument(args.roles);
        const workerCount = Math.max(1, Number(args.workers ?? (requestedRoles.length || 2)));
        const roles = requestedRoles.length > 0
          ? requestedRoles
          : Array.from({ length: workerCount }, (_, index) => index === 0 ? 'planner' : 'executor');
        const allowedTools = parseJsonArgument(args.tools, null);
        const agents = roles.map((role, index) => runtime.agents.spawn({
          role,
          scope: 'swarm',
          swarmId,
          description: `${role} worker for ${args.goal ?? 'coordinated execution'}`,
          tools: Array.isArray(allowedTools) ? allowedTools : [],
          color: ['blue', 'green', 'amber', 'red'][index % 4],
        }));
        const createdTasks = tasks.map((task, index) => runtime.tasks.create({
          id: `${swarmId}-task-${index + 1}`,
          status: 'pending',
          subject: task.subject,
          description: task.description,
          swarmId,
          preferredRole: task.role,
          tools: task.tools,
        }));
        await runtime.persist();

        const orderedAgents = createdTasks.map((task, index) => {
          if (!task.preferredRole) return agents[index % agents.length];
          return agents.find((agent) => agent.role === task.preferredRole) ?? agents[index % agents.length];
        });
        const results = await executeSwarm(runtime, createdTasks, orderedAgents, {
          parallel: args.parallel !== 'false',
        });
        return {
          id: swarmId,
          agents: agents.map(({ id }) => runtime.agents.get(id)).filter(Boolean),
          tasks: createdTasks.map(({ id }) => runtime.tasks.get(id)).filter(Boolean),
          results,
        };
      },
    },
    {
      name: 'swarm-status',
      description: 'Show swarm groups and their agent/task counts',
      async execute(runtime, args = {}) {
        if (!args.id) return summarizeSwarms(runtime);
        return {
          id: args.id,
          agents: runtime.agents.list().filter((agent) => agent.swarmId === args.id),
          tasks: runtime.tasks.list().filter((task) => task.swarmId === args.id),
        };
      },
    },
    {
      name: 'swarm-terminal-start',
      description: 'Launch a tmux-backed multi-terminal swarm session',
      async execute(runtime, args = {}) {
        const tasks = normalizeSwarmTasks(args).map((task) => ({
          prompt: task.description,
          command: task.command ?? null,
        }));
        const result = await launchTmuxSwarm({
          id: args.id ?? `terminal-${Date.now().toString(36)}`,
          cwd: runtime.context.cwd,
          tasks,
        });
        const current = await runtime.state.loadSwarmSessions();
        const next = [...current.filter((entry) => entry.sessionName !== result.sessionName), {
          ...result,
          type: 'tmux',
          cwd: runtime.context.cwd,
          createdAt: new Date().toISOString(),
        }];
        await runtime.state.saveSwarmSessions(next);
        return result;
      },
    },
    {
      name: 'swarm-launch',
      description: 'Launch a multi-terminal swarm through tmux',
      async execute(runtime, args = {}) {
        const sessionName = args.session ?? args.id ?? `starkharness-${Date.now().toString(36)}`;
        const tasks = normalizeSwarmTasks(args).map((task) => task.description);
        if (tasks.length === 0) throw new Error('swarm-launch requires --goal, --prompt, --tasks, or --tasksJson');
        const cliPath = `node --import tsx ${path.resolve(runtime.context.cwd, 'src/main.ts')}`;
        const result = await launchTmuxSwarm({
          sessionName,
          cwd: runtime.context.cwd,
          cliPath,
          prompts: tasks,
        });
        const entries = await runtime.state.loadSwarmSessions();
        const next = [...entries.filter((entry) => entry.sessionName !== sessionName), {
          backend: 'tmux',
          sessionName,
          cwd: runtime.context.cwd,
          prompts: tasks,
          createdAt: new Date().toISOString(),
        }];
        await runtime.state.saveSwarmSessions(next);
        return result;
      },
    },
    {
      name: 'swarm-list',
      description: 'List persisted and live multi-terminal swarm sessions',
      async execute(runtime) {
        return {
          persisted: await runtime.state.loadSwarmSessions(),
          live: await listTmuxSwarms(),
        };
      },
    },
    {
      name: 'swarm-stop',
      description: 'Stop a multi-terminal swarm session',
      async execute(runtime, args = {}) {
        const sessionName = args.session ?? args.id;
        if (!sessionName) throw new Error('swarm-stop requires --session or --id');
        const result = await stopTmuxSwarm(sessionName);
        const entries = await runtime.state.loadSwarmSessions();
        await runtime.state.saveSwarmSessions(entries.filter((entry) => entry.sessionName !== result.sessionName));
        return result;
      },
    },
    {
      name: 'init',
      description: 'Scaffold a starter StarkHarness app into a target directory',
      async execute(_runtime, args = {}) {
        return scaffoldApp({
          targetDir: args.target ?? '.',
          template: args.template ?? 'browser-research',
          force: args.force === 'true',
        });
      },
    },
    {
      name: 'login',
      description: 'Persist provider credentials/config into the app or workspace env file and reload runtime providers',
      async execute(runtime, args = {}) {
        if (args.method === 'oauth') {
          const provider = args.provider ?? 'openai';
          const pkce = generatePkcePair();
          const callback = await waitForOAuthCode({ timeoutMs: Number(args.timeoutMs ?? 120000) });
          const authorizeUrl = buildAuthorizationUrl({
            authorizeUrl: args.authorizeUrl,
            clientId: args.clientId,
            redirectUri: callback.redirectUri,
            scope: args.scope ?? '',
            state: pkce.state,
            codeChallenge: pkce.challenge,
            codeChallengeMethod: pkce.method,
          });

          const codePromise = callback.promise.then(async ({ code, state }) => {
            if (state !== pkce.state) throw new Error('oauth state mismatch');
            const token = await exchangeAuthorizationCode({
              tokenUrl: args.tokenUrl,
              clientId: args.clientId,
              clientSecret: args.clientSecret ?? null,
              code,
              redirectUri: callback.redirectUri,
              codeVerifier: pkce.verifier,
            });
            const profile = await runtime.state.saveAuthProfile(provider, {
              mode: 'oauth',
              authorizeUrl: args.authorizeUrl,
              tokenUrl: args.tokenUrl,
              clientId: args.clientId,
              accessToken: token.access_token ?? null,
              refreshToken: token.refresh_token ?? null,
              expiresIn: token.expires_in ?? null,
              scope: token.scope ?? args.scope ?? '',
            });
            await runtime.reloadEnvAndProviders();
            return {
              ok: true,
              provider,
              authorizationUrl: authorizeUrl,
              redirectUri: callback.redirectUri,
              profile,
            };
          });

          return {
            ok: true,
            provider,
            authorizationUrl: authorizeUrl,
            redirectUri: callback.redirectUri,
            state: pkce.state,
            waitForCompletion: codePromise,
          };
        }
        const provider = args.provider ?? 'openai';
        const keyMap = envKeysForProvider(provider);
        const filePath = await writeEnvValues({
          cwd: runtime.app?.rootDir ?? runtime.context.cwd,
          envFilePath: runtime.app?.paths?.envPath ?? null,
          values: {
            ...(args.apiKey ? { [keyMap.apiKey]: args.apiKey } : {}),
            ...(args.baseUrl ? { [keyMap.baseUrl]: args.baseUrl } : {}),
            ...(args.model ? { [keyMap.model]: args.model } : {}),
          },
        });
        await runtime.reloadEnvAndProviders();
        return {
          ok: true,
          provider,
          filePath,
          status: await runtime.dispatchCommand('login-status'),
        };
      },
    },
    {
      name: 'oauth-refresh',
      description: 'Refresh an OAuth access token for a saved provider profile',
      async execute(runtime, args = {}) {
        const provider = args.provider ?? 'openai';
        const profiles = await runtime.state.loadAuthProfiles();
        const profile = profiles[provider];
        if (!profile?.refreshToken || !profile?.tokenUrl || !profile?.clientId) {
          throw new Error(`No refreshable OAuth profile found for ${provider}`);
        }
        const token = await refreshAccessToken({
          tokenUrl: profile.tokenUrl,
          clientId: profile.clientId,
          clientSecret: args.clientSecret ?? null,
          refreshToken: profile.refreshToken,
        });
        const nextProfile = await runtime.state.saveAuthProfile(provider, {
          accessToken: token.access_token ?? profile.accessToken,
          refreshToken: token.refresh_token ?? profile.refreshToken,
          expiresIn: token.expires_in ?? profile.expiresIn ?? null,
          scope: token.scope ?? profile.scope ?? '',
        });
        await runtime.reloadEnvAndProviders();
        return { ok: true, provider, profile: nextProfile };
      },
    },
    {
      name: 'oauth-status',
      description: 'Show saved OAuth profiles and token availability',
      async execute(runtime) {
        const profiles = await runtime.state.loadAuthProfiles();
        return Object.fromEntries(
          Object.entries(profiles).map(([provider, profile]) => [
            provider,
            {
              mode: profile.mode ?? 'oauth',
              accessToken: Boolean(profile.accessToken),
              refreshToken: Boolean(profile.refreshToken),
              scope: profile.scope ?? '',
              updatedAt: profile.updatedAt ?? null,
            },
          ]),
        );
      },
    },
    {
      name: 'logout',
      description: 'Remove provider credentials/config from the app or workspace env file and reload runtime providers',
      async execute(runtime, args = {}) {
        const provider = args.provider ?? 'openai';
        const keys = envKeysForProvider(provider);
        const filePath = await removeEnvKeys({
          cwd: runtime.app?.rootDir ?? runtime.context.cwd,
          envFilePath: runtime.app?.paths?.envPath ?? null,
          keys: Object.values(keys),
        });
        await runtime.reloadEnvAndProviders();
        return {
          ok: true,
          provider,
          filePath,
          status: await runtime.dispatchCommand('login-status'),
        };
      },
    },
    {
      name: 'plugin-marketplace-list',
      description: 'List plugins from a configured plugin registry endpoint',
      async execute(runtime) {
        const registryUrl = runtime.env?.plugins?.registryUrl;
        if (!registryUrl) {
          throw new Error('STARKHARNESS_PLUGIN_REGISTRY_URL is not configured');
        }
        const response = await fetch(registryUrl);
        if (!response.ok) throw new Error(`plugin registry request failed: ${response.status}`);
        return response.json();
      },
    },
    {
      name: 'plugin-install',
      description: 'Install a plugin manifest into the local plugin directory',
      async execute(runtime, args = {}) {
        const pluginsDir = runtime.app?.paths?.pluginsDir ?? path.join(runtime.context.cwd, 'plugins');
        await mkdir(pluginsDir, { recursive: true });
        let manifest;
        if (args.dxt) {
          const installed = await installDxtPackage({
            filePath: path.resolve(runtime.context.cwd, args.dxt),
            targetDir: pluginsDir,
          });
          await runtime.activatePluginManifest?.(installed.manifest);
          return installed;
        } else if (args.url) {
          const response = await fetch(args.url);
          if (!response.ok) throw new Error(`plugin download failed: ${response.status}`);
          manifest = await response.json();
        } else if (args.manifest) {
          manifest = typeof args.manifest === 'string' ? JSON.parse(args.manifest) : args.manifest;
        } else {
          throw new Error('plugin-install requires --url or --manifest');
        }
        const filePath = path.join(pluginsDir, `${manifest.name}.json`);
        await writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf8');
        await runtime.activatePluginManifest?.(manifest);
        return {
          ok: true,
          filePath,
          plugin: manifest.name,
        };
      },
    },
    {
      name: 'plugin-package-dxt',
      description: 'Package a plugin manifest as a DXT-compatible zip archive',
      async execute(runtime, args = {}) {
        const manifestPath = path.resolve(runtime.context.cwd, args.path ?? args.manifestPath ?? 'plugin.json');
        const result = await packagePluginAsDxt({
          manifestPath,
          outputPath: args.output ? path.resolve(runtime.context.cwd, args.output) : null,
          include: Array.isArray(args.include) ? args.include : parseListArgument(args.include),
        });
        return {
          ...result,
          outputPath: result.filePath,
        };
      },
    },
    {
      name: 'plugin-validate-dxt',
      description: 'Validate a DXT-compatible plugin archive',
      async execute(runtime, args = {}) {
        const source = args.path ?? args.packagePath ?? args.filePath;
        if (!source) throw new Error('plugin-validate-dxt requires --path');
        const packagePath = path.resolve(runtime.context.cwd, source);
        return validateDxtPackage(packagePath);
      },
    },
    {
      name: 'plugin-trust-list',
      description: 'List trusted plugins for DXT install/update flows',
      async execute(runtime) {
        return runtime.state.loadTrustedPlugins();
      },
    },
    {
      name: 'plugin-trust',
      description: 'Mark a plugin as trusted for install and update flows',
      async execute(runtime, args = {}) {
        const entries = await runtime.state.loadTrustedPlugins();
        const next = [...new Set([...entries, args.name].filter(Boolean))];
        await runtime.state.saveTrustedPlugins(next);
        return next;
      },
    },
    {
      name: 'plugin-autoupdate',
      description: 'Best-effort plugin autoupdate using the configured registry and trusted plugin list',
      async execute(runtime) {
        const trusted = new Set(await runtime.state.loadTrustedPlugins());
        const registry = await runtime.dispatchCommand('plugin-marketplace-list');
        const updates = [];
        for (const plugin of runtime.plugins.list()) {
          if (!trusted.has(plugin.name)) continue;
          const remote = registry.find((entry) => entry.name === plugin.name);
          if (!remote || !remote.version || remote.version === plugin.version) continue;
          if (remote.dxtUrl) {
            const target = path.join(runtime.state.rootDir, `${plugin.name}-${remote.version}.dxt.zip`);
            const response = await fetch(remote.dxtUrl);
            if (!response.ok) continue;
            const buffer = Buffer.from(await response.arrayBuffer());
            await writeFile(target, buffer);
            const installed = await runtime.dispatchCommand('plugin-install', { dxt: target });
            updates.push({
              plugin: plugin.name,
              name: plugin.name,
              from: plugin.version ?? null,
              to: remote.version,
              installed,
            });
            continue;
          }
          if (remote.manifestUrl) {
            const installed = await runtime.dispatchCommand('plugin-install', { url: remote.manifestUrl });
            updates.push({
              plugin: plugin.name,
              name: plugin.name,
              from: plugin.version ?? null,
              to: remote.version,
              installed,
            });
          }
        }
        return {
          ok: true,
          trusted: [...trusted],
          updates,
        };
      },
    },
    {
      name: 'plugin-uninstall',
      description: 'Remove a locally installed plugin manifest by name',
      async execute(runtime, args = {}) {
        const pluginsDir = runtime.app?.paths?.pluginsDir ?? path.join(runtime.context.cwd, 'plugins');
        const filePath = path.join(pluginsDir, `${args.name}.json`);
        const contentPath = path.join(pluginsDir, args.name);
        await rm(filePath, { force: true });
        await rm(contentPath, { recursive: true, force: true });
        await runtime.deactivatePlugin?.(args.name);
        return { ok: true, filePath, contentPath };
      },
    },
    {
      name: 'growthbook-sync',
      description: 'Refresh remote feature flags from a configured GrowthBook endpoint',
      async execute(runtime) {
        return {
          flags: await runtime.refreshFeatureFlags(),
          status: runtime.featureFlags?.status?.() ?? null,
        };
      },
    },
    {
      name: 'smoke-test',
      description: 'Execute a read_file turn to verify harness wiring end-to-end',
      async execute(runtime) {
        return runHarnessTurn(runtime, {
          tool: 'read_file',
          input: { path: `.starkharness/sessions/${runtime.session.id}.json` },
        });
      },
    },
    {
      name: 'session-summary',
      description: 'Summarize the current resumed session',
      async execute(runtime) {
        return createSessionSummary(runtime);
      },
    },
    {
      name: 'session-transcript',
      description: 'Load the persisted session transcript entries',
      async execute(runtime, args = {}) {
        return runtime.state.loadSessionTranscript(args.sessionId ?? runtime.session.id);
      },
    },
    {
      name: 'orchestrate',
      description: 'Dispatch all ready tasks across available agents',
      async execute(runtime, args = {}) {
        return runtime.orchestrator.runReadyTasks({
          parallel: args.parallel !== 'false',
          concurrency: args.concurrency ? Number(args.concurrency) : Infinity,
          timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : undefined,
          maxInboxSize: args.maxInboxSize ? Number(args.maxInboxSize) : Infinity,
        });
      },
    },
    {
      name: 'inbox',
      description: 'List inbox messages for an agent',
      async execute(runtime, args = {}) {
        return runtime.inbox.list(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'repl',
      description: 'Start the interactive StarkHarness REPL',
      async execute(runtime) {
        const { startRepl } = await import('../ui/repl.js');
        return startRepl(runtime);
      },
    },
    {
      name: 'tui',
      description: 'Start the rich terminal dashboard UI',
      async execute(runtime) {
        return startTui(runtime);
      },
    },
    {
      name: 'worker-start',
      description: 'Start an inbox worker loop for an agent',
      async execute(runtime, args = {}) {
        return runtime.startWorker(args.agent ?? args.id ?? 'agent-1', {
          pollIntervalMs: Number(args.pollIntervalMs ?? 50),
          maxMessagesPerTick: Number(args.maxMessagesPerTick ?? 1),
          timeoutMs: Number(args.timeoutMs ?? 120000),
          maxRestarts: Number(args.maxRestarts ?? 0),
          restartDelayMs: Number(args.restartDelayMs ?? 50),
        });
      },
    },
    {
      name: 'worker-stop',
      description: 'Stop an inbox worker loop for an agent',
      async execute(runtime, args = {}) {
        return runtime.stopWorker(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'agent-state',
      description: 'Load persisted state for an agent',
      async execute(runtime, args = {}) {
        return runtime.state.loadAgentState(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'worker-state',
      description: 'Load persisted worker metrics for an agent',
      async execute(runtime, args = {}) {
        return runtime.state.loadAgentWorker(args.agent ?? args.id ?? 'agent-1');
      },
    },
    {
      name: 'agent-summary',
      description: 'Show the persisted summary for an agent',
      async execute(runtime, args = {}) {
        const state = await runtime.state.loadAgentState(args.agent ?? args.id ?? 'agent-1');
        return state?.lastSummary ?? null;
      },
    },
    {
      name: 'plugins',
      description: 'List registered plugins and capabilities',
      async execute(runtime) {
        return {
          plugins: runtime.plugins.list(),
          capabilities: runtime.plugins.listCapabilities(),
          commands: runtime.plugins.listCommands(),
          tools: runtime.plugins.listTools(),
          diagnostics: runtime.pluginDiagnostics,
        };
      },
    },
    {
      name: 'enter-worktree',
      description: 'Create or switch into a git worktree for the current repository',
      async execute(runtime, args = {}) {
        const branch = args.branch ?? 'starkharness-worktree';
        const worktreeRoot = path.join(runtime.state.rootDir, 'worktrees');
        const worktreePath = path.join(worktreeRoot, branch);
        await mkdir(worktreeRoot, { recursive: true });
        await execFileAsync('git', ['worktree', 'add', '-B', branch, worktreePath], {
          cwd: runtime.context.cwd,
        });
        runtime.session.worktreeParentCwd = runtime.context.cwd;
        runtime.session.cwd = worktreePath;
        runtime.context.cwd = worktreePath;
        await runtime.persist();
        return { ok: true, branch, worktreePath };
      },
    },
    {
      name: 'exit-worktree',
      description: 'Return to the original project root from a temporary worktree session',
      async execute(runtime) {
        const target = runtime.session.worktreeParentCwd ?? runtime.app?.rootDir ?? process.cwd();
        runtime.session.cwd = target;
        runtime.context.cwd = target;
        runtime.session.worktreeParentCwd = null;
        await runtime.persist();
        return { ok: true, cwd: target };
      },
    },
    {
      name: 'web-access-status',
      description: 'Show bundled web-access availability, scripts, and proxy readiness',
      async execute(runtime, args = {}) {
        return getWebAccessStatus({
          cwd: runtime.context.cwd,
          ensure: args.ensure === 'true',
        });
      },
    },
    {
      name: 'dream',
      description: 'Run a manual memory consolidation pass over the current session transcript',
      async execute(runtime, args = {}) {
        const transcript = await runtime.state.loadSessionTranscript(args.sessionId ?? runtime.session.id);
        const messages = transcript
          .filter((entry) => entry.type === 'message' && entry.role && entry.content)
          .map((entry) => ({ role: entry.role, content: entry.content }));
        const result = await runtime.memory.extractAndPersistMemories({
          messages,
          provider: {
            complete: ({ systemPrompt, messages: promptMessages, tools }) =>
              runtime.providers.completeWithStrategy({
                capability: 'chat',
                request: { systemPrompt, messages: promptMessages, tools },
                retryOptions: { maxRetries: 1, baseDelay: 50, timeout: 30000 },
              }),
          },
        });
        return result;
      },
    },
    {
      name: 'dream-status',
      description: 'Show dream/cron background consolidation status',
      async execute(runtime, args = {}) {
        const crons = await runtime.state.loadCrons();
        const entries = crons.filter((entry) => (entry.kind ?? '') === 'dream' || (entry.command ?? '') === 'dream');
        const id = args.id ?? 'dream-background';
        return {
          enabled: runtime.env?.features?.autoDream ?? false,
          schedule: runtime.env?.dream?.schedule ?? null,
          pollIntervalMs: runtime.env?.dream?.pollIntervalMs ?? null,
          background: runtime.backgroundTimer != null,
          automation: runtime.backgroundTimer ? 'active' : 'idle',
          entries,
          entry: entries.find((entry) => entry.id === id) ?? entries.find((entry) => entry.id === 'dream-auto') ?? null,
        };
      },
    },
    {
      name: 'dream-enable-auto',
      description: 'Enable background dream consolidation on a schedule',
      async execute(runtime, args = {}) {
        const crons = await runtime.state.loadCrons();
        const entry = {
          id: 'dream-auto',
          schedule: args.schedule ?? runtime.env?.dream?.schedule ?? '@every:15m',
          command: 'dream',
          enabled: args.enabled !== 'false',
          kind: 'dream',
          createdAt: new Date().toISOString(),
        };
        const next = [...crons.filter((current) => current.id !== entry.id), entry];
        await runtime.state.saveCrons(next);
        return entry;
      },
    },
    {
      name: 'cron-run-due',
      description: 'Run due cron/background jobs immediately',
      async execute(runtime) {
        await runtime.tickBackgroundJobs();
        return {
          ok: true,
          crons: await runtime.state.loadCrons(),
        };
      },
    },
    {
      name: 'dream-start',
      description: 'Enable background dream consolidation through the cron scheduler',
      async execute(runtime, args = {}) {
        const current = await runtime.state.loadCrons();
        const id = args.id ?? 'dream-background';
        const schedule = args.schedule ?? '@every:15m';
        const existing = current.find((entry) => entry.id === id);
        if (existing) {
          Object.assign(existing, {
            schedule,
            command: 'dream',
            kind: 'dream',
            enabled: true,
            sessionId: args.sessionId ?? runtime.session.id,
          });
        } else {
          current.push({
            id,
            schedule,
            command: 'dream',
            kind: 'dream',
            enabled: true,
            sessionId: args.sessionId ?? runtime.session.id,
            createdAt: new Date().toISOString(),
          });
        }
        await runtime.state.saveCrons(current);
        runtime.startBackgroundJobs?.();
        return current.find((entry) => entry.id === id);
      },
    },
    {
      name: 'dream-stop',
      description: 'Disable background dream consolidation',
      async execute(runtime, args = {}) {
        const id = args.id ?? 'dream-background';
        const current = await runtime.state.loadCrons();
        const next = current.map((entry) => entry.id === id ? { ...entry, enabled: false } : entry);
        await runtime.state.saveCrons(next);
        return next.find((entry) => entry.id === id) ?? null;
      },
    },
    
    {
      name: 'auto',
      description: 'Run app-aware auto mode using a prompt, stdin, or app automation defaults',
      async execute(runtime, args = {}) {
        let prompt = args.prompt ?? '';
        if (!prompt && args.stdin) {
          prompt = args.stdin;
        }
        if (!prompt && runtime.app?.automation?.defaultPrompt) {
          prompt = runtime.app.automation.defaultPrompt;
        }
        if (prompt) {
          const result = await runtime.run(prompt);
          return {
            mode: 'prompt',
            prompt,
            finalText: result.finalText,
            turns: result.turns.length,
            stopReason: result.stopReason,
            usage: result.usage,
          };
        }
        if (runtime.app?.automation?.defaultCommand) {
          const result = await runtime.dispatchCommand(runtime.app.automation.defaultCommand, args);
          return {
            mode: 'command',
            command: runtime.app.automation.defaultCommand,
            result,
          };
        }
        throw new Error('Auto mode requires --prompt, stdin input, or app.automation.defaultPrompt/defaultCommand');
      },
    },
    {
      name: 'registry',
      description: 'Show complete state of all registries — tools, commands, providers, plugins, hooks, skills, policy, conflicts',
      async execute(runtime) {
        const { buildDiagnostics } = await import('./diagnostics.js');
        return buildDiagnostics(runtime);
      },
    },
    {
      name: 'traces',
      description: 'Query trace spans — filter by traceId, agentId, name, since',
      async execute(runtime, args = {}) {
        const spans = await runtime.telemetry.queryTraces({
          traceId: args.traceId,
          agentId: args.agentId,
          name: args.name,
          since: args.since,
        });
        if (args.tree === 'true' && args.traceId) {
          const { TraceContext } = await import('../telemetry/index.js');
          const trace = new TraceContext(args.traceId);
          for (const span of spans) {
            const s = trace.startSpan(span.name, span.attributes);
            s.parentSpanId = span.parentSpanId;
            if (span.endTime) s.end(span.status);
          }
          return trace.toTree();
        }
        return spans;
      },
    },
    {
      name: 'transcript',
      description: 'Replay the harness event log',
      async execute(runtime, args = {}) {
        return filterTranscript(await runtime.telemetry.replay(), args);
      },
    },
    {
      name: 'playback',
      description: 'Play transcript events back into a lightweight summary',
      async execute(runtime, args = {}) {
        const events = filterTranscript(await runtime.telemetry.replay(), args);
        return {
          totalEvents: events.length,
          eventNames: [...new Set(events.map((entry) => entry.eventName))],
          lastEvent: events.at(-1) ?? null,
        };
      },
    },
    {
      name: 'cron-create',
      description: 'Persist a cron-like scheduled task definition',
      async execute(runtime, args = {}) {
        const current = await runtime.state.loadCrons();
        const entry = {
          id: args.id ?? `cron-${current.length + 1}`,
          schedule: args.schedule ?? '* * * * *',
          prompt: args.prompt ?? '',
          command: args.command ?? '',
          enabled: args.enabled !== 'false',
          createdAt: new Date().toISOString(),
        };
        current.push(entry);
        await runtime.state.saveCrons(current);
        return entry;
      },
    },
    {
      name: 'cron-delete',
      description: 'Delete a persisted cron schedule by id',
      async execute(runtime, args = {}) {
        const current = await runtime.state.loadCrons();
        const next = current.filter((entry) => entry.id !== args.id);
        await runtime.state.saveCrons(next);
        return { ok: true, removed: current.length - next.length };
      },
    },
    {
      name: 'replay-turn',
      description: 'Produce a deterministic replay skeleton for recorded turns',
      async execute(runtime) {
        return runtime.session.turns.map(({ turn, result }, index) => ({
          step: index + 1,
          tool: turn.tool,
          input: turn.input,
          resultSummary: result.ok === false ? result.reason : result.tool ?? result.output ?? 'ok',
        }));
      },
    },
    {
      name: 'replay-runner',
      description: 'Build a replay execution plan from recorded turns',
      async execute(runtime) {
        const plan = createReplayPlan(runtime.session);
        return {
          plan,
          summary: evaluateReplayPlan(plan),
        };
      },
    },
    {
      name: 'run',
      description: 'Execute a full agent turn loop with the given prompt',
      async execute(runtime, args = {}) {
        const prompt = args.prompt ?? 'What files are in this project?';
        const result = await runtime.run(prompt);
        return {
          finalText: result.finalText,
          turns: result.turns.length,
          stopReason: result.stopReason,
          usage: result.usage,
        };
      },
    },
    {
      name: 'complete',
      description: 'Execute a provider completion request',
      async execute(runtime, args = {}) {
        return runtime.providers.complete(args.provider ?? 'anthropic', {
          prompt: args.prompt ?? 'hello',
          sessionId: runtime.session.id,
          metadata: {
            source: 'command',
          },
          createdAt: new Date().toISOString(),
        });
      },
    },
  ];
}

export class CommandRegistry {
  #commands = new Map();

  clear() {
    this.#commands.clear();
  }

  constructor(definitions = []) {
    definitions.forEach((command) => this.register(command));
  }

  register(command) {
    this.#commands.set(command.name, command);
    return command;
  }

  registerMany(commands = []) {
    commands.forEach((command) => this.register(command));
  }

  registerPluginCommands(pluginCommands = []) {
    const conflicts = [];
    for (const pc of pluginCommands) {
      if (this.#commands.has(pc.name)) {
        conflicts.push({ type: 'command', name: pc.name, source: 'plugin-vs-builtin' });
      }
    }
    const conflictNames = new Set(conflicts.map((c) => c.name));
    const safe = pluginCommands.filter((pc) => !conflictNames.has(pc.name));
    this.registerMany(safe.map(createPluginCommand));
    return conflicts;
  }

  get(name) {
    return this.#commands.get(name);
  }

  list() {
    return [...this.#commands.values()].map(({ name, description }) => ({ name, description }));
  }

  async dispatch(name, runtime, args = {}) {
    const command = this.get(name);
    if (!command) throw new Error(`Unknown command: ${name}`);

    // Contextual runtime with permissions override
    let effectiveRuntime = runtime;
    if (args.permissions) {
      effectiveRuntime = new Proxy(runtime, {
        get(target, prop) {
          if (prop === 'permissions') return args.permissions;
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }

    return command.execute(effectiveRuntime, args);
  }
}
