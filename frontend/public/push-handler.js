// Web Push handlers, imported into the Workbox-generated service worker via
// `workbox.importScripts(['/push-handler.js'])` (see vite.config.js). Kept as a
// plain static file so it survives the generateSW build without touching the
// runtime caching config.
//
// We subscribe with userVisibleOnly:true, so the browser requires that every push
// shows a notification — the push handler below always calls showNotification.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // payload wasn't JSON; fall back to defaults
  }
  const title = data.title || 'Nutri';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'nutri-reminder',  // collapses repeated reminders for the same slot
    data: { url: data.url || '/' },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find((c) => c.url.includes(self.location.origin));
    if (existing) {
      await existing.focus();
      if (existing.navigate) {
        try { await existing.navigate(url); } catch (e) { /* navigate can reject cross-origin; ignore */ }
      }
    } else {
      await clients.openWindow(url);
    }
  })());
});
