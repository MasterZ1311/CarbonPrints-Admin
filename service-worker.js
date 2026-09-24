/**
 * ============================================================================
 * IMPORTANT: BUMP CACHE_VERSION EVERY TIME ANY PROJECT FILE CHANGES!
 * ============================================================================
 * Because this service worker implements a cache-first offline strategy,
 * browsers will serve cached assets indefinitely until CACHE_VERSION is updated.
 *
 * Increment the version string below (e.g. "cp-os-v1" -> "cp-os-v2") whenever
 * HTML, CSS, JavaScript, icons, or manifests are modified. During activation,
 * the service worker will automatically purge stale caches and precache the
 * newest assets for all connected clients.
 * ============================================================================
 */
const CACHE_VERSION = 'cp-os-v3';

/**
 * Precache list containing EVERY file in the project required for complete offline operation.
 */
const PRECACHE_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'css/print.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/core/util.js',
  'js/core/bus.js',
  'js/core/defaults.js',
  'js/core/store.js',
  'js/core/router.js',
  'js/core/ui.js',
  'js/core/dev.js',
  'js/services/pricing.js',
  'js/services/wa.js',
  'js/services/docs.js',
  'js/services/inventory-svc.js',
  'js/services/scrap-svc.js',
  'js/services/maint-svc.js',
  'js/services/csv.js',
  'js/services/octoprint.js',
  'js/modules/dashboard.js',
  'js/modules/orderdesk.js',
  'js/modules/orders.js',
  'js/modules/farm.js',
  'js/modules/inventory.js',
  'js/modules/qc.js',
  'js/modules/maintenance.js',
  'js/modules/data.js',
  'js/modules/settings.js'
];

/**
 * Install Event: Pre-caches all application assets and triggers immediate activation.
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      console.log(`[ServiceWorker] Precaching ${PRECACHE_ASSETS.length} assets into ${CACHE_VERSION}`);
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/**
 * Activate Event: Purges previous cache versions and claims active clients immediately.
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(cacheName => cacheName.startsWith('cp-os-') && cacheName !== CACHE_VERSION)
          .map(cacheName => {
            console.log(`[ServiceWorker] Purging outdated cache: ${cacheName}`);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch Event: Cache-first strategy for same-origin GET requests with network fallback.
 * Navigations fall back to cached index.html when offline.
 */
self.addEventListener('fetch', event => {
  // Only cache same-origin GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('tests.html') || url.search.includes('v=test') || (event.request.referrer && event.request.referrer.includes('tests.html'))) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then(networkResponse => {
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(error => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html').then(fallback => {
              return fallback || caches.match('index.html');
            });
          }
          throw error;
        });
    })
  );
});

/**
 * Message Event: Allows client pages to trigger immediate activation.
 */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
