"use client";

import { usePathname } from "next/navigation";
import { FloatingPill } from "./floating-pill";
import { AskOverlay } from "./ask-overlay";

// Picks which bottom affordance to mount based on the current route.
// The full floating pill belongs on /chat. Everywhere else gets the slim
// AskOverlay trigger so the page doesn't feel cluttered.
export function AppDock() {
  const pathname = usePathname();
  const onChat = pathname === "/chat" || pathname.startsWith("/chat/");
  return onChat ? <FloatingPill /> : <AskOverlay />;
}
