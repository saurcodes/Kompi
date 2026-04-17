export interface Env {
  DB: D1Database;
  KOMPI_API_KEY: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_RECORDS_PER_PUSH = 10_000;
const MAX_LIMIT = 1_000;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function badRequest(msg: string): Response {
  return json({ error: msg }, 400);
}

function authorized(req: Request, env: Env): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  return auth === `Bearer ${env.KOMPI_API_KEY}`;
}

// ─── Runtime record validation ────────────────────────────────────────────────

interface ValidRecord {
  id: string;
  device_id: string;
  device_label: string;
  session_id: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  project: string;
  tool_name: string | null;
  event_type: string;
}

function validateRecord(r: unknown): ValidRecord | null {
  if (typeof r !== "object" || r === null) return null;
  const rec = r as Record<string, unknown>;

  const id = typeof rec.id === "string" && rec.id.length > 0 ? rec.id : null;
  const device_id = typeof rec.device_id === "string" ? rec.device_id : null;
  const device_label = typeof rec.device_label === "string" ? rec.device_label : null;
  const session_id = typeof rec.session_id === "string" ? rec.session_id : null;
  const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
  const model = typeof rec.model === "string" ? rec.model : null;
  const input_tokens = typeof rec.input_tokens === "number" ? rec.input_tokens : null;
  const output_tokens = typeof rec.output_tokens === "number" ? rec.output_tokens : null;
  const cache_read_tokens = typeof rec.cache_read_tokens === "number" ? rec.cache_read_tokens : null;
  const cache_write_tokens = typeof rec.cache_write_tokens === "number" ? rec.cache_write_tokens : null;
  const cost_usd = typeof rec.cost_usd === "number" ? rec.cost_usd : null;
  const project = typeof rec.project === "string" ? rec.project : null;

  if (!id || !device_id || !device_label || !session_id || !timestamp || !model ||
      input_tokens === null || output_tokens === null || cache_read_tokens === null ||
      cache_write_tokens === null || cost_usd === null || project === null) {
    return null;
  }

  return {
    id,
    device_id,
    device_label,
    session_id,
    timestamp,
    model,
    input_tokens,
    output_tokens,
    cache_read_tokens,
    cache_write_tokens,
    cost_usd,
    project,
    tool_name: typeof rec.tool_name === "string" ? rec.tool_name : null,
    event_type: typeof rec.event_type === "string" ? rec.event_type : "stop",
  };
}

async function migrate(db: D1Database): Promise<void> {
  await db.exec(`
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    if (url.pathname === "/health") {
      return json({ ok: true });
    }

    if (!authorized(req, env)) return unauthorized();

    // POST /records — bulk upsert records from a device
    if (req.method === "POST" && url.pathname === "/records") {
      const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return badRequest(`Payload too large (max ${MAX_PAYLOAD_BYTES / 1024 / 1024} MB)`);
      }

      await migrate(env.DB);
      const body = await req.json() as unknown;
      if (!Array.isArray(body)) return badRequest("Request body must be a JSON array");
      if (body.length > MAX_RECORDS_PER_PUSH) {
        return badRequest(`Too many records (max ${MAX_RECORDS_PER_PUSH} per push)`);
      }

      const valid: ValidRecord[] = [];
      for (const item of body) {
        const rec = validateRecord(item);
        if (rec) valid.push(rec);
      }

      if (valid.length === 0) return json({ inserted: 0, skipped: body.length });

      const stmt = env.DB.prepare(`
        INSERT OR REPLACE INTO token_records
          (id, device_id, device_label, session_id, timestamp, model,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
           cost_usd, project, tool_name, event_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const batch = valid.map((r) =>
        stmt.bind(
          r.id, r.device_id, r.device_label, r.session_id, r.timestamp, r.model,
          r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens,
          r.cost_usd, r.project, r.tool_name, r.event_type
        )
      );
      await env.DB.batch(batch);
      return json({ inserted: valid.length, skipped: body.length - valid.length });
    }

    // GET /records?device_id=xxx&limit=50
    if (req.method === "GET" && url.pathname === "/records") {
      await migrate(env.DB);
      const deviceId = url.searchParams.get("device_id");
      const rawLimit = parseInt(url.searchParams.get("limit") ?? "100", 10);
      const limit = isNaN(rawLimit) || rawLimit < 1 ? 100 : Math.min(rawLimit, MAX_LIMIT);

      const result = deviceId
        ? await env.DB.prepare(
            "SELECT * FROM token_records WHERE device_id = ? ORDER BY timestamp DESC LIMIT ?"
          ).bind(deviceId, limit).all()
        : await env.DB.prepare(
            "SELECT * FROM token_records ORDER BY timestamp DESC LIMIT ?"
          ).bind(limit).all();
      return json(result.results);
    }

    // GET /summaries — per-device aggregates
    if (req.method === "GET" && url.pathname === "/summaries") {
      await migrate(env.DB);
      const result = await env.DB.prepare(`
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
      `).all();
      return json(result.results);
    }

    // GET /report?device_id=xxx — advisor tips
    if (req.method === "GET" && url.pathname === "/report") {
      await migrate(env.DB);
      const deviceId = url.searchParams.get("device_id");
      if (!deviceId) return badRequest("device_id required");

      const records = (
        await env.DB.prepare(
          "SELECT * FROM token_records WHERE device_id = ? ORDER BY timestamp DESC LIMIT 50"
        ).bind(deviceId).all()
      ).results as Record<string, number | string>[];

      const tips: string[] = [];

      const avgInput = records.reduce((s, r) => s + (Number(r.input_tokens) || 0), 0) / (records.length || 1);
      const cacheTotal = records.reduce((s, r) => s + (Number(r.cache_read_tokens) || 0), 0);
      const inputTotal = records.reduce((s, r) => s + (Number(r.input_tokens) || 0), 0);
      if (avgInput > 2000 && cacheTotal / (inputTotal || 1) < 0.1) {
        tips.push("enable_prompt_caching");
      }

      const opusRecords = records.filter((r) => String(r.model).includes("opus"));
      if (opusRecords.length >= 3) {
        const avgOut = opusRecords.reduce((s, r) => s + (Number(r.output_tokens) || 0), 0) / opusRecords.length;
        if (avgOut < 500) tips.push("use_sonnet_for_complex");
      }

      return json({ device_id: deviceId, tips, record_count: records.length });
    }

    return json({ error: "Not found" }, 404);
  },
};
