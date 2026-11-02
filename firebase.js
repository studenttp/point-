
/* =====================================
   Firebase إعداد الاتصال
   نجوم صفي
===================================== */

const firebaseConfig = {
    apiKey: "AIzaSyDTtYM0Ifg-6jKZWbcgkCOkWvDIxpukmzM",
    authDomain: "class-rewards-1556c.firebaseapp.com",
    projectId: "class-rewards-1556c",
    storageBucket: "class-rewards-1556c.firebasestorage.app",
    messagingSenderId: "927135908979",
    appId: "1:927135908979:web:6cda0994a9fd3fa77e9606"
};


// =====================================
// تشغيل Firebase
// =====================================

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}


// =====================================
// الاتصال بقاعدة البيانات
// =====================================

const db = firebase.firestore();


// =====================================
// إضافة طالب
// =====================================

function addStudentToDatabase(student) {

    if (!student || !student.name || !student.code) {
        return Promise.reject(
            new Error("يرجى إدخال اسم الطالب والرمز.")
        );
    }

    return db.collection("students").add({

        name: String(student.name).trim(),

        code: String(student.code).trim(),

        points: Number(student.points) || 0,

        message: String(student.message || ""),

        createdAt: firebase.firestore.FieldValue.serverTimestamp()

    });

}


// =====================================
// البحث عن طالب بالرمز
// =====================================

function getStudent(code) {

    if (!code || !String(code).trim()) {
        return Promise.reject(
            new Error("يرجى إدخال رمز الطالب.")
        );
    }

    return db.collection("students")
        .where("code", "==", String(code).trim())
        .get();

}


// =====================================
// تحديث النقاط
// =====================================

function updatePoints(id, newPoints) {

    if (!id) {
        return Promise.reject(
            new Error("معرّف الطالب غير موجود.")
        );
    }

    const points = Number(newPoints);

    if (!Number.isFinite(points) || points < 0) {
        return Promise.reject(
            new Error("قيمة النقاط غير صحيحة.")
        );
    }

    return db.collection("students")
        .doc(id)
        .update({
            points: points
        });

}


// =====================================
// إتاحة الوظائف للملفات الأخرى
// =====================================

window.db = db;
window.addStudentToDatabase = addStudentToDatabase;
window.getStudent = getStudent;
window.updatePoints = updatePoints;
