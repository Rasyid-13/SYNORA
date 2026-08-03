// File Service Worker (sw.js)
self.addEventListener('install', (e) => {
    console.log('[SYNORA] Service Worker Ter-install');
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    console.log('[SYNORA] Service Worker Aktif');
});

self.addEventListener('fetch', (e) => {
    // Mode Bypass: Membiarkan aplikasi mengambil data online (Firestore) secara normal
    e.respondWith(fetch(e.request).catch(() => {
        return new Response("Aplikasi SYNORA sedang offline.");
    }));
});
