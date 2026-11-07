
/* =========================================================
   نجوم صفي - script.js

   البحث المباشر عن الطالبة داخل:
   teachers/{teacherId}/students/{studentId}

   لا يستخدم Cloud Functions.
   لا يستخدم studentCodeIndex.
   ========================================================= */

"use strict";

// ===================================
// أصوات منصة نجوم صَفّي
// ===================================

const clappingSound = new Audio("assets/sounds/clapping.mp3");
const clickSound = new Audio("assets/sounds/click.wav");
const magicSound = new Audio("assets/sounds/magic.mp3");
const shineSound = new Audio("assets/sounds/shine.mp3");
const takSound = new Audio("assets/sounds/tak.mp3");

const titleSound = new Audio(
  "assets/sounds/VoicesAI_Miku_Hatsune_ScreenRecording_001252_08092026.mov"
);

// ===================================
// بيانات الطالبة الحالية
// ===================================

window.currentStudentId = null;
window.currentStudentCode = null;
window.currentStudentName = null;
window.currentStudentPoints = 0;
window.currentTeacherId = null;
window.currentStudentClass = "";
window.currentStudentSection = "";

// ===================================
// أدوات مساعدة
// ===================================

function getPageElement(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getStudentDatabase() {
  if (window.db) {
    return window.db;
  }

  if (
    window.firebase &&
    window.firebase.apps &&
    window.firebase.apps.length
  ) {
    const defaultApp = window.firebase.apps.find(
      app => app.name === "[DEFAULT]"
    );

    if (defaultApp) {
      return defaultApp.firestore();
    }
  }

  throw new Error("FIREBASE_NOT_INITIALIZED");
}

// ===================================
// عرض رسائل البحث
// ===================================

function showSearchError(message, details = "") {
  const result = getPageElement("result");

  if (result) {
    result.innerHTML = `
      <div class="error">
        <div>${escapeHtml(message)}</div>

        ${
          details
            ? `
              <div style="
                margin-top: 12px;
                padding: 10px;
                background: #fff3f3;
                border-radius: 8px;
                font-size: 12px;
                direction: ltr;
                text-align: left;
                overflow-wrap: anywhere;
                color: #8b3333;
              ">
                ${escapeHtml(details)}
              </div>
            `
            : ""
        }
      </div>
    `;
  }
}

// ===================================
// البحث المباشر عن الطالبة
// ===================================

async function searchStudent() {

  const codeInput = getPageElement("studentcode");
  const result = getPageElement("result");

  if (!codeInput || !result) {
    console.error(
      "تعذر العثور على حقل رمز الطالبة أو مساحة عرض النتائج."
    );
    return;
  }

  const code = String(codeInput.value || "").trim();

  if (!code) {
    clearStudentSession();
    showSearchError("يرجى إدخال رمز الطالبة.");
    refreshRewards();
    playError();
    return;
  }

  clearStudentSession();

  result.innerHTML = `
    <div class="rewards-loading">
      جارٍ البحث عن الطالبة...
    </div>
  `;

  try {

    const db = getStudentDatabase();

    // =================================
    // البحث المباشر في سجلات الطالبات
    // =================================

    const snapshot = await db
      .collectionGroup("students")
      .where("code", "==", code)
      .limit(2)
      .get();

    // =================================
    // التحقق من وجود الطالبة
    // =================================

    if (snapshot.empty) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    if (snapshot.size > 1) {
      throw new Error("DUPLICATE_STUDENT_CODE");
    }

    const studentDoc = snapshot.docs[0];
    const student = studentDoc.data() || {};

    // =================================
    // تحديد المعلمة المالكة للسجل
    // =================================

    const teacherDoc = studentDoc.ref.parent.parent;

    if (
      !teacherDoc ||
      teacherDoc.parent.id !== "teachers"
    ) {
      throw new Error("INVALID_STUDENT_PATH");
    }

    // =================================
    // التحقق من الرمز
    // =================================

    if (
      String(student.code || "").trim() !== code
    ) {
      throw new Error("STUDENT_CODE_MISMATCH");
    }

    // =================================
    // حفظ بيانات الطالبة
    // =================================

    window.currentStudentId = studentDoc.id;
    window.currentStudentCode = code;
    window.currentStudentName = student.name || "الطالبة";
    window.currentStudentPoints = Number(student.points) || 0;
    window.currentTeacherId = teacherDoc.id;
    window.currentStudentClass = student.className || "";
    window.currentStudentSection = String(
      student.section ?? ""
    );

    // =================================
    // عرض بطاقة الطالبة
    // =================================

    result.innerHTML = `
      <div class="student-card">

        <h2>
          🌟 ${escapeHtml(window.currentStudentName)}
        </h2>

        <div class="points">
          🏆 مجموع النقاط
          <h1>${window.currentStudentPoints}</h1>
        </div>

        ${
          window.currentStudentClass
            ? `
              <p>
                الصف:
                ${escapeHtml(window.currentStudentClass)}
              </p>
            `
            : ""
        }

        ${
          window.currentStudentSection
            ? `
              <p>
                الشعبة:
                ${escapeHtml(window.currentStudentSection)}
              </p>
            `
            : ""
        }

        <p>
          ${escapeHtml(student.message || "")}
        </p>

      </div>
    `;

    playSuccess();
    refreshRewards();

  } catch (error) {

    // =================================
    // تسجيل الخطأ الحقيقي
    // =================================

    console.error(
      "Firestore Search Error:",
      error
    );

    clearStudentSession();

    const errorCode = String(error?.code || "");
    const errorMessage = String(error?.message || "");

    let message =
      "تعذر البحث عن الطالبة حاليًا.";

    let details = "";

    // =================================
    // تحديد نوع الخطأ
    // =================================

    if (
      errorMessage === "FIREBASE_NOT_INITIALIZED"
    ) {

      message =
        "لم يتم الاتصال بقاعدة بيانات Firebase.";

      details =
        "تحققي من تحميل firebase.js قبل script.js.";

    } else if (
      errorMessage === "STUDENT_NOT_FOUND"
    ) {

      message =
        "لم يتم العثور على طالبة بهذا الرمز.";

    } else if (
      errorMessage === "DUPLICATE_STUDENT_CODE"
    ) {

      message =
        "هذا الرمز مرتبط بأكثر من سجل. يرجى مراجعة المعلمة.";

    } else if (
      errorMessage === "INVALID_STUDENT_PATH" ||
      errorMessage === "STUDENT_CODE_MISMATCH"
    ) {

      message =
        "تعذر التحقق من سجل الطالبة.";

    } else if (
      errorCode.includes("permission-denied") ||
      errorCode.includes("unauthenticated")
    ) {

      message =
        "رفضت قواعد Firestore عملية البحث.";

      details = errorMessage;

    } else if (
      errorCode.includes("failed-precondition")
    ) {

      message =
        "الاستعلام يحتاج إلى فهرس في Firestore أو توجد مشكلة في إعداداته.";

      details = errorMessage;

    } else if (
      errorCode.includes("unavailable") ||
      errorCode.includes("deadline-exceeded")
    ) {

      message =
        "تعذر الاتصال بقاعدة البيانات. تحققي من الإنترنت.";

      details = errorMessage;

    } else {

      message =
        "حدث خطأ أثناء البحث. تفاصيل الخطأ:";

      details =
        errorCode + " | " + errorMessage;
    }

    // =================================
    // عرض الخطأ
    // =================================

    showSearchError(message, details);

    refreshRewards();
    playError();
  }
}

// ===================================
// مسح بيانات جلسة الطالبة
// ===================================

function clearStudentSession() {

  window.currentStudentId = null;
  window.currentStudentCode = null;
  window.currentStudentName = null;
  window.currentStudentPoints = 0;
  window.currentTeacherId = null;
  window.currentStudentClass = "";
  window.currentStudentSection = "";
}

// ===================================
// تحديث متجر المكافآت
// ===================================

function refreshRewards() {

  if (typeof window.loadRewards === "function") {

    try {

      const task = window.loadRewards();

      if (
        task &&
        typeof task.catch === "function"
      ) {
        task.catch(error => {
          console.error(
            "تعذر تحديث متجر المكافآت:",
            error
          );
        });
      }

    } catch (error) {

      console.error(
        "تعذر تحديث متجر المكافآت:",
        error
      );
    }
  }
}

// ===================================
// أصوات النجاح والخطأ
// ===================================

function playSuccess() {
  playAudio(clappingSound);
  playAudio(shineSound);
}

function playError() {
  playAudio(takSound);
}

function playClick() {
  playAudio(clickSound);
}

function playMagic() {
  playAudio(magicSound);
}

function playAudio(audio) {

  if (!audio) return;

  try {

    audio.currentTime = 0;

    const playback = audio.play();

    if (
      playback &&
      typeof playback.catch === "function"
    ) {
      playback.catch(error => {
        console.warn(
          "تعذر تشغيل الصوت:",
          error
        );
      });
    }

  } catch (error) {

    console.warn(
      "حدث خطأ أثناء تشغيل الصوت:",
      error
    );
  }
}

// ===================================
// اسم نجم الشهر
// ===================================

function setStarStudent() {

  const starStudent = getPageElement("starStudent");

  if (starStudent) {
    starStudent.textContent = "سيتم تحديده لاحقًا";
  }
}

// ===================================
// إعداد أصوات الصفحة وربط البحث
// ===================================

function setupPageSounds() {

  setStarStudent();

  const startBtn = document.querySelector(".start-btn");
  const searchBtn = document.querySelector(".search-box button");
  const searchForm = getPageElement("studentSearchForm");
  const title = document.querySelector(".hero-title");

  if (
    startBtn &&
    !startBtn.dataset.soundBound
  ) {

    startBtn.dataset.soundBound = "true";
    startBtn.addEventListener("click", playClick);
  }

  if (
    searchBtn &&
    !searchBtn.dataset.soundBound
  ) {

    searchBtn.dataset.soundBound = "true";
    searchBtn.addEventListener("click", playClick);
  }

  if (
    searchForm &&
    !searchForm.dataset.searchBound
  ) {

    searchForm.dataset.searchBound = "true";

    searchForm.addEventListener("submit", event => {

      event.preventDefault();
      searchStudent();

    });

  } else if (
    searchBtn &&
    !searchBtn.dataset.searchBound
  ) {

    searchBtn.dataset.searchBound = "true";

    searchBtn.addEventListener("click", event => {

      event.preventDefault();
      searchStudent();

    });
  }

  if (
    title &&
    !title.dataset.titleSoundBound
  ) {

    title.dataset.titleSoundBound = "true";

    title.addEventListener("click", () => {
      playAudio(titleSound);
    });
  }
}

// ===================================
// إتاحة الدوال لبقية ملفات الموقع
// ===================================

window.searchStudent = searchStudent;
window.escapeHtml = escapeHtml;
window.clearStudentSession = clearStudentSession;
window.refreshRewards = refreshRewards;

window.playSuccess = playSuccess;
window.playError = playError;
window.playClick = playClick;
window.playMagic = playMagic;

// ===================================
// تشغيل الصفحة
// ===================================

if (document.readyState === "loading") {

  document.addEventListener(
    "DOMContentLoaded",
    setupPageSounds,
    { once: true }
  );

} else {

  setupPageSounds();

}
