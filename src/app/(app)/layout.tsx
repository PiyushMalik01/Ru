import { TopNav } from "@/components/app-shell/top-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6">
        {children}
      </main>
    </div>
  );
}
