/* Gym Tracker service worker.
 *
 * Hosted on GitHub Pages, so every project site of the same account shares the
 * <user>.github.io origin, and with it Cache Storage and localStorage. This worker
 * therefore only touches caches with its own prefix and only handles requests
 * inside its own scope.
 *
 * Strategy: the app is a single index.html, served cache-first so it opens
 * instantly offline. Each launch re-checks index.html in the background; if it
 * changed on GitHub, the cache is updated and open pages get an "app-updated"
 * message (the next launch runs the new version). No manual version bump is
 * needed for index.html changes; bump CACHE only when the icon/manifest list changes.
 */
const PREFIX = 'gym-tracker-';
const CACHE = PREFIX + 'v4';
const SHELL = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];
const SCOPE = self.registration.scope;
const INDEX_URL = new URL('./index.html', SCOPE).href;
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Fetch index.html past the HTTP cache; store it; report whether it changed.
async function refreshShell() {
  const cache = await caches.open(CACHE);
  const fresh = await fetch(INDEX_URL, { cache: 'no-cache' });
  if (!fresh.ok) return false;
  const [cached, freshText] = await Promise.all([cache.match(INDEX_URL, MATCH), fresh.clone().text()]);
  const changed = cached ? (await cached.text()) !== freshText : false;
  await cache.put(INDEX_URL, fresh);
  return changed;
}

async function notifyClients(type) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach(c => c.postMessage({ type }));
}

async function handleNavigation(event) {
  const url = new URL(event.request.url);
  const base = new URL(SCOPE).pathname;
  const isShell = url.pathname === base || url.pathname === base + 'index.html';
  if (!isShell) {
    try { return await fetch(event.request); }
    catch (e) { return (await caches.match(INDEX_URL, MATCH)) || Response.error(); }
  }
  const cached = await caches.match(INDEX_URL, MATCH);
  if (cached) {
    event.waitUntil(refreshShell().then(changed => changed && notifyClients('app-updated')).catch(() => {}));
    return cached;
  }
  try {
    const res = await fetch(INDEX_URL, { cache: 'no-cache' });
    if (res.ok) await (await caches.open(CACHE)).put(INDEX_URL, res.clone());
    return res;
  } catch (e) {
    return new Response('<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#121212;color:#eee;font-family:system-ui;padding:24px"><h2>Offline</h2><p>Open the app once while online so it can save itself for offline use.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request, MATCH);
  const network = fetch(event.request)
    .then(res => { if (res.ok && res.type === 'basic') cache.put(event.request, res.clone()); return res; })
    .catch(() => null);
  if (cached) { event.waitUntil(network); return cached; }
  return (await network) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return; // other github.io projects: hands off
  if (req.mode === 'navigate') { event.respondWith(handleNavigation(event)); return; }
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(staleWhileRevalidate(event));
});

// "Check for update" button in Settings.
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'check-update') return;
  const reply = type => event.source && event.source.postMessage({ type });
  event.waitUntil(refreshShell()
    .then(changed => reply(changed ? 'app-updated' : 'up-to-date'))
    .catch(() => reply('check-failed')));
});
