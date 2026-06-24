import { TopNav } from "@/components/app-shell/top-nav";
import { SubNav } from "@/components/app-shell/sub-nav";
import { PushPrompt } from "@/components/app-shell/push-prompt";
import { AppDock } from "@/components/app-shell/app-dock";
import { ConfirmDialog } from "@/components/app-shell/confirm-dialog";
import { RuGhost } from "@/components/ru-companion/ru-ghost";
import { SuggestionToast } from "@/components/anticipation/suggestion-toast";
import { NotificationToast } from "@/components/notifications/notification-toast";
import { createClient } from "@/lib/supabase/server";
import { MemoryRolloutBanner } from "./_memory-rollout-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Inbox unread count — feeds the top-bar bell. We do this here (in the
  // shared layout) so every (app) route gets the live badge without each
  // page having to opt in. Realtime keeps the client-side number in sync;
  // this initial value is just the seed.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let inboxUnreadCount = 0;
  if (user) {
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("archived_at", null);
    inboxUnreadCount = count ?? 0;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav inboxUnreadCount={inboxUnreadCount} />
      <MemoryRolloutBanner />
      <SubNav />
      <PushPrompt />
      <main className="flex-1">{children}</main>
      {/* Ru's character — a floating ghost layer. Pointer-events: none so
          she never blocks the UI; route-aware position + idle drift. */}
      <RuGhost />
      {/* AppDock decides which input affordance to mount based on the route:
          - /chat → the full floating pill (existing UX)
          - everywhere else → a slim "Ask Ru" pill + overlay summoner */}
      <AppDock />
      {/* Anticipation toast — listens for new suggestions via Supabase
          realtime and surfaces them as a soft pill toast above the pill. */}
      <SuggestionToast />
      {/* When the tab is visible+focused, the service worker forwards push
          payloads here instead of firing OS notifications. The chip floats
          above the pill so Ru still surfaces, just quietly. */}
      <NotificationToast />
      {/* Promise-based global confirm dialog. Replaces window.confirm() so
          delete/archive prompts match the platform aesthetic. */}
      <ConfirmDialog />
    </div>
  );
}
