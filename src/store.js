// Frani Channel Pass — single-file state persistence.
// The channel state (members + posts) lives in one JSON file, loaded on start
// and saved after each mutation. Simple and easy to inspect/back up.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { newState } from './channel.js';

export class ChannelStore {
  constructor(file, { channelName, network }) {
    this.file = file;
    this.meta = { channelName, network };
    this.state = null;
  }

  async load() {
    if (existsSync(this.file)) {
      this.state = JSON.parse(await readFile(this.file, 'utf8'));
    } else {
      this.state = newState(this.meta);
      await this.save();
    }
    return this.state;
  }

  async save() {
    const dir = path.dirname(this.file);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.file, JSON.stringify(this.state, null, 2), 'utf8');
  }
}
