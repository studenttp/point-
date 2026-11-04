
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

    if (!code || code.length > 100) {
      throw new HttpsError(
        "invalid-argument",
        "يرجى إدخال رمز صحيح."
      );
    }

    try {
      // فهرس الرمز: studentCodeIndex/{code}
      const indexRef = db.collection("studentCodeIndex").doc(code);
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
        !teacherId ||
        !studentId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "بيانات ربط الرمز غير مكتملة."
        );
      }

      const studentRef = db
        .collection("teachers")
        .doc(teacherId)
        .collection("students")
        .doc(studentId);

      const studentSnapshot = await studentRef.get();

      if (!studentSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "لم يتم العثور على سجل الطالبة."
        );
      }

      const student = studentSnapshot.data();

      // التأكد من تطابق الرمز مع سجل الطالبة.
      if (String(student.code || "").trim() !== code) {
        throw new HttpsError(
          "failed-precondition",
          "رمز الطالبة غير متطابق مع السجل."
        );
      }

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
        "تعذر البحث عن الطالبة."
      );
    }
  }
);
