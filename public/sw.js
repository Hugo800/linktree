// Until September 2026 this origin served the Padel Score PWA with its own service worker.
// This replacement removes it: it clears the old caches, unregisters itself and reloads
// open tabs, so returning visitors see the current site instead of a cached old app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      windows.forEach((client) => client.navigate(client.url));
    })(),
  );
});
