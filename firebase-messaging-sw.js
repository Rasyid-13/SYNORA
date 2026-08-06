importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// 1. KONFIGURASI FIREBASE SYNORA
firebase.initializeApp({
  apiKey: "AIzaSyCHfhcuco1J5eZKEWdllHc8AnPCqIwtzVk",
  authDomain: "synora-b2918.firebaseapp.com",
  projectId: "synora-b2918",
  storageBucket: "synora-b2918.firebasestorage.app",
  messagingSenderId: "587381335839",
  appId: "1:587381335839:web:614df934da3dce34c1f22a"
});

const messaging = firebase.messaging();

// 2. NOTIFIKASI LATAR BELAKANG
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notifikasi background diterima ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' 
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 3. KODE INTI PWA (AGAR BISA DI-INSTALL)
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    return self.clients.claim();
});

// SYARAT MUTLAK PWA: Harus ada event 'fetch' agar Chrome memunculkan tombol Install
self.addEventListener('fetch', (event) => {
    // Biarkan browser memproses request jaringan secara normal
    event.respondWith(fetch(event.request).catch(() => {
        // Fallback kosong jika offline
        return new Response("Aplikasi sedang offline.");
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
