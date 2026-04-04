import { mkdir, appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export class TelemetrySink {
  constructor({ rootDir }) {
    this.rootDir = rootDir;
    this.transcriptPath = path.join(rootDir, 'transcript.jsonl');
  }

  async init() {
    await mkdir(this.rootDir, { recursive: true });
    return this;
  }

  async emit(eventName, payload) {
    const event = {
      eventName,
      payload,
      recordedAt: new Date().toISOString(),
    };
    await appendFile(this.transcriptPath, JSON.stringify(event) + '\n', 'utf8');
    return event;
  }

  async replay() {
    const content = await readFile(this.transcriptPath, 'utf8').catch(() => '');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

export function createTelemetrySink(options = {}) {
  return new TelemetrySink(options);
}
