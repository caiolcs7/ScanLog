/* Notificações da Identificação, importado pelo service worker do app. */
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const scope = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || 'ScanLog', {
      body: data.body || '',
      tag: data.tag,
      renotify: !!data.tag,
      icon: new URL('icons/icon-192.png', scope).href,
      badge: new URL('icons/icon-192.png', scope).href,
      data: { url: new URL(data.url || '', scope).href },
    }),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (list) => {
        const open = list.find((c) => c.url.startsWith(self.registration.scope));
        if (open) {
          await open.focus();
          if ('navigate' in open) return open.navigate(url).catch(() => {});
          return;
        }
        return self.clients.openWindow(url);
      }),
  );
});
