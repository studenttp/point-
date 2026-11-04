
"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

// ===================================
// البحث عن الطالبة باستخدام الرمز
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
      // البحث في الفهرس المركزي للرموز.
      const indexRef = db
        .collection("studentCodeIndex")
        .doc(code);

      const indexSnapshot = await indexRef.get();

      if (!indexSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "لم يتم العثور على الطالبة."
        );
      }

      const index = indexSnapshot.data();

      const teacherId = index.teacherId;
      const studentId = index.studentId;

      if (
        typeof teacherId !== "string" ||
        typeof studentId !== "string" ||
        !teacherId.trim() ||
        !studentId.trim() ||
        String(index.code || "").trim() !== code
      ) {
        console.error("Invalid student code index.");

        throw new HttpsError(
          "failed-precondition",
          "تعذر التحقق من سجل الطالبة."
        );
      }

      // جلب سجل الطالبة من مجموعة معلمتها.
      const studentRef = db
        .collection("teachers")
        .doc(teacherId)
        .collection("students")
        .doc(studentId);

      const studentSnapshot = await studentRef.get();

      if (!studentSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "لم يتم العثور على الطالبة."
        );
      }

      const student = studentSnapshot.data();

      // التحقق من تطابق الرمز وملكية السجل.
      if (
        String(student.code || "").trim() !== code ||
        (
          student.teacherId &&
          student.teacherId !== teacherId
        )
      ) {
        console.error("Student record does not match its index.");

        throw new HttpsError(
          "failed-precondition",
          "تعذر التحقق من سجل الطالبة."
        );
      }

      // إرجاع البيانات اللازمة لواجهة الطالبة فقط.
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

      console.error(
        "lookupStudentByCode failed:",
        error
      );

      throw new HttpsError(
        "internal",
        "تعذر البحث عن الطالبة حاليًا."
      );
    }
  }
);
