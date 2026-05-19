"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { FloatingPill } from "./floating-pill";
import { AskOverlay } from "./ask-overlay";

// Picks which bottom affordance to mount based on the current route.
// The full floating pill belongs on /chat. Everywhere else gets the slim
// AskOverlay trigger so the page doesn't feel cluttered.
//
// AskOverlay reads useSearchParams to pick up page context. Since AppDock
// is mounted in the (app) layout, that read would force the entire page
// into the client-side bailout during static prerender — which broke the
// /settings build. Wrap it in Suspense so Next can resolve the params on
// the client without bailing out the page itself.
export function AppDock() {
  const pathname = usePathname();
  const onChat = pathname === "/chat" || pathname.startsWith("/chat/");
  return onChat ? (
    <FloatingPill />
  ) : (
    <Suspense fallback={null}>
      <AskOverlay />
    </Suspense>
  );
}
