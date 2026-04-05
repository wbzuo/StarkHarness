import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class StateStore {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.sessionDir = path.join(rootDir, 'sessions');
    this.runtimePath = path.join(rootDir, 'runtime.json');
    this.agentDir = path.join(rootDir, 'agents');
  }

  async init() {
    await mkdir(this.sessionDir, { recursive: true });
    await mkdir(this.agentDir, { recursive: true });
    return this;
  }

  getSessionPath(sessionId) {
    return path.join(this.sessionDir, `${sessionId}.json`);
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
}
