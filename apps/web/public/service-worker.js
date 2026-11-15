self.addEventListener("push", async (event) => {
  if (!event.data) return

  let notificationData = event.data.json();

  const allClients = await clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (!allClients.length) {
    console.log("No open tabs, skipping the push notification.");
    return;
  }

  const title = notificationData.title || "New horium.dev Notification";
  const image = notificationData.icon || "https://cal.com/api/logo?type=icon";

   event.waitUntil(
    (async () => {
      try {
        // Close notifications with the same tag if it exists
        const existingNotifications = await self.registration.getNotifications({
          tag: notificationData.tag
        });

        existingNotifications.forEach((notification) => {
          notification.close();
        });

        // Special handling for instant meetings
        if (notificationData.data?.type === "INSTANT_MEETING") {
          allClients.forEach(client => {
            client.postMessage({
              type: 'PLAY_NOTIFICATION_SOUND'
            });
          });
        }

        const notificationOptions = {
          body: notificationData.body,
          icon: image,
          badge: image,
          data: notificationData.data,
          tag: notificationData.tag || `cal-notification-${Date.now()}`,
          renotify: true,
          requireInteraction: notificationData.requireInteraction ?? true,
          actions: notificationData.actions || [],
          vibrate: [200, 100, 200],
          urgency: 'high'
        };

        console.log("notificationOptions", notificationOptions);

        await self.registration.showNotification(title, notificationOptions);
        console.log("Notification shown successfully");
      } catch (error) {
        console.error("Error showing notification:", error);
      }
    })()
  );
});


self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.type === "INSTANT_MEETING") {
    const stopSound = async () => {
      const allClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      allClients.forEach(client => {
        client.postMessage({
          type: 'STOP_NOTIFICATION_SOUND'
        });
      });
    };

    event.waitUntil(stopSound());
  }

  if (!event.action) {
    // Normal Notification Click
    event.notification.close();
    const url = event.notification.data.url;
    event.waitUntil(self.clients.openWindow(url));
  }

  switch (event.action) {
    case "connect-action":
      event.notification.close();
      const url = event.notification.data.url;
      event.waitUntil(self.clients.openWindow(url));
      break;
  }
});

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated.');

  event.waitUntil(
    (async () => {
      const notifications = await self.registration.getNotifications();
      notifications.forEach(notification => notification.close());

      return self.clients.claim();
    })()
  );
});
