"use strict";

// إعدادات مشروع Firebase الخاص بلوحة المعلمات فقط
const teacherFirebaseConfig = {
  apiKey: "AIzaSyBgH8E76u8boytcS2ztiNJQRl5-WqPwu5c",
  authDomain: "read-d879d.firebaseapp.com",
  projectId: "read-d879d",
  storageBucket: "read-d879d.firebasestorage.app",
  messagingSenderId: "605877976699",
  appId: "1:605877976699:web:fae4245af6ae63676c2cde",
  measurementId: "G-GCKJN95NGG"
};

// إنشاء تطبيق مستقل للمعلمات، ومنع تكرار تهيئته
if (!firebase.apps.some((app) => app.name === "teacherApp")) {
  firebase.initializeApp(teacherFirebaseConfig, "teacherApp");
}

// إتاحة خدمات المشروع الجديد للملف teacher.js
window.teacherApp = firebase.app("teacherApp");
window.teacherAuth = window.teacherApp.auth();
window.teacherDB = window.teacherApp.firestore();