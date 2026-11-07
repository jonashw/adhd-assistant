/* ADHD Assist's service worker, for arrival alerts only (worker/src/arrivals.ts). Pushes arrive empty; this asks the
   app what to say, then opens Your move when the notification is tapped. It caches nothing. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
    event.waitUntil((async () => {
        let note = {};
        try {
            const response = await fetch("/api/push/latest", {credentials: "include"});
            if (response.ok) note = await response.json();
        } catch {
            // offline or signed out: say something general rather than nothing
        }
        await self.registration.showNotification(note.title || "Something waits for you here", {
            body: note.body || "Open Your move to see what fits where you are.",
            tag: "arrival",
            renotify: true,
            icon: "/android-chrome-192x192.png",
            badge: "/favicon-32x32.png",
            data: {url: "/claude?view=list"}
        });
    })());
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || "/claude?view=list", self.location.origin).href;
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({type: "window", includeUncontrolled: true});
        const tab = open.find(c => new URL(c.url).pathname.startsWith("/claude"));
        if (tab) {
            await tab.focus();
            return tab.navigate(url).catch(() => undefined);
        }
        return self.clients.openWindow(url);
    })());
});
