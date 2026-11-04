
/* =========================================================
   نجوم صفي - script.js
   البحث عن الطالبة مباشرة عبر Firestore دون Cloud Functions

   مسارات البيانات:
   studentCodeIndex/{code}
   teachers/{teacherId}/students/{studentId}
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

// الحصول على اتصال Firestore المهيأ في الصفحة.
function getStudentFirestore() {
  if (window.studentDB) {
    return window.studentDB;
  }

  if (window.db) {
    return window.db;
  }

  if (window.firebase?.apps?.length) {
    const defaultApp = window.firebase.apps.find(
      app => app.name === "[DEFAULT]"
    );

    if (defaultApp) {
      return defaultApp.firestore();
    }
  }

  throw new Error("FIRESTORE_NOT_INITIALIZED");
}

function showSearchError(message) {
  const result = getPageElement("result");

  if (result) {
    result.innerHTML = `
      <div class="error">${escapeHtml(message)}</div>
    `;
  }
}

// ===================================
// البحث عن الطالبة عبر Firestore
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

  const code = codeInput.value.trim();

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
    const db = getStudentFirestore();

    // الخطوة الأولى: البحث عن الرمز في فهرس الرموز.
    const indexSnapshot = await db
      .collection("studentCodeIndex")
      .doc(code)
      .get();

    if (!indexSnapshot.exists) {
      showSearchError(
        "لم يتم العثور على طالبة بهذا الرمز. تحققي من الرمز وحاولي مرة أخرى."
      );

      refreshRewards();
      playError();
      return;
    }

    const index = indexSnapshot.data() || {};

    const studentId = index.studentId;
    const teacherId = index.teacherId;

    if (!studentId || !teacherId) {
      console.error(
        "سجل studentCodeIndex لا يحتوي على studentId أو teacherId."
      );

      showSearchError(
        "بيانات الرمز غير مكتملة. يرجى التواصل مع المعلمة."
      );

      refreshRewards();
      playError();
      return;
    }

    // الخطوة الثانية: قراءة بيانات الطالبة من مسارها.
    const studentSnapshot = await db
      .collection("teachers")
      .doc(teacherId)
      .collection("students")
      .doc(studentId)
      .get();

    if (!studentSnapshot.exists) {
      console.error(
        "لم يُعثر على سجل الطالبة في مسار المعلمة."
      );

      showSearchError(
        "عُثر على الرمز، لكن تعذر العثور على بيانات الطالبة. يرجى إبلاغ المعلمة."
      );

      refreshRewards();
      playError();
      return;
    }

    const student = studentSnapshot.data() || {};

    // التأكد من أن الرمز يطابق سجل الطالبة.
    if (String(student.code || "") !== code) {
      console.error(
        "الرمز في الفهرس لا يطابق الرمز في سجل الطالبة."
      );

      showSearchError(
        "بيانات الرمز غير متطابقة. يرجى التواصل مع المعلمة."
      );

      refreshRewards();
      playError();
      return;
    }

    // حفظ بيانات الطالبة.
    window.currentStudentId = studentId;
    window.currentStudentCode = code;
    window.currentStudentName = student.name || "الطالبة";
    window.currentStudentPoints = Number(student.points) || 0;
    window.currentTeacherId = teacherId;

    window.currentStudentClass =
      student.className || index.className || "";

    window.currentStudentSection = String(
      student.section ?? index.section ?? ""
    );

    // عرض بيانات الطالبة.
    result.innerHTML = `
      <div class="student-card">
        <h2>🌟 ${escapeHtml(window.currentStudentName)}</h2>

        <div class="points">
          🏆 مجموع النقاط
          <h1>${window.currentStudentPoints}</h1>
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

        <p>${escapeHtml(student.message || "")}</p>
      </div>
    `;

    playSuccess();
    refreshRewards();

  } catch (error) {
    console.error(
      "تعذر البحث عن الطالبة عبر Firestore:",
      error
    );

    let message =
      "تعذر البحث عن الطالبة حاليًا. يرجى المحاولة لاحقًا.";

    const errorCode = String(error?.code || "");

    if (error.message === "FIRESTORE_NOT_INITIALIZED") {
      message =
        "اتصال Firestore غير مهيأ في هذه الصفحة. تحققي من تحميل ملف Firebase قبل script.js.";

    } else if (errorCode.includes("permission-denied")) {
      message =
        "تعذر عرض بيانات الطالبة بسبب صلاحيات Firestore. يلزم ضبط صلاحيات آمنة للبحث.";

    } else if (errorCode.includes("unavailable")) {
      message =
        "تعذر الاتصال بالخدمة الآن. تحققي من الإنترنت ثم حاولي مجددًا.";
    }

    clearStudentSession();
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

  if (startBtn && !startBtn.dataset.soundBound) {
    startBtn.dataset.soundBound = "true";
    startBtn.addEventListener("click", playClick);
  }

  if (searchBtn && !searchBtn.dataset.soundBound) {
    searchBtn.dataset.soundBound = "true";
    searchBtn.addEventListener("click", playClick);
  }

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

  if (title && !title.dataset.titleSoundBound) {
    title.dataset.titleSoundBound = "true";

    title.addEventListener("click", () => {
      playAudio(titleSound);
    });
  }
}

// ===================================
// إتاحة الدوال لملفات الصفحة
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
// تشغيل إعدادات الصفحة
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
