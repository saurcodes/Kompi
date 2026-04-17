import { exportAll, insertRecord } from "./store.js";
import type { TokenRecord } from "./models.js";

export interface SyncBackend {
  push(records: TokenRecord[]): Promise<void>;
  pull(): Promise<TokenRecord[]>;
}

// ─── S3 / Cloudflare R2 (S3-compatible) ──────────────────────────────────────

export function createS3Backend(config: {
  bucket: string;
  region: string;
  endpoint?: string;      // set for R2: https://<account>.r2.cloudflarestorage.com
  accessKeyId: string;
  secretAccessKey: string;
  deviceId: string;
}): SyncBackend {
  const key = `devices/${config.deviceId}/records.json`;

  async function getS3Client() {
    const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
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
        return body ? (JSON.parse(body) as TokenRecord[]) : [];
      } catch (e: unknown) {
        if ((e as { name?: string }).name === "NoSuchKey") return [];
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
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents`;
  const collectionPath = `devices/${config.deviceId}/records`;

  return {
    async push(records) {
      for (const record of records) {
        const url = `${baseUrl}/${collectionPath}/${record.id}?key=${config.apiKey}`;
        const fields = Object.fromEntries(
          Object.entries(record).map(([k, v]) => [
            k,
            typeof v === "number"
              ? { doubleValue: v }
              : { stringValue: String(v ?? "") },
          ])
        );
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
        });
      }
    },
    async pull() {
      const url = `${baseUrl}/${collectionPath}?key=${config.apiKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = (await res.json()) as { documents?: Array<{ fields: Record<string, { stringValue?: string; doubleValue?: number }> }> };
      return (data.documents ?? []).map((doc) => {
        const f = doc.fields;
        return Object.fromEntries(
          Object.entries(f).map(([k, v]) => [k, v.doubleValue ?? v.stringValue ?? ""])
        ) as unknown as TokenRecord;
      });
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
  workerUrl: string;  // e.g. https://kompi.<sub>.workers.dev
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
        `${config.workerUrl}/records?device_id=${config.deviceId}&limit=500`,
        { headers }
      );
      if (!res.ok) throw new Error(`D1 pull failed: ${res.status}`);
      return (await res.json()) as TokenRecord[];
    },
  };
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

  // Cloudflare D1 takes priority when configured
  if (d1Url && d1Key) {
    return createD1Backend({ workerUrl: d1Url, apiKey: d1Key, deviceId });
  }

  if (firebaseProject && firebaseKey) {
    return createFirestoreBackend({ projectId: firebaseProject, apiKey: firebaseKey, deviceId });
  }

  if (syncBucket && syncKey && syncSecret) {
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
