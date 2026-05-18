import { TopNav } from "@/components/app-shell/top-nav";
import { PushPrompt } from "@/components/app-shell/push-prompt";
import { AppDock } from "@/components/app-shell/app-dock";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <PushPrompt />
      <main className="flex-1">{children}</main>
      {/* AppDock decides which input affordance to mount based on the route:
          - /chat → the full floating pill (existing UX)
          - everywhere else → a slim "Ask Ru" pill + overlay summoner */}
      <AppDock />
    </div>
  );
}
