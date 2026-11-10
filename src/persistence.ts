/**
 * Lightweight file-based persistence for ChannelSwarm demo state.
 * Optional — enable with PERSISTENCE=true (default on for simulation).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), "data");

export function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadJson<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson(filename: string, data: unknown) {
  ensureDataDir();
  const path = join(DATA_DIR, filename);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export function isPersistenceEnabled(): boolean {
  const flag = process.env.PERSISTENCE;
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  // Default: enabled in simulation, disabled in on-chain mode (safer)
  return process.env.ONCHAIN !== "true";
}
