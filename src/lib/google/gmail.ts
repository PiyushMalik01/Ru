// ---------------------------------------------------------------------------
// Gmail REST client
// ---------------------------------------------------------------------------
// Thin fetch-based wrapper around Gmail v1. We deliberately avoid the
// googleapis SDK — its bundle size and CommonJS shape are awkward inside
// Next.js server components and Inngest functions. Everything here uses
// the `getAccessToken(userId)` helper which already handles refresh.
// ---------------------------------------------------------------------------

import { getAccessToken } from "./tokens";
import { createServiceClient } from "@/lib/supabase/service";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailHeader {
  name: string;
  value: string;
}

interface RawPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: RawPart[];
}

interface RawMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: RawPart;
}

export interface ParsedMessage {
  id: string;
  threadId: string | null;
  labelIds: string[];
  snippet: string;
  historyId: string | null;
  internalDate: string | null;
  headers: Record<string, string>;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  listUnsubscribe: string | null;
  body: string;
}

async function gfetch(userId: string, path: string): Promise<Response> {
  const token = await getAccessToken(userId);
  return fetch(`${GMAIL_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/**
 * List message IDs matching a Gmail search query. Pages through results up
 * to `maxResults` (default 100). Returns [] on 404/410 (e.g. user revoked
 * Gmail scope but didn't disconnect fully).
 */
export async function listMessageIds(
  userId: string,
  query: string = "is:unread newer_than:1d in:inbox",
  maxResults: number = 100,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, maxResults - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await gfetch(userId, `/messages?${params.toString()}`);
    if (res.status === 404 || res.status === 410) return ids;
    if (!res.ok) {
      throw new Error(`gmail list failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };
    for (const m of json.messages ?? []) ids.push(m.id);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return ids;
}

/**
 * Fetch a single message and return decoded headers + text body.
 * Returns null on 404/410 (deleted message).
 */
export async function getMessage(
  userId: string,
  messageId: string,
): Promise<ParsedMessage | null> {
  const res = await gfetch(userId, `/messages/${messageId}?format=full`);
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    throw new Error(`gmail get failed: ${res.status} ${await res.text()}`);
  }
  const raw = (await res.json()) as RawMessage;
  return parseMessage(raw);
}

function parseMessage(raw: RawMessage): ParsedMessage {
  const headers: Record<string, string> = {};
  for (const h of raw.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  const body = extractTextBody(raw.payload) ?? raw.snippet ?? "";
  return {
    id: raw.id,
    threadId: raw.threadId ?? null,
    labelIds: raw.labelIds ?? [],
    snippet: raw.snippet ?? "",
    historyId: raw.historyId ?? null,
    internalDate: raw.internalDate ?? null,
    headers,
    from: headers["from"] ?? null,
    to: headers["to"] ?? null,
    subject: headers["subject"] ?? null,
    date: headers["date"] ?? null,
    listUnsubscribe: headers["list-unsubscribe"] ?? null,
    body: body.slice(0, 8000),
  };
}

function decodeB64Url(data: string): string {
  // Gmail returns url-safe base64 with no padding
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  // Quick & dirty — strip <style>/<script> blocks, then tags, decode common entities.
  const noScripts = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noTags = noScripts.replace(/<[^>]+>/g, " ");
  return noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTextBody(part: RawPart | undefined): string | null {
  if (!part) return null;
  // Prefer text/plain when available; walk recursively.
  const plain = findByMime(part, "text/plain");
  if (plain && plain.body?.data) return decodeB64Url(plain.body.data);
  const html = findByMime(part, "text/html");
  if (html && html.body?.data) return stripHtml(decodeB64Url(html.body.data));
  // Last resort: top-level body
  if (part.body?.data) return decodeB64Url(part.body.data);
  return null;
}

function findByMime(part: RawPart, mime: string): RawPart | null {
  if (part.mimeType === mime && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findByMime(child, mime);
    if (hit) return hit;
  }
  return null;
}

/**
 * Capture the user's current Gmail historyId so subsequent runs can pull
 * incremental changes via listHistory. Persists to google_integrations.
 */
export async function startHistorySync(userId: string): Promise<string | null> {
  const res = await gfetch(userId, `/profile`);
  if (!res.ok) {
    if (res.status === 404 || res.status === 410) return null;
    throw new Error(`gmail profile failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { historyId?: string };
  if (!json.historyId) return null;

  const supabase = createServiceClient();
  await supabase
    .from("google_integrations")
    .update({
      gmail_history_id: json.historyId,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return json.historyId;
}

/**
 * List new message IDs since the given historyId. Returns the new message
 * IDs plus the new historyId to persist. If the supplied historyId is too
 * old Gmail returns 404 — caller should re-bootstrap via startHistorySync.
 */
export async function listHistory(
  userId: string,
  sinceHistoryId: string,
): Promise<{ messageIds: string[]; newHistoryId: string | null; expired: boolean }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let newHistoryId: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      startHistoryId: sinceHistoryId,
      historyTypes: "messageAdded",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await gfetch(userId, `/history?${params.toString()}`);
    if (res.status === 404) {
      // historyId too old — caller must re-bootstrap.
      return { messageIds: [], newHistoryId: null, expired: true };
    }
    if (res.status === 410) {
      return { messageIds: [], newHistoryId: null, expired: false };
    }
    if (!res.ok) {
      throw new Error(`gmail history failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      history?: Array<{
        messagesAdded?: Array<{ message?: { id?: string } }>;
      }>;
      nextPageToken?: string;
      historyId?: string;
    };
    if (json.historyId) newHistoryId = json.historyId;
    for (const h of json.history ?? []) {
      for (const a of h.messagesAdded ?? []) {
        const id = a.message?.id;
        if (id) ids.add(id);
      }
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return { messageIds: [...ids], newHistoryId, expired: false };
}
