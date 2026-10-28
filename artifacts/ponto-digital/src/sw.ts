/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute, PrecacheFallbackPlugin } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Only build assets enter the precache. API responses and Clerk never do.
precacheAndRoute(self.__WB_MANIFEST, { cleanURLs: false });
cleanupOutdatedCaches();
clientsClaim();

const base = new URL(self.registration.scope).pathname;
registerRoute(new NavigationRoute(async () => {
  // The shell is public HTML; account data always comes from the network.
  const shell = await matchPrecache(`${base}index.html`);
  return shell ?? Response.error();
}, {
  denylist: [/^\/api(?:\/|$)/, /\/__clerk(?:\/|$)/, /\/sign-(?:in|up)(?:\/|$)/],
}));

// Login pages stay on the network. Their offline fallback has no Clerk dependency.
registerRoute(new NavigationRoute(new NetworkOnly({
  plugins: [new PrecacheFallbackPlugin({ fallbackURL: `${base}offline.html` })],
}), { allowlist: [/\/sign-(?:in|up)(?:\/|$)/] }));

// Fonts are the only runtime caches; no catch-all route can capture user data.
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'ponto-digital-font-styles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'ponto-digital-font-files',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
);

// Activation only happens after the person accepts the update (or closes all tabs).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});
