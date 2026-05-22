import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messageId: z.uuid(),
  playedUpToChar: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return new Response("invalid body", { status: 400 });

  const { messageId, playedUpToChar } = parsed.data;

  // Load + verify ownership. We hold the full content here because we need to
  // slice it server-side — clients are not trusted with the canonical text.
  const { data: msg } = await supabase
    .from("messages")
    .select("id, user_id, role, content")
    .eq("id", messageId)
    .single();
  if (!msg || msg.user_id !== user.id) {
    return new Response("not found", { status: 404 });
  }
  if (msg.role !== "assistant") {
    return new Response("only assistant messages can be truncated", {
      status: 400,
    });
  }

  const cur = msg.content ?? "";
  const upTo = Math.min(playedUpToChar, cur.length);
  if (upTo >= cur.length) {
    // Nothing to truncate — call still succeeds. This is the common case for
    // a barge-in that lands after the assistant has already finished
    // streaming a complete reply.
    return Response.json({ ok: true, unchanged: true });
  }

  // Trailing ellipsis tells downstream readers (chat history, memory
  // consolidation, exports) that the user cut Ru off mid-thought.
  const truncated = cur.slice(0, upTo).trimEnd() + " …";
  const { error } = await supabase
    .from("messages")
    .update({ content: truncated, truncated_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) return new Response(`db error: ${error.message}`, { status: 500 });

  return Response.json({ ok: true, truncatedTo: upTo });
}
