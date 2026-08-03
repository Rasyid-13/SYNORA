// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCHfhcuco1J5eZKEWdllHc8AnPCqIwtzVk",
  authDomain: "synora-b2918.firebaseapp.com",
  projectId: "synora-b2918",
  storageBucket: "synora-b2918.firebasestorage.app",
  messagingSenderId: "587381335839",
  appId: "1:587381335839:web:614df934da3dce34c1f22a",
  measurementId: "G-3GJYW47T8P"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
