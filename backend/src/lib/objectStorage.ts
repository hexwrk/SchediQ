import type { S3Client } from "@aws-sdk/client-s3";
import { env, storageConfigured } from "./env";

// S3-compatible object storage for off-site backups (Cloudflare R2, Backblaze
// B2, AWS S3, MinIO). Auth is a static access key pair from the environment:
// no OAuth flow, nothing minted in a browser. Give the key access to the
// backup bucket only (R2 "Object Read & Write" on one bucket, a B2 application
// key restricted to one bucket), so a leaked key exposes the backups and
// nothing else in the account.

export const BACKUP_PREFIX = "backups/";
// Presigned download links live for an hour: long enough to click from the
// System page, short enough that a link pasted somewhere stops working.
export const PRESIGN_TTL_SECONDS = 60 * 60;

// Per-request ceiling. An upload of a student-scale dump takes seconds; this
// only stops a stalled connection from holding the admin's request forever.
const TIMEOUT_MS = 60_000;

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Cloud backup is not configured. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }
}

// A storage failure with a message that is safe to show the admin. The raw
// SDK error is never surfaced: it can carry the request, including the
// signed Authorization header.
export class StorageError extends Error {}

export interface StorageUpload {
  key: string;
  bucket: string;
  downloadUrl: string;
  expiresAt: Date;
}

let clientCache: S3Client | null = null;

// The SDK is large; load it only when a backup actually runs so API boot time
// and the unit tests are unaffected.
async function storageClient(): Promise<S3Client> {
  if (!storageConfigured()) throw new StorageNotConfiguredError();
  if (clientCache) return clientCache;
  const e = env();
  const { S3Client } = await import("@aws-sdk/client-s3");
  clientCache = new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    // R2, B2 and MinIO address buckets by path (endpoint/bucket/key); the
    // virtual-host style AWS default would need per-bucket DNS they lack.
    forcePathStyle: true,
    // SDK >= 3.729 adds CRC32 checksum headers to every upload by default;
    // several S3-compatible providers (older MinIO, some B2/R2 paths) reject
    // them. Only send checksums when the operation requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
    // Standard mode retries throttling, 5xx and network errors with backoff.
    maxAttempts: 3,
    requestHandler: { requestTimeout: TIMEOUT_MS, connectionTimeout: 10_000 },
  });
  return clientCache;
}

// Upload one object under backups/ and return its key plus a presigned GET
// URL. Throws StorageNotConfiguredError or StorageError (safe message).
export async function uploadBackupObject(file: {
  name: string;
  contentType: string;
  data: Buffer;
  metadata?: Record<string, string>;
}): Promise<StorageUpload> {
  const client = await storageClient();
  const bucket = env().S3_BUCKET!;
  const key = `${BACKUP_PREFIX}${file.name}`;
  try {
    const [{ GetObjectCommand }, { Upload }, { getSignedUrl }] = await Promise.all([
      import("@aws-sdk/client-s3"),
      import("@aws-sdk/lib-storage"),
      import("@aws-sdk/s3-request-presigner"),
    ]);
    // lib-storage switches to multipart above 5 MB, so a larger dump does not
    // hit single-PUT limits; the body is streamed from memory, never disk.
    await new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: file.data,
        ContentType: file.contentType,
        // Download name for the presigned link, so the browser saves the file
        // with the .sql.gz / .json.gz name restore expects.
        ContentDisposition: `attachment; filename="${file.name}"`,
        Metadata: file.metadata,
      },
    }).done();
    const downloadUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: PRESIGN_TTL_SECONDS,
    });
    return { key, bucket, downloadUrl, expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000) };
  } catch (err) {
    logStorageFailure("upload", err);
    throw new StorageError(storageErrorMessage(err));
  }
}

// What went wrong, in terms the admin can act on, without echoing anything
// from the request.
export function storageErrorMessage(err: unknown): string {
  const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
  const name = e?.name ?? e?.code;
  const status = e?.$metadata?.httpStatusCode;
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch" || status === 401) {
    return "The storage provider rejected the access key. Check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.";
  }
  if (name === "NoSuchBucket") return "The bucket does not exist. Check S3_BUCKET (and S3_ENDPOINT for the right account).";
  if (name === "AccessDenied" || status === 403) {
    return "The storage provider refused the upload (403). Give the key write access to this bucket.";
  }
  if (name === "ENOTFOUND" || name === "ECONNREFUSED") return "Could not reach S3_ENDPOINT. Check the URL.";
  if (name === "TimeoutError" || status === 429 || (status !== undefined && status >= 500)) {
    return "The storage provider is unavailable right now. Try again in a few minutes.";
  }
  return "Upload to cloud storage failed. Check the API log for details.";
}

// Patterns that could appear in an SDK error message. Belt and braces:
// logStorageFailure never prints the request or headers, only the message.
const SECRET_PATTERNS = [
  /AWS4-HMAC-SHA256\s+Credential=\S+/g,
  /Signature=[0-9a-f]+/gi,
  /X-Amz-Credential=[^&\s]+/gi,
  /X-Amz-Signature=[^&\s]+/gi,
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
];

export function logStorageFailure(context: string, err: unknown): void {
  const e = err as { name?: string; code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  const parts = [
    e?.$metadata?.httpStatusCode ? `status=${e.$metadata.httpStatusCode}` : null,
    e?.name ? `name=${e.name}` : null,
    e?.code ? `code=${e.code}` : null,
  ].filter(Boolean);
  let message = (e?.message ?? String(err)).slice(0, 200);
  for (const p of SECRET_PATTERNS) message = message.replace(p, "[redacted]");
  // The configured secret itself, in case a provider echoes it verbatim.
  const secret = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (secret) message = message.split(secret).join("[redacted]");
  console.error(`[storage] ${context} failed: ${parts.join(" ")}: ${message}`);
}
