"use client";

import { useMemo, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, MoreHorizontal, Trash2, Edit3, PanelLeftClose, PanelLeftOpen, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createChat,
  deleteChat,
  renameChat,
} from "@/app/(app)/chat/chat-actions";

export interface ChatSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
}

interface Props {
  chats: ChatSummary[];
  activeChatId: string | null;
}

const COLLAPSE_KEY = "ru-chat-sidebar-collapsed";

export function ChatSidebar({ chats, activeChatId }: Props) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (collapsed) localStorage.setItem(COLLAPSE_KEY, "1");
    else localStorage.removeItem(COLLAPSE_KEY);
  }, [collapsed]);

  // Close action menu on any outside click
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openMenuId]);

  const grouped = useMemo(() => groupByRecency(chats), [chats]);

  function handleNewChat() {
    startTransition(async () => {
      const result = await createChat();
      if (result.id) router.push(`/chat/${result.id}`);
    });
  }

  function handleDelete(chatId: string) {
    startTransition(async () => {
      await deleteChat(chatId);
      if (activeChatId === chatId) {
        router.push("/chat");
      } else {
        router.refresh();
      }
    });
  }

  function startRename(chat: ChatSummary, e: React.MouseEvent) {
    e.stopPropagation();
    setOpenMenuId(null);
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  }

  function commitRename(chatId: string) {
    const next = renameValue.trim();
    if (!next) {
      setRenamingId(null);
      return;
    }
    startTransition(async () => {
      await renameChat(chatId, next);
      setRenamingId(null);
      router.refresh();
    });
  }

  if (collapsed) {
    return (
      <aside className="flex h-full w-[56px] shrink-0 flex-col items-center border-r border-border bg-card/40 py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand chat sidebar"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleNewChat}
          disabled={pending}
          aria-label="New chat"
          className="mt-3 flex h-9 w-9 items-center justify-center rounded-md bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
        <div
          aria-hidden
          className="mt-6 flex-1 [writing-mode:vertical-rl] font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
        >
          chats · {chats.length}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-border bg-card/40">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={pending}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-left transition-colors",
            "hover:bg-elevated disabled:opacity-50"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="text-[13px] font-medium">New chat</span>
        </button>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {chats.length === 0 ? (
          <p className="px-3 py-6 text-[12px] text-muted-foreground">
            No chats yet. Start one above.
          </p>
        ) : (
          grouped.map(({ label, items }) => (
            <div key={label} className="mt-3 first:mt-1">
              <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </div>
              <ul>
                {items.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const isRenaming = renamingId === chat.id;
                  return (
                    <li key={chat.id} className="relative">
                      {isRenaming ? (
                        <div className="flex items-center gap-1 px-2 py-1">
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(chat.id);
                              else if (e.key === "Escape") setRenamingId(null);
                            }}
                            onBlur={() => commitRename(chat.id)}
                            className="flex-1 rounded-md border border-border bg-secondary px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
                          />
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => commitRename(chat.id)}
                            aria-label="Save"
                            className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setRenamingId(null)}
                            aria-label="Cancel"
                            className="flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <Link
                          href={`/chat/${chat.id}`}
                          className={cn(
                            "group/row relative flex items-center gap-2 rounded-md px-3 py-2 transition-colors",
                            isActive
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                          )}
                        >
                          {isActive && (
                            <span
                              aria-hidden
                              className="pointer-events-none absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-[1px]"
                              style={{ background: "var(--entity-plan)" }}
                            />
                          )}
                          <span className="flex-1 truncate text-[13px]">{chat.title}</span>
                          <button
                            type="button"
                            aria-label="Chat actions"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === chat.id ? null : chat.id);
                            }}
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity",
                              openMenuId === chat.id
                                ? "opacity-100"
                                : "opacity-0 group-hover/row:opacity-100",
                              "hover:bg-elevated hover:text-foreground"
                            )}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </Link>
                      )}

                      {openMenuId === chat.id && !isRenaming && (
                        <div
                          className="absolute right-2 top-9 z-30 min-w-[140px] overflow-hidden rounded-md border border-border bg-elevated shadow-xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => startRename(chat, e)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-secondary"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(null);
                              if (window.confirm(`Delete "${chat.title}"? This can't be undone.`)) {
                                handleDelete(chat.id);
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-error transition-colors hover:bg-secondary"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function groupByRecency(chats: ChatSummary[]) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const sevenAgo = new Date(startOfToday);
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const thirtyAgo = new Date(startOfToday);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const buckets: Record<string, ChatSummary[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    "This month": [],
    Older: [],
  };

  for (const chat of chats) {
    const t = new Date(chat.updated_at);
    if (t >= startOfToday) buckets.Today.push(chat);
    else if (t >= startOfYesterday) buckets.Yesterday.push(chat);
    else if (t >= sevenAgo) buckets["This week"].push(chat);
    else if (t >= thirtyAgo) buckets["This month"].push(chat);
    else buckets.Older.push(chat);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
