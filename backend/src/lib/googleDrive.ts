import { Readable } from "stream";
import type { drive_v3 } from "googleapis";
import { driveConfigured, env } from "./env";

// Google Drive upload for off-site backups.
//
// Auth is a plain OAuth2 refresh token for ONE Google account (the admin's),
// minted once through the OAuth Playground (docs/GOOGLE_DRIVE_BACKUP.md). No
// redirect flow lives in the app. The scope is drive.file: the app can only
// see and change files it created itself, never the rest of that Drive, so a
// leaked refresh token exposes the backups, not the account's documents.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const DRIVE_FOLDER_NAME = "SchediQ Backups";
const FOLDER_MIME = "application/vnd.google-apps.folder";

// Per-request ceiling. An upload of a student-scale dump takes seconds; this
// only stops a stalled connection from holding the admin's request forever.
const TIMEOUT_MS = 60_000;

export class DriveNotConfiguredError extends Error {
  constructor() {
    super("Google Drive backup is not configured. Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN.");
  }
}

// A Drive failure with a message that is safe to show the admin. The raw
// error is never surfaced: gaxios errors carry the request config, which
// includes the Authorization header.
export class DriveError extends Error {}

export interface DriveUpload {
  id: string;
  name: string;
  webViewLink: string;
  folderId: string;
}

// googleapis is a large package; load it only when a Drive call actually runs
// so API boot time and the unit tests are unaffected.
async function driveClient(): Promise<drive_v3.Drive> {
  if (!driveConfigured()) throw new DriveNotConfiguredError();
  const e = env();
  const { google } = await import("googleapis");
  const auth = new google.auth.OAuth2(e.GOOGLE_DRIVE_CLIENT_ID, e.GOOGLE_DRIVE_CLIENT_SECRET);
  // Only the refresh token is stored; the library exchanges it for a
  // short-lived access token on the first call and refreshes as needed.
  auth.setCredentials({ refresh_token: e.GOOGLE_DRIVE_REFRESH_TOKEN, scope: DRIVE_SCOPE });
  // retry: gaxios retries 5xx/429/network errors with backoff, not 4xx.
  return google.drive({ version: "v3", auth, timeout: TIMEOUT_MS, retry: true });
}

// Resolved once per process. A folder deleted in Drive mid-run is caught by
// the upload failing, which clears the cache so the next attempt re-resolves.
let folderCache: string | null = null;

async function usableFolder(drive: drive_v3.Drive, id: string): Promise<boolean> {
  try {
    const { data } = await drive.files.get({ fileId: id, fields: "id,mimeType,trashed", supportsAllDrives: true });
    return data.mimeType === FOLDER_MIME && !data.trashed;
  } catch {
    // 404 is the normal answer for a folder made in the Drive UI: under
    // drive.file the app cannot see it. Fall back to the app's own folder.
    return false;
  }
}

async function resolveFolder(drive: drive_v3.Drive): Promise<string> {
  if (folderCache) return folderCache;
  const configured = env().GOOGLE_DRIVE_FOLDER_ID;
  if (configured && (await usableFolder(drive, configured))) {
    folderCache = configured;
    return configured;
  }
  if (configured) {
    console.warn(`[drive] GOOGLE_DRIVE_FOLDER_ID is not a folder this app can use; using "${DRIVE_FOLDER_NAME}" instead.`);
  }
  // drive.file only lists app-created files, so this finds the folder made on
  // an earlier run and never a same-named folder the user made by hand.
  const { data } = await drive.files.list({
    q: `name = '${DRIVE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id)",
    orderBy: "createdTime",
    pageSize: 1,
    spaces: "drive",
  });
  const existing = data.files?.[0]?.id;
  if (existing) {
    folderCache = existing;
    return existing;
  }
  const created = await drive.files.create({
    requestBody: { name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: "id",
  });
  if (!created.data.id) throw new DriveError("Google Drive did not return an id for the backup folder.");
  folderCache = created.data.id;
  return created.data.id;
}

// Upload one file into the backup folder; returns its id, name and the
// browser link. Throws DriveNotConfiguredError or DriveError (safe message).
export async function uploadToDrive(file: {
  name: string;
  mimeType: string;
  data: Buffer;
  description?: string;
}): Promise<DriveUpload> {
  const drive = await driveClient();
  try {
    const folderId = await resolveFolder(drive);
    const { data } = await drive.files.create({
      requestBody: { name: file.name, parents: [folderId], mimeType: file.mimeType, description: file.description },
      // Streamed from memory: the dump never touches the API host's disk.
      media: { mimeType: file.mimeType, body: Readable.from(file.data) },
      fields: "id,name,webViewLink",
      supportsAllDrives: true,
    });
    if (!data.id) throw new DriveError("Google Drive did not return an id for the uploaded file.");
    return {
      id: data.id,
      name: data.name ?? file.name,
      webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
      folderId,
    };
  } catch (err) {
    folderCache = null;
    if (err instanceof DriveError) throw err;
    logDriveFailure("upload", err);
    throw new DriveError(driveErrorMessage(err));
  }
}

// What went wrong, in terms the admin can act on, without echoing anything
// from the request.
export function driveErrorMessage(err: unknown): string {
  const e = err as { status?: number; response?: { status?: number; data?: { error?: unknown } } };
  const status = e?.status ?? e?.response?.status;
  const oauthError = e?.response?.data?.error;
  if (oauthError === "invalid_grant") {
    return "Google rejected the refresh token (expired or revoked). Generate a new GOOGLE_DRIVE_REFRESH_TOKEN; see the Drive setup guide.";
  }
  if (oauthError === "invalid_client" || oauthError === "unauthorized_client") {
    return "Google rejected the client ID or secret. Check GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.";
  }
  if (status === 403) return "Google Drive refused the upload (403). Check the Drive API is enabled and the drive.file scope was granted.";
  if (status === 404) return "The Drive backup folder no longer exists. Try again to recreate it.";
  if (status === 429 || (status !== undefined && status >= 500)) return "Google Drive is unavailable right now. Try again in a few minutes.";
  return "Upload to Google Drive failed. Check the API log for details.";
}

// Patterns that could appear in a library error message. Belt and braces:
// logDriveFailure never prints headers or config, only the message text.
const SECRET_PATTERNS = [/ya29\.[A-Za-z0-9_-]+/g, /1\/\/[A-Za-z0-9_-]+/g, /GOCSPX-[A-Za-z0-9_-]+/g, /Bearer\s+\S+/gi];

export function logDriveFailure(context: string, err: unknown): void {
  const e = err as { status?: number; code?: string | number; message?: string; response?: { status?: number; data?: { error?: unknown } } };
  const parts = [
    e?.status ?? e?.response?.status ? `status=${e?.status ?? e?.response?.status}` : null,
    e?.code ? `code=${e.code}` : null,
    typeof e?.response?.data?.error === "string" ? `oauth=${e.response.data.error}` : null,
  ].filter(Boolean);
  let message = (e?.message ?? String(err)).slice(0, 200);
  for (const p of SECRET_PATTERNS) message = message.replace(p, "[redacted]");
  console.error(`[drive] ${context} failed: ${parts.join(" ")}: ${message}`);
}
