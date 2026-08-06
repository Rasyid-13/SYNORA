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

// 2. KODE NOTIFIKASI BACKGROUND (FIREBASE)
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notifikasi background diterima ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png', // Pastikan nama icon benar
    data: payload.data // Bawa data URL jika dikirim dari server
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});


// 3. KODE PWA LAMA ANDA (DIGABUNGKAN)
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    return self.clients.claim();
});

// Menangani klik pada notifikasi agar membuka aplikasi kembali dengan cerdas
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Cek apakah aplikasi SYNORA sudah terbuka di background
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // Jika sudah terbuka, fokuskan saja layarnya
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Jika aplikasi benar-benar tertutup, buka jendela baru ke index
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
