import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('data');
const dataFile = path.join(dataDir, 'guilds.json');
let queue = Promise.resolve();

async function readAll() {
  await mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeAll(data) {
  const temporary = `${dataFile}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
  await rename(temporary, dataFile);
}

function emptyState() {
  return { setupComplete: false, roles: {}, channels: {}, warnings: {}, tickets: 0 };
}

export async function getGuildData(guildId) {
  const all = await readAll();
  return all[guildId] || emptyState();
}

export function updateGuildData(guildId, updater) {
  const task = queue.then(async () => {
    const all = await readAll();
    const next = await updater(all[guildId] || emptyState());
    all[guildId] = next;
    await writeAll(all);
    return next;
  });
  queue = task.catch(() => null);
  return task;
}

