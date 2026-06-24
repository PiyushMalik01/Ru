// Presence-aware push: when the user has Ru open and the tab is visible +
// focused, the inbox bell already updates live via Supabase Realtime, so
// firing an OS-level notification is just noise. We forward the payload to
// the visible client (as a postMessage) so a soft inline toast can render
// instead, and skip the OS notification entirely.
//
// If no client is visible/focused (background tab, closed tab, locked phone),
// fall through to a normal OS notification.

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "Ru";
  const body = data.body || "";
  const url = data.url || "/chat";

  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visibleAndFocused = list.find((c) => c.visibilityState === "visible" && c.focused);

    if (visibleAndFocused) {
      // Forward to the live client. If the page has a handler it can show
      // an inline chip; if not, the bell badge still updates via Realtime
      // so the notification isn't lost — just quieter.
      for (const client of list) {
        try {
          client.postMessage({ type: "ru-notification", payload: { title, body, url, ...data } });
        } catch {
          // postMessage can fail mid-unload; swallow.
        }
      }
      return;
    }

    return self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/badge.png",
      data: { url },
      tag: data.tag || undefined,
      renotify: false,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
