
/* =========================================================
   نجوم صفي - script.js

   البحث الآمن عن الطالبة عبر Firebase Cloud Functions.

   مصدر البيانات الوحيد:
   teachers/{teacherId}/students/{studentId}

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

// ===================================
// الاتصال بـ Firebase Cloud Functions
// ===================================

function getStudentFunctions() {
  // استخدام الخدمة المهيأة في firebase.js.
  if (window.studentFunctions) {
    return window.studentFunctions;
  }

  // محاولة الحصول على الخدمة من التطبيق الافتراضي.
  if (
    window.firebase &&
    window.firebase.apps &&
    window.firebase.apps.length
  ) {
    const defaultApp = window.firebase.apps.find(
      app => app.name === "[DEFAULT]"
    );

    if (defaultApp) {
      return defaultApp.functions("us-central1");
    }
  }

  throw new Error("FIREBASE_FUNCTIONS_NOT_INITIALIZED");
}

// ===================================
// عرض رسائل البحث
// ===================================

function showSearchError(message) {
  const result = getPageElement("result");

  if (result) {
    result.innerHTML = `
      <div class="error">${escapeHtml(message)}</div>
    `;
  }
}

// ===================================
// البحث عن الطالبة
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

  // قراءة رمز الطالبة.
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
    // الحصول على Firebase Functions.
    const functions = getStudentFunctions();

    // استدعاء دالة البحث الآمن.
    const lookupStudent = functions.httpsCallable(
      "lookupStudentByCode"
    );

    // إرسال الرمز إلى الخادم.
    const response = await lookupStudent({
      code: code
    });

    // قراءة النتيجة.
    const student = response?.data?.student;

    if (!student || !student.studentId || !student.teacherId) {
      throw new Error("INVALID_STUDENT_RESPONSE");
    }

    // التأكد من تطابق الرمز.
    if (String(student.code || "").trim() !== code) {
      throw new Error("STUDENT_CODE_MISMATCH");
    }

    // =================================
    // حفظ بيانات الطالبة
    // =================================

    window.currentStudentId = student.studentId;
    window.currentStudentCode = code;
    window.currentStudentName = student.name || "الطالبة";
    window.currentStudentPoints = Number(student.points) || 0;
    window.currentTeacherId = student.teacherId;

    window.currentStudentClass = student.className || "";

    window.currentStudentSection = String(
      student.section ?? ""
    );

    // =================================
    // عرض بيانات الطالبة
    // =================================

    result.innerHTML = `
      <div class="student-card">

        <h2>
          🌟 ${escapeHtml(window.currentStudentName)}
        </h2>

        <div class="points">
          🏆 مجموع النقاط

          <h1>
            ${window.currentStudentPoints}
          </h1>
        </div>

        ${
          window.currentStudentClass
            ? `<p>الصف: ${escapeHtml(
                window.currentStudentClass
              )}</p>`
            : ""
        }

        ${
          window.currentStudentSection
            ? `<p>الشعبة: ${escapeHtml(
                window.currentStudentSection
              )}</p>`
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
    // معالجة الأخطاء
    // =================================

    console.error("خطأ البحث بالتفصيل:", error);

    clearStudentSession();

    const errorCode = String(error?.code || "");
    let message =
      "تعذر البحث عن الطالبة حاليًا. يرجى المحاولة مرة أخرى.";

    if (error.message === "FIREBASE_FUNCTIONS_NOT_INITIALIZED") {
      message =
        "خدمة البحث غير مهيأة. تحققي من تحميل ملف Firebase وإعداد Cloud Functions.";

    } else if (error.message === "INVALID_STUDENT_RESPONSE") {
      message =
        "وصلت استجابة غير مكتملة من قاعدة البيانات. يرجى مراجعة المعلمة.";

    } else if (error.message === "STUDENT_CODE_MISMATCH") {
      message =
        "تعذر التحقق من رمز الطالبة. يرجى مراجعة المعلمة.";

    } else if (
      errorCode.includes("not-found") ||
      errorCode.includes("functions/not-found")
    ) {
      message =
        "لم يتم العثور على طالبة بهذا الرمز. تحققي من الرمز وحاولي مرة أخرى.";

    } else if (
      errorCode.includes("invalid-argument")
    ) {
      message =
        "رمز الطالبة غير صحيح. تحققي من الرمز وحاولي مرة أخرى.";

    } else if (
      errorCode.includes("failed-precondition")
    ) {
      message =
        error.message ||
        "تعذر التحقق من سجل الطالبة. يرجى مراجعة المعلمة.";

    } else if (
      errorCode.includes("unauthenticated") ||
      errorCode.includes("permission-denied")
    ) {
      message =
        "تعذر التحقق من صلاحية طلب البحث. تحققي من إعدادات Firebase App Check.";

    } else if (
      errorCode.includes("unavailable") ||
      errorCode.includes("deadline-exceeded")
    ) {
      message =
        "تعذر الاتصال بالخدمة. تحققي من الإنترنت ثم حاولي مجددًا.";

    } else if (
      errorCode.includes("internal")
    ) {
      message =
        "حدث خطأ في خدمة البحث. يرجى المحاولة لاحقًا.";

    } else if (
      errorCode.includes("app-check")
    ) {
      message =
        "تعذر التحقق من التطبيق. تحققي من إعدادات Firebase App Check.";
    }

    showSearchError(message);

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

      if (task && typeof task.catch === "function") {
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

    if (playback && typeof playback.catch === "function") {
      playback.catch(error => {
        console.warn("تعذر تشغيل الصوت:", error);
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

  // صوت زر البداية.
  if (startBtn && !startBtn.dataset.soundBound) {
    startBtn.dataset.soundBound = "true";
    startBtn.addEventListener("click", playClick);
  }

  // صوت زر البحث.
  if (searchBtn && !searchBtn.dataset.soundBound) {
    searchBtn.dataset.soundBound = "true";
    searchBtn.addEventListener("click", playClick);
  }

  // ربط البحث بالنموذج.
  if (searchForm && !searchForm.dataset.searchBound) {
    searchForm.dataset.searchBound = "true";

    searchForm.addEventListener("submit", event => {
      event.preventDefault();
      searchStudent();
    });

  } else if (searchBtn && !searchBtn.dataset.searchBound) {

    searchBtn.dataset.searchBound = "true";

    searchBtn.addEventListener("click", event => {
      event.preventDefault();
      searchStudent();
    });
  }

  // صوت عنوان الموقع.
  if (title && !title.dataset.titleSoundBound) {
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
