/**
 * Trace persistence helpers for the agent loop debugger.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DebuggerEvent } from "./events.ts";

const DEFAULT_TRACE_DIR = join(homedir(), ".pi", "agent", "agent-loop-debugger", "traces");

export interface TraceInfo {
  filename: string;
  createdAt: number;
  eventCount: number;
}

export function getDefaultTraceDir(): string {
  return DEFAULT_TRACE_DIR;
}

export function makeTraceFilename(timestamp = Date.now()): string {
  const ts = new Date(timestamp).toISOString().replace(/[:.]/g, "-");
  return `agent-loop-${ts}.json`;
}

export async function ensureTraceDir(dir: string = DEFAULT_TRACE_DIR): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function saveTrace(
  events: DebuggerEvent[],
  dir: string = DEFAULT_TRACE_DIR,
  timestamp = Date.now(),
): Promise<string> {
  await ensureTraceDir(dir);
  const filename = makeTraceFilename(timestamp);
  const filepath = join(dir, filename);
  await writeFile(filepath, JSON.stringify(events, null, 2), "utf-8");
  return filepath;
}

export async function listTraces(dir: string = DEFAULT_TRACE_DIR): Promise<TraceInfo[]> {
  await ensureTraceDir(dir);
  const entries = await readdir(dir, { withFileTypes: true });
  const traces: TraceInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filepath = join(dir, entry.name);
    try {
      const content = await readFile(filepath, "utf-8");
      const data = JSON.parse(content);
      const eventCount = Array.isArray(data) ? data.length : 0;
      const stat = await (await import("node:fs/promises")).stat(filepath);
      traces.push({ filename: entry.name, createdAt: stat.mtimeMs, eventCount });
    } catch {
      // Skip corrupt or unreadable trace files.
      continue;
    }
  }

  traces.sort((a, b) => b.createdAt - a.createdAt);
  return traces;
}

export async function loadTrace(filepath: string): Promise<DebuggerEvent[]> {
  const content = await readFile(filepath, "utf-8");
  const data = JSON.parse(content);
  if (!Array.isArray(data)) {
    throw new Error("Trace file is not a JSON array");
  }
  return data as DebuggerEvent[];
}
