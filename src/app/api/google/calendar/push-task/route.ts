import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushTaskToCalendar } from "@/lib/google/calendar-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  let body: { taskId?: string };
  try {
    body = (await req.json()) as { taskId?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const taskId = body.taskId;
  if (!taskId || typeof taskId !== "string") {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  try {
    const result = await pushTaskToCalendar(user.id, taskId);
    return NextResponse.json({ eventId: result.eventId, htmlLink: result.htmlLink });
  } catch (e) {
    console.error("[api/google/calendar/push-task] failed", e);
    const msg = e instanceof Error ? e.message : "push failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
