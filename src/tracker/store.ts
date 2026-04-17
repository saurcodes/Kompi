import Database from "better-sqlite3";
import { createHash } from "crypto";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import type { TokenRecord, DeviceSummary } from "./models.js";

function dbPath(): string {
  return process.env.KOMPI_DB_PATH ?? join(homedir(), ".kompi", "kompi.db");
}

function ensureDir(filePath: string) {
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  const path = dbPath();
  ensureDir(path);
  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS token_records (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      device_label TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      project TEXT NOT NULL DEFAULT '',
      tool_name TEXT,
      event_type TEXT NOT NULL DEFAULT 'stop'
    );
    CREATE INDEX IF NOT EXISTS idx_device ON token_records(device_id);
    CREATE INDEX IF NOT EXISTS idx_session ON token_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON token_records(timestamp);
  `);
}

export function insertRecord(record: TokenRecord): void {
  const stmt = db().prepare(`
    INSERT OR REPLACE INTO token_records
      (id, device_id, device_label, session_id, timestamp, model,
       input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
       cost_usd, project, tool_name, event_type)
    VALUES
      (@id, @device_id, @device_label, @session_id, @timestamp, @model,
       @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
       @cost_usd, @project, @tool_name, @event_type)
  `);
  stmt.run(record);
}

export function getDeviceSummaries(): DeviceSummary[] {
  return db().prepare(`
    SELECT
      device_id,
      device_label,
      COUNT(DISTINCT session_id)           AS total_sessions,
      SUM(input_tokens)                    AS total_input_tokens,
      SUM(output_tokens)                   AS total_output_tokens,
      SUM(cache_read_tokens)               AS total_cache_read_tokens,
      SUM(cache_write_tokens)              AS total_cache_write_tokens,
      ROUND(SUM(cost_usd), 6)             AS total_cost_usd,
      ROUND(SUM(input_tokens + output_tokens) * 1.0 /
            NULLIF(COUNT(DISTINCT session_id), 0), 0) AS avg_tokens_per_session,
      MAX(timestamp)                       AS last_seen
    FROM token_records
    GROUP BY device_id
    ORDER BY total_cost_usd DESC
  `).all() as DeviceSummary[];
}

export function getTopModel(deviceId: string): string {
  const row = db().prepare(`
    SELECT model, COUNT(*) AS cnt
    FROM token_records
    WHERE device_id = ?
    GROUP BY model
    ORDER BY cnt DESC
    LIMIT 1
  `).get(deviceId) as { model: string } | undefined;
  return row?.model ?? "unknown";
}

export function getRecentRecords(deviceId: string, limit = 50): TokenRecord[] {
  return db().prepare(`
    SELECT * FROM token_records
    WHERE device_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(deviceId, limit) as TokenRecord[];
}

export function getSessionCount(deviceId: string): number {
  const row = db().prepare(`
    SELECT COUNT(DISTINCT session_id) AS cnt FROM token_records WHERE device_id = ?
  `).get(deviceId) as { cnt: number };
  return row.cnt;
}

export function exportAll(): TokenRecord[] {
  return db().prepare("SELECT * FROM token_records ORDER BY timestamp DESC").all() as TokenRecord[];
}

export function makeDeviceId(hostname: string, platform: string): string {
  return createHash("sha256").update(`${hostname}:${platform}`).digest("hex").slice(0, 16);
}
