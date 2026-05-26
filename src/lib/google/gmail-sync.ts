// ---------------------------------------------------------------------------
// Gmail sync orchestrator
// ---------------------------------------------------------------------------
// On first run: capture historyId via startHistorySync + scan the last 24h
// via listMessageIds. On subsequent runs: pull only new messages via
// listHistory. For each new message, run the LLM extractor, write rows
// into `extracted_items` with status='pending'. A single batched
// notification is dispatched if at least 1 item was inserted.
// ---------------------------------------------------------------------------

import { createServiceClient } from "@/lib/supabase/service";
import {
  getMessage,
  listHistory,
  listMessageIds,
  startHistorySync,
  type ParsedMessage,
} from "./gmail";
import { extractFromMessage, type ExtractedItem } from "./gmail-extractor";
import { dispatch } from "@/lib/notifications";
import type { Database } from "@/types/database";

type ExtractionKindDb = Database["public"]["Enums"]["extraction_kind"];

export interface SyncResult {
  inserted: number;
  scanned: number;
  bootstrapped: boolean;
  errors: string[];
}

/**
 * Run a sync for a single user. Safe to call from API route or Inngest cron.
 * Never throws — all failures are aggregated into the `errors` array so
 * the batch caller can continue.
 */
export async function syncUser(userId: string): Promise<SyncResult> {
  const result: SyncResult = { inserted: 0, scanned: 0, bootstrapped: false, errors: [] };
  const supabase = createServiceClient();

  let integration: { gmail_history_id: string | null; gmail_extraction_enabled: boolean } | null = null;
  try {
    const { data } = await supabase
      .from("google_integrations")
      .select("gmail_history_id, gmail_extraction_enabled")
      .eq("user_id", userId)
      .single();
    integration = data;
  } catch (e) {
    result.errors.push(`load integration: ${(e as Error).message}`);
    return result;
  }
  if (!integration) {
    result.errors.push("no integration");
    return result;
  }
  if (!integration.gmail_extraction_enabled) {
    return result;
  }

  // 1. Determine which message IDs to process.
  let messageIds: string[] = [];
  let nextHistoryId: string | null = null;

  if (!integration.gmail_history_id) {
    // Bootstrap: capture current historyId, then scan last 24h.
    result.bootstrapped = true;
    try {
      nextHistoryId = await startHistorySync(userId);
    } catch (e) {
      result.errors.push(`startHistorySync: ${(e as Error).message}`);
    }
    try {
      messageIds = await listMessageIds(userId, "newer_than:1d in:inbox");
    } catch (e) {
      result.errors.push(`listMessageIds: ${(e as Error).message}`);
    }
  } else {
    try {
      const h = await listHistory(userId, integration.gmail_history_id);
      if (h.expired) {
        // Stale cursor — re-bootstrap.
        result.bootstrapped = true;
        try {
          nextHistoryId = await startHistorySync(userId);
        } catch (e) {
          result.errors.push(`startHistorySync(re-bootstrap): ${(e as Error).message}`);
        }
        try {
          messageIds = await listMessageIds(userId, "newer_than:1d in:inbox");
        } catch (e) {
          result.errors.push(`listMessageIds(re-bootstrap): ${(e as Error).message}`);
        }
      } else {
        messageIds = h.messageIds;
        nextHistoryId = h.newHistoryId;
      }
    } catch (e) {
      result.errors.push(`listHistory: ${(e as Error).message}`);
    }
  }

  result.scanned = messageIds.length;

  // 2. For each message: fetch, extract, insert rows.
  for (const id of messageIds) {
    let msg: ParsedMessage | null = null;
    try {
      msg = await getMessage(userId, id);
    } catch (e) {
      result.errors.push(`getMessage(${id}): ${(e as Error).message}`);
      continue;
    }
    if (!msg) continue;

    let items: ExtractedItem[];
    try {
      items = await extractFromMessage(msg);
    } catch (e) {
      result.errors.push(`extract(${id}): ${(e as Error).message}`);
      continue;
    }
    if (items.length === 0) continue;

    const previewFrom = msg.from?.slice(0, 200) ?? null;
    const previewSubject = msg.subject?.slice(0, 200) ?? null;
    const previewSnippet = msg.snippet?.slice(0, 500) ?? null;

    for (const item of items) {
      // Dedupe via unique constraint (user_id, source, source_ref, suggested_kind).
      // Use upsert with ignoreDuplicates to make it idempotent.
      const { error } = await supabase
        .from("extracted_items")
        .upsert(
          {
            user_id: userId,
            source: "gmail",
            source_ref: id,
            suggested_kind: item.kind as ExtractionKindDb,
            suggested_payload: item.payload as Database["public"]["Tables"]["extracted_items"]["Insert"]["suggested_payload"],
            confidence: item.confidence,
            status: "pending",
            preview_from: previewFrom,
            preview_subject: previewSubject,
            preview_snippet: previewSnippet,
          },
          { onConflict: "user_id,source,source_ref,suggested_kind", ignoreDuplicates: true },
        )
        .select("id");
      if (error) {
        result.errors.push(`insert(${id}/${item.kind}): ${error.message}`);
        continue;
      }
      result.inserted += 1;
    }
  }

  // 3. Update integration cursor + last sync timestamp.
  const nowIso = new Date().toISOString();
  const update: Database["public"]["Tables"]["google_integrations"]["Update"] = {
    last_gmail_sync_at: nowIso,
    updated_at: nowIso,
  };
  if (nextHistoryId) update.gmail_history_id = nextHistoryId;
  const { error: updErr } = await supabase
    .from("google_integrations")
    .update(update)
    .eq("user_id", userId);
  if (updErr) result.errors.push(`update cursor: ${updErr.message}`);

  // 4. Single summary notification if we found anything.
  if (result.inserted > 0) {
    try {
      await dispatch({
        userId,
        kind: "gmail_extracted",
        title: `Ru caught ${result.inserted} thing${result.inserted === 1 ? "" : "s"} in your inbox`,
        body: "Tap to review and accept the ones worth keeping.",
        url: "/inbox/extracted",
        dedupTag: "gmail-batch",
      });
    } catch (e) {
      result.errors.push(`dispatch: ${(e as Error).message}`);
    }
  }

  return result;
}
