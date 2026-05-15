'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

// Small crypto-helper: Converts URL-Safe VAPID key back into required binary typed array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationManager() {
  const { data: session, status } = useSession();
  
  useEffect(() => {
    // Pre-requisite verify: Service workers + Session present
    if (status !== 'authenticated' || !session?.user) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[PushManager] Browser lacks standard web-push support.');
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      console.error('[PushManager] Deployment Error: NEXT_PUBLIC_VAPID_PUBLIC_KEY missing.');
      return;
    }

    async function registerAndSubscribe() {
      try {
        // 1. Wait for Service Worker to load and verify active readiness
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/', // Standard universal scope
        });

        // 2. Dynamic onboarding: Prompt user permission if not already set
        if (Notification.permission === 'default') {
          const permissionResult = await Notification.requestPermission();
          if (permissionResult !== 'granted') {
            console.log('[PushManager] OS Notification Permission declined.');
            return;
          }
        }

        if (Notification.permission !== 'granted') {
          return;
        }

        // 3. Check for existing registration to avoid duplicate overhead
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          // 🛡️ AUTO-HEAL KEY SHIELD: If VAPID credentials were ever updated/rotated in .env,
          // the browser's cached subscription will still hold the old key, resulting in server 410 rejections.
          // We compare the binary keys and dynamically unsubscribe stale tokens to force auto-renewal!
          try {
            const freshKey = urlBase64ToUint8Array(publicKey!).toString();
            const cachedKey = new Uint8Array(subscription.options.applicationServerKey!).toString();

            if (freshKey !== cachedKey) {
              console.log('[PushManager] VAPID key rotation detected! Invalidating stale browser cache...');
              await subscription.unsubscribe();
              subscription = null;
            }
          } catch (keyErr) {
            // Safe fallback: if comparison fails, unsubscribe to ensure freshness
            await subscription.unsubscribe();
            subscription = null;
          }
        }

        if (!subscription) {
          // Provision a completely fresh push token
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true, // Security requirement enforced by browsers
            applicationServerKey: urlBase64ToUint8Array(publicKey!),
          });
          console.log('[PushManager] Spawning fresh browser subscription key.');
        }

        // 4. Save or update the user's token into MongoDB safely
        const response = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: {
              endpoint: subscription.endpoint,
              expirationTime: subscription.expirationTime,
              keys: {
                p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')!) as any)),
                auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')!) as any)),
              }
            }
          }),
        });

        if (response.ok) {
          console.log('[PushManager] Core Endpoint synchronized successfully with Backend.');
        } else {
          console.error('[PushManager] Failed sync with endpoint:', await response.text());
        }
      } catch (err) {
        console.error('[PushManager] Native onboarding failure:', err);
      }
    }

    // Fire asynchronous setup context
    registerAndSubscribe();
  }, [session, status]);

  // Headless Context: Delivers features invisibly without layout impact
  return null;
}
