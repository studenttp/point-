
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

// ===================================
// البحث المباشر في سجلات الطالبات
// المسار الوحيد: teachers/{teacherId}/students/{studentId}
// ===================================

exports.lookupStudentByCode = onCall(
  {
    region: "us-central1",
    enforceAppCheck: true
  },
  async (request) => {
    const code = String(request.data?.code || "").trim();

    if (!code || code.length > 100 || code.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "يرجى إدخال رمز صحيح."
      );
    }

    try {
      // البحث المباشر داخل مجموعات students فقط.
      const snapshot = await db
        .collectionGroup("students")
        .where("code", "==", code)
        .limit(2)
        .get();

      if (snapshot.empty) {
        throw new HttpsError(
          "not-found",
          "لم يتم العثور على الطالبة."
        );
      }

      // منع وجود رموز مكررة لطالبات مختلفات.
      if (snapshot.size > 1) {
        console.error("Duplicate student code detected.");

        throw new HttpsError(
          "failed-precondition",
          "يوجد تكرار في رمز الطالبة. يرجى مراجعة المعلمة."
        );
      }

      const studentDoc = snapshot.docs[0];
      const student = studentDoc.data();

      // استخراج معرف المعلمة من مسار المستند.
      const teacherDoc = studentDoc.ref.parent.parent;

      if (!teacherDoc || teacherDoc.parent.id !== "teachers") {
        throw new HttpsError(
          "failed-precondition",
          "تعذر التحقق من سجل الطالبة."
        );
      }

      const teacherId = teacherDoc.id;
      const studentId = studentDoc.id;

      return {
        student: {
          studentId,
          teacherId,
          code,
          name: String(student.name || ""),
          points: Number(student.points) || 0,
          message: String(student.message || ""),
          className: String(student.className || ""),
          section: String(student.section || "")
        }
      };

    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      console.error("lookupStudentByCode failed:", error);

      throw new HttpsError(
        "internal",
        "تعذر البحث عن الطالبة حاليًا."
      );
    }
  }
);
