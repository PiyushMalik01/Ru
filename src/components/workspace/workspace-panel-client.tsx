"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/stores/chat-store";
import { useRouter } from "next/navigation";
import type {
  WorkspaceSummary,
  WorkspaceDetail,
  TodayBundle,
} from "@/lib/queries/workspace";
import { WorkspaceHeader } from "./workspace-header";
import { TodayView } from "./today-view";
import { ActiveWorkspaceView } from "./active-workspace-view";

const STORAGE_KEY = "ru-workspace-collapsed";

interface Props {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  detail: WorkspaceDetail | null;
  todayBundle: TodayBundle | null;
}

export function WorkspacePanelClient({
  workspaces,
  currentWorkspaceId,
  detail,
  todayBundle,
}: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const status = useChatStore((s) => s.status);

  // Hydrate collapse state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {}
    setHydrated(true);
  }, []);

  // Persist collapse state
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed, hydrated]);

  // Refresh server data when streaming ends so the workspace reflects items
  // Ru just created/modified. Only fires on the streaming → idle transition,
  // not on initial mount.
  const prevStatusRef = useRef<string>(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === "streaming" && status === "idle") {
      // Small delay so the stream_end server-side revalidation lands first.
      const t = setTimeout(() => router.refresh(), 200);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  const currentWorkspace =
    workspaces.find((w) => w.id === currentWorkspaceId) ?? null;
  const itemCount = detail?.items.length ?? currentWorkspace?.itemCount ?? 0;

  const title = currentWorkspace?.title ?? "Today";

  // Collapsed rail (desktop)
  if (collapsed) {
    return (
      <aside
        aria-label="Workspace panel (collapsed)"
        className="hidden h-full w-[56px] shrink-0 flex-col items-center border-l border-border bg-background pt-4 lg:flex"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand workspace"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="mt-6 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="flex flex-col items-center gap-3"
          >
            <span
              className="origin-center whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              {title}
            </span>
            <span className="font-mono text-[11px] text-foreground/90">
              {itemCount}
            </span>
          </button>
        </div>
      </aside>
    );
  }

  // Mobile/tablet drawer trigger tab
  const drawer = (
    <>
      {/* Slim tab on right edge for mobile/tablet — opens drawer */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open workspace"
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 items-center gap-1.5 rounded-l-md border-y border-l border-border bg-elevated px-1.5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <span
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          workspace · {itemCount}
        </span>
      </button>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col border-l border-border bg-background lg:hidden"
            >
              <div className="flex items-center justify-end border-b border-border/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Close workspace"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-5">
                <PanelBody
                  workspaces={workspaces}
                  currentWorkspaceId={currentWorkspaceId}
                  currentWorkspace={currentWorkspace}
                  itemCount={itemCount}
                  detail={detail}
                  todayBundle={todayBundle}
                  onCollapse={() => setDrawerOpen(false)}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <>
      {/* Desktop panel */}
      <aside
        aria-label="Workspace panel"
        className="relative hidden h-full w-full max-w-[36%] shrink-0 flex-col overflow-y-auto border-l border-[var(--hairline)] bg-background lg:flex lg:w-[32%]"
      >
        <div className="flex-1 px-6 py-5">
          <PanelBody
            workspaces={workspaces}
            currentWorkspaceId={currentWorkspaceId}
            currentWorkspace={currentWorkspace}
            itemCount={itemCount}
            detail={detail}
            todayBundle={todayBundle}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      {drawer}
    </>
  );
}

function PanelBody({
  workspaces,
  currentWorkspaceId,
  currentWorkspace,
  itemCount,
  detail,
  todayBundle,
  onCollapse,
}: {
  workspaces: WorkspaceSummary[];
  currentWorkspaceId: string | null;
  currentWorkspace: WorkspaceSummary | null;
  itemCount: number;
  detail: WorkspaceDetail | null;
  todayBundle: TodayBundle | null;
  onCollapse: () => void;
}) {
  return (
    <div className="flex flex-col">
      <WorkspaceHeader
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        currentWorkspace={currentWorkspace}
        itemCount={itemCount}
        onCollapse={onCollapse}
      />

      {currentWorkspaceId && detail ? (
        <ActiveWorkspaceView detail={detail} />
      ) : todayBundle ? (
        <TodayView bundle={todayBundle} />
      ) : (
        <div className={cn("py-10 text-center")}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            sign in to see your workspace
          </p>
        </div>
      )}
    </div>
  );
}
