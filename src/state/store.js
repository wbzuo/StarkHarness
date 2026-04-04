import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class StateStore {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.sessionDir = path.join(rootDir, 'sessions');
    this.runtimePath = path.join(rootDir, 'runtime.json');
  }

  async init() {
    await mkdir(this.sessionDir, { recursive: true });
    return this;
  }

  getSessionPath(sessionId) {
    return path.join(this.sessionDir, `${sessionId}.json`);
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
}
