// Antigravity Engine — Premium Service Worker for Real-Time Push Notifications
self.addEventListener('push', function (event) {
  if (!event.data) {
    console.log('[Service Worker] Push event contains no data.');
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    // Plaintext fallback if not JSON
    data = { title: 'New Notification', body: event.data.text() };
  }

  console.log('[Service Worker] Push Received:', data);

  const title = data.title || 'ChatApp';
  const options = {
    body: data.body || 'You have a new message!',
    icon: data.icon || '/icon-192x192.png', // Replace with real icon if present
    badge: data.badge || '/badge-72x72.png', // Small icon for Android taskbars
    tag: data.tag || 'chat-notification', // Groups similar notifications
    renotify: true, // Vibrate/Alert even if matching tag already open
    vibrate: [200, 100, 200], // Premium tactile vibration feedback
    data: {
      url: data.url || '/', // Target navigation URL upon click
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Native Operating System Click Actions Handler
self.addEventListener('notificationclick', function (event) {
  console.log('[Service Worker] Notification clicked. URL:', event.notification.data.url);

  event.notification.close();

  const targetUrl = event.notification.data.url || '/';

  // Search for matching browser windows/tabs and focus them instead of spawning duplicates
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          // If a tab already matches our host domain, navigate and focus!
          if ('focus' in client) {
            return client.focus().then(function() {
              return client.navigate(targetUrl);
            });
          }
        }
        // If no open windows found, provision a fresh clean tab!
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
