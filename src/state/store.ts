import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function loadJsonFile(filePath, fallback) {
  const content = await readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) return fallback;
  return JSON.parse(content);
}

export class StateStore {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.sessionDir = path.join(rootDir, 'sessions');
    this.runtimePath = path.join(rootDir, 'runtime.json');
    this.agentDir = path.join(rootDir, 'agents');
    this.todosPath = path.join(rootDir, 'todos.json');
    this.authProfilesPath = path.join(rootDir, 'auth-profiles.json');
    this.cronsPath = path.join(rootDir, 'crons.json');
    this.dreamStatePath = path.join(rootDir, 'dream.json');
    this.managedSettingsPath = path.join(rootDir, 'managed-settings.json');
    this.trustedPluginsPath = path.join(rootDir, 'trusted-plugins.json');
    this.swarmSessionsPath = path.join(rootDir, 'swarm-sessions.json');
  }

  async init() {
    await mkdir(this.sessionDir, { recursive: true });
    await mkdir(this.agentDir, { recursive: true });
    return this;
  }

  getSessionPath(sessionId) {
    return path.join(this.sessionDir, `${sessionId}.json`);
  }

  getSessionTranscriptPath(sessionId) {
    return path.join(this.sessionDir, `${sessionId}.transcript.jsonl`);
  }

  getAgentRoot(agentId) {
    return path.join(this.agentDir, agentId);
  }

  getAgentSessionPath(agentId) {
    return path.join(this.getAgentRoot(agentId), 'session.json');
  }

  getAgentStatePath(agentId) {
    return path.join(this.getAgentRoot(agentId), 'state.json');
  }

  getAgentTranscriptPath(agentId) {
    return path.join(this.getAgentRoot(agentId), 'transcript.jsonl');
  }

  getAgentWorkerPath(agentId) {
    return path.join(this.getAgentRoot(agentId), 'worker.json');
  }

  async saveSession(session) {
    const target = this.getSessionPath(session.id);
    await writeFile(target, JSON.stringify(session, null, 2), 'utf8');
    return target;
  }

  async loadSession(sessionId) {
    const target = this.getSessionPath(sessionId);
    const content = await readFile(target, 'utf8');
    return JSON.parse(content);
  }

  async appendSessionTranscript(sessionId, entry) {
    const target = this.getSessionTranscriptPath(sessionId);
    await appendFile(target, `${JSON.stringify(entry)}\n`, 'utf8');
    return target;
  }

  async loadSessionTranscript(sessionId) {
    const content = await readFile(this.getSessionTranscriptPath(sessionId), 'utf8').catch(() => '');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  async listSessions() {
    const files = await readdir(this.sessionDir).catch(() => []);
    return files
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        id: file.replace(/\.json$/, ''),
        path: path.join(this.sessionDir, file),
      }));
  }

  async saveRuntimeSnapshot(snapshot) {
    await writeFile(this.runtimePath, JSON.stringify(snapshot, null, 2), 'utf8');
    return this.runtimePath;
  }

  async loadRuntimeSnapshot() {
    const content = await readFile(this.runtimePath, 'utf8');
    return JSON.parse(content);
  }

  async saveAgentSession(agentId, session) {
    const root = this.getAgentRoot(agentId);
    await mkdir(root, { recursive: true });
    const target = this.getAgentSessionPath(agentId);
    await writeFile(target, JSON.stringify(session, null, 2), 'utf8');
    return target;
  }

  async loadAgentSession(agentId) {
    const target = this.getAgentSessionPath(agentId);
    const content = await readFile(target, 'utf8');
    return JSON.parse(content);
  }

  async saveAgentState(agentId, state) {
    const root = this.getAgentRoot(agentId);
    await mkdir(root, { recursive: true });
    const target = this.getAgentStatePath(agentId);
    await writeFile(target, JSON.stringify(state, null, 2), 'utf8');
    return target;
  }

  async loadAgentState(agentId) {
    const target = this.getAgentStatePath(agentId);
    const content = await readFile(target, 'utf8');
    return JSON.parse(content);
  }

  async appendAgentTranscript(agentId, entry) {
    const root = this.getAgentRoot(agentId);
    await mkdir(root, { recursive: true });
    await appendFile(this.getAgentTranscriptPath(agentId), `${JSON.stringify(entry)}\n`, 'utf8');
    return this.getAgentTranscriptPath(agentId);
  }

  async saveAgentWorker(agentId, worker) {
    const root = this.getAgentRoot(agentId);
    await mkdir(root, { recursive: true });
    const target = this.getAgentWorkerPath(agentId);
    await writeFile(target, JSON.stringify(worker, null, 2), 'utf8');
    return target;
  }

  async loadAgentWorker(agentId) {
    const target = this.getAgentWorkerPath(agentId);
    const content = await readFile(target, 'utf8');
    return JSON.parse(content);
  }

  async saveTodos(todos) {
    await writeFile(this.todosPath, JSON.stringify(todos, null, 2), 'utf8');
    return this.todosPath;
  }

  async loadTodos() {
    return loadJsonFile(this.todosPath, []);
  }

  async loadAuthProfiles() {
    return loadJsonFile(this.authProfilesPath, {});
  }

  async saveAuthProfile(provider, profile) {
    const current = await this.loadAuthProfiles();
    current[provider] = {
      ...(current[provider] ?? {}),
      ...profile,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(this.authProfilesPath, JSON.stringify(current, null, 2), 'utf8');
    return current[provider];
  }

  async removeAuthProfile(provider) {
    const current = await this.loadAuthProfiles();
    delete current[provider];
    await writeFile(this.authProfilesPath, JSON.stringify(current, null, 2), 'utf8');
    return current;
  }

  async loadCrons() {
    return loadJsonFile(this.cronsPath, []);
  }

  async saveCrons(crons) {
    await writeFile(this.cronsPath, JSON.stringify(crons, null, 2), 'utf8');
    return this.cronsPath;
  }

  async loadManagedSettings() {
    return loadJsonFile(this.managedSettingsPath, {
      settings: {},
      updatedAt: null,
      source: null,
    });
  }

  async saveManagedSettings(settings) {
    const payload = {
      settings: settings?.settings ?? settings ?? {},
      updatedAt: settings?.updatedAt ?? new Date().toISOString(),
      source: settings?.source ?? null,
    };
    await writeFile(this.managedSettingsPath, JSON.stringify(payload, null, 2), 'utf8');
    return this.managedSettingsPath;
  }

  async loadTrustedPlugins() {
    return loadJsonFile(this.trustedPluginsPath, []);
  }

  async saveTrustedPlugins(entries) {
    await writeFile(this.trustedPluginsPath, JSON.stringify(entries ?? [], null, 2), 'utf8');
    return this.trustedPluginsPath;
  }

  async loadSwarmSessions() {
    return loadJsonFile(this.swarmSessionsPath, []);
  }

  async saveSwarmSessions(entries) {
    await writeFile(this.swarmSessionsPath, JSON.stringify(entries ?? [], null, 2), 'utf8');
    return this.swarmSessionsPath;
  }

  async loadDreamState() {
    return loadJsonFile(this.dreamStatePath, {
      running: false,
      intervalMs: null,
      ticks: 0,
      lastRunAt: null,
      lastError: null,
      lastTranscriptCount: 0,
      lastEntries: [],
    });
  }

  async saveDreamState(state) {
    await writeFile(this.dreamStatePath, JSON.stringify(state ?? {}, null, 2), 'utf8');
    return this.dreamStatePath;
  }
}
