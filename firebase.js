
"use strict";

const firebaseConfig = {
  apiKey: "AIzaSyBgH8E76u8boytcS2ztiNJQRl5-WqPwu5c",
  authDomain: "read-d879d.firebaseapp.com",
  projectId: "read-d879d",
  storageBucket: "read-d879d.firebasestorage.app",
  messagingSenderId: "605877976699",
  appId: "1:605877976699:web:fae4245af6ae63676c2cde",
  measurementId: "G-GCKJN95NGG"
};

// تهيئة Firebase دون تكرار التطبيق الافتراضي.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// إتاحة خدمات Firebase للملفات الأخرى.
window.db = firebase.firestore();
window.auth = firebase.auth();
window.studentFunctions = firebase.app().functions("us-central1");

// مرجع مشروع Firebase.
window.firebaseApp = firebase.app();
