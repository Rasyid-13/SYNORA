importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// KONFIGURASI FIREBASE SYNORA ASLI ANDA
firebase.initializeApp({
  apiKey: "AIzaSyCHfhcuco1J5eZKEWdllHc8AnPCqIwtzVk",
  authDomain: "synora-b2918.firebaseapp.com",
  projectId: "synora-b2918",
  storageBucket: "synora-b2918.firebasestorage.app",
  messagingSenderId: "587381335839",
  appId: "1:587381335839:web:614df934da3dce34c1f22a"
});

const messaging = firebase.messaging();

// Menangkap notifikasi saat aplikasi ditutup (Background) / berjalan di balik layar
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notifikasi background diterima ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.png' // Pastikan file logo.png ada di folder utama Anda
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
