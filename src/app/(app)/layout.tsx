import { TopNav } from "@/components/app-shell/top-nav";
import { SubNav } from "@/components/app-shell/sub-nav";
import { PushPrompt } from "@/components/app-shell/push-prompt";
import { AppDock } from "@/components/app-shell/app-dock";
import { RuGhost } from "@/components/ru-companion/ru-ghost";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
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
    </div>
  );
}
