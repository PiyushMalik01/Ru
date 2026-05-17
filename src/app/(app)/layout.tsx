import { TopNav } from "@/components/app-shell/top-nav";
import { FloatingPill } from "@/components/app-shell/floating-pill";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6">
        {children}
      </main>
      <FloatingPill />
    </div>
  );
}
