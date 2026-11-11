import "server-only";

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Redis } from "@upstash/redis";
import type { Booking, ScheduleBlock, Task } from "./types";

interface GoogleTokens {
  refreshToken: string;
  connectedAt: string;
}

interface Collections {
  blocks: ScheduleBlock[];
  bookings: Booking[];
  tasks: Task[];
  google: GoogleTokens | null;
}

type Key = keyof Collections;

const PREFIX = "zx:";

const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

export const storageMode: "redis" | "memory" = redis ? "redis" : "memory";

const defaults: Collections = { blocks: [], bookings: [], tasks: [], google: null };

// Without Redis we keep data in memory and mirror it to a temp file so `next dev`
// hot reloads don't wipe the schedule. On Vercel this is per-instance only.
const globalForStore = globalThis as unknown as { __zxMemory?: Partial<Collections> };
if (!globalForStore.__zxMemory) globalForStore.__zxMemory = {};
const memory = globalForStore.__zxMemory;
const dataFile =
  process.env.NODE_ENV === "production"
    ? path.join(os.tmpdir(), "zx-calendar.json")
    : path.join(process.cwd(), ".data", "zx-calendar.json");
let hydrated = false;

async function hydrateMemory() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await fs.readFile(dataFile, "utf8");
    Object.assign(memory, JSON.parse(raw));
  } catch {
    // First run — nothing persisted yet.
  }
}

async function persistMemory() {
  try {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(memory));
  } catch {
    // Read-only filesystems are fine; data simply stays in memory.
  }
}

export async function read<K extends Key>(key: K): Promise<Collections[K]> {
  if (redis) {
    const value = await redis.get<Collections[K]>(PREFIX + key);
    return value ?? structuredClone(defaults[key]);
  }
  await hydrateMemory();
  return structuredClone((memory[key] as Collections[K] | undefined) ?? defaults[key]);
}

export async function write<K extends Key>(key: K, value: Collections[K]): Promise<void> {
  if (redis) {
    await redis.set(PREFIX + key, value);
    return;
  }
  await hydrateMemory();
  memory[key] = structuredClone(value);
  await persistMemory();
}

/** Read-modify-write helper. Returns whatever the mutator returns. */
export async function update<K extends Key, R>(
  key: K,
  mutate: (current: Collections[K]) => { next: Collections[K]; result: R }
): Promise<R> {
  const current = await read(key);
  const { next, result } = mutate(current);
  await write(key, next);
  return result;
}

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

/** Increments a short-lived counter (rate limiting). Returns the new count. */
export async function bumpCounter(key: string, ttlSeconds: number): Promise<number> {
  const fullKey = `${PREFIX}counter:${key}`;
  if (redis) {
    const count = await redis.incr(fullKey);
    if (count === 1) await redis.expire(fullKey, ttlSeconds);
    return count;
  }
  const now = Date.now();
  const current = memoryCounters.get(fullKey);
  const next =
    current && current.expiresAt > now
      ? { count: current.count + 1, expiresAt: current.expiresAt }
      : { count: 1, expiresAt: now + ttlSeconds * 1000 };
  memoryCounters.set(fullKey, next);
  return next.count;
}

export async function peekCounter(key: string): Promise<number> {
  const fullKey = `${PREFIX}counter:${key}`;
  if (redis) return (await redis.get<number>(fullKey)) ?? 0;
  const current = memoryCounters.get(fullKey);
  return current && current.expiresAt > Date.now() ? current.count : 0;
}

export async function clearCounter(key: string): Promise<void> {
  const fullKey = `${PREFIX}counter:${key}`;
  if (redis) await redis.del(fullKey);
  else memoryCounters.delete(fullKey);
}
