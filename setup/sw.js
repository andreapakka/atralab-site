self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || "ATRALAB";
  const options = {
    body: payload.body || "Nuova notifica",
    tag: payload.tag || "atralab-push",
    renotify: true,
    data: {
      url: payload.url || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });

    for (const client of windows) {
      try {
        if ("navigate" in client) {
          await client.navigate(targetUrl);
        }
        return await client.focus();
      } catch {
        // Prova con la finestra successiva.
      }
    }

    return self.clients.openWindow(targetUrl);
  })());
});
