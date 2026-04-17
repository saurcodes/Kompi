import { exportAll, insertRecord } from "./store.js";
import type { TokenRecord } from "./models.js";

export interface SyncBackend {
  push(records: TokenRecord[]): Promise<void>;
  pull(): Promise<TokenRecord[]>;
}

// ─── Runtime record validation ────────────────────────────────────────────────

function isValidRecord(r: unknown): r is TokenRecord {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Record<string, unknown>;
  return (
    typeof rec.id === "string" && rec.id.length > 0 &&
    typeof rec.device_id === "string" &&
    typeof rec.device_label === "string" &&
    typeof rec.session_id === "string" &&
    typeof rec.timestamp === "string" &&
    typeof rec.model === "string" &&
    typeof rec.input_tokens === "number" &&
    typeof rec.output_tokens === "number" &&
    typeof rec.cache_read_tokens === "number" &&
    typeof rec.cache_write_tokens === "number" &&
    typeof rec.cost_usd === "number" &&
    typeof rec.project === "string" &&
    (rec.event_type === "post-tool" || rec.event_type === "stop")
  );
}

function parseRecords(raw: unknown): TokenRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidRecord);
}

// ─── S3 / Cloudflare R2 (S3-compatible) ──────────────────────────────────────

export function createS3Backend(config: {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  deviceId: string;
}): SyncBackend {
  const key = `devices/${config.deviceId}/records.json`;

  async function getS3Client() {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: !!config.endpoint,
    });
  }

  return {
    async push(records) {
      const client = await getS3Client();
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: JSON.stringify(records),
          ContentType: "application/json",
        })
      );
    },
    async pull() {
      const client = await getS3Client();
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key })
        );
        const body = await res.Body?.transformToString();
        if (!body) return [];
        return parseRecords(JSON.parse(body));
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "NoSuchKey") return [];
        throw e;
      }
    },
  };
}

// ─── Firebase Firestore ───────────────────────────────────────────────────────

export function createFirestoreBackend(config: {
  projectId: string;
  apiKey: string;
  deviceId: string;
}): SyncBackend {
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
  const collectionPath = `devices/${encodeURIComponent(config.deviceId)}/records`;
  // API key goes in Authorization header, not URL
  const authHeaders = {
    "Content-Type": "application/json",
    "x-goog-api-key": config.apiKey,
  };

  return {
    async push(records) {
      for (const record of records) {
        const url = `${baseUrl}/${collectionPath}/${encodeURIComponent(record.id)}`;
        const fields = Object.fromEntries(
          Object.entries(record).map(([k, v]) => [
            k,
            typeof v === "number"
              ? { doubleValue: v }
              : { stringValue: String(v ?? "") },
          ])
        );
        const res = await fetch(url, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ fields }),
        });
        if (!res.ok) throw new Error(`Firestore push failed for ${record.id}: ${res.status}`);
      }
    },
    async pull() {
      const url = `${baseUrl}/${collectionPath}`;
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        documents?: Array<{ fields: Record<string, { stringValue?: string; doubleValue?: number }> }>
      };
      const raw = (data.documents ?? []).map((doc) => {
        const f = doc.fields;
        return Object.fromEntries(
          Object.entries(f).map(([k, v]) => [k, v.doubleValue ?? v.stringValue ?? ""])
        );
      });
      return parseRecords(raw);
    },
  };
}

// ─── Sync orchestration ───────────────────────────────────────────────────────

export async function syncToRemote(backend: SyncBackend): Promise<{ pushed: number }> {
  const records = exportAll();
  await backend.push(records);
  return { pushed: records.length };
}

export async function syncFromRemote(backend: SyncBackend): Promise<{ pulled: number; merged: number }> {
  const remote = await backend.pull();
  let merged = 0;
  for (const record of remote) {
    try {
      insertRecord(record);
      merged++;
    } catch {
      // duplicate — already exists
    }
  }
  return { pulled: remote.length, merged };
}

// ─── Cloudflare D1 via Worker API ────────────────────────────────────────────

export function createD1Backend(config: {
  workerUrl: string;
  apiKey: string;
  deviceId: string;
}): SyncBackend {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  return {
    async push(records) {
      const res = await fetch(`${config.workerUrl}/records`, {
        method: "POST",
        headers,
        body: JSON.stringify(records),
      });
      if (!res.ok) throw new Error(`D1 push failed: ${res.status} ${await res.text()}`);
    },
    async pull() {
      const res = await fetch(
        `${config.workerUrl}/records?device_id=${encodeURIComponent(config.deviceId)}&limit=500`,
        { headers }
      );
      if (!res.ok) throw new Error(`D1 pull failed: ${res.status}`);
      return parseRecords(await res.json());
    },
  };
}

// ─── Backend factory ──────────────────────────────────────────────────────────

function assertHttps(url: string, varName: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error(`${varName} must use HTTPS (got: ${parsed.protocol})`);
    }
  } catch (e) {
    if (e instanceof TypeError) throw new Error(`${varName} is not a valid URL`);
    throw e;
  }
}

export function backendFromEnv(deviceId: string): SyncBackend | null {
  const d1Url = process.env.KOMPI_D1_URL;
  const d1Key = process.env.KOMPI_D1_KEY;
  const syncUrl = process.env.KOMPI_SYNC_URL;
  const syncKey = process.env.KOMPI_SYNC_KEY;
  const syncSecret = process.env.KOMPI_SYNC_SECRET;
  const syncBucket = process.env.KOMPI_SYNC_BUCKET;
  const syncRegion = process.env.KOMPI_SYNC_REGION ?? "auto";
  const firebaseProject = process.env.KOMPI_FIREBASE_PROJECT;
  const firebaseKey = process.env.KOMPI_FIREBASE_KEY;

  if (d1Url && d1Key) {
    assertHttps(d1Url, "KOMPI_D1_URL");
    return createD1Backend({ workerUrl: d1Url, apiKey: d1Key, deviceId });
  }

  if (firebaseProject && firebaseKey) {
    return createFirestoreBackend({ projectId: firebaseProject, apiKey: firebaseKey, deviceId });
  }

  if (syncBucket && syncKey && syncSecret) {
    if (syncUrl) assertHttps(syncUrl, "KOMPI_SYNC_URL");
    return createS3Backend({
      bucket: syncBucket,
      region: syncRegion,
      endpoint: syncUrl,
      accessKeyId: syncKey,
      secretAccessKey: syncSecret,
      deviceId,
    });
  }

  return null;
}
