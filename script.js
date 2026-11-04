
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
// البحث عن الطالبة عبر خدمة الخادم
// ===================================

async function searchStudent() {
  const codeInput = document.getElementById("studentcode");
  const result = document.getElementById("result");

  if (!codeInput || !result) {
    console.error("تعذر العثور على حقل الرمز أو مساحة النتائج.");
    return;
  }

  const code = codeInput.value.trim();

  if (!code) {
    clearStudentSession();

    result.innerHTML = `
      <div class="error">يرجى إدخال رمز الطالبة.</div>
    `;

    refreshRewards();
    playError();
    return;
  }

  result.innerHTML = `
    <div class="rewards-loading">جارٍ البحث عن الطالبة...</div>
  `;

  try {
    if (!window.studentFunctions) {
      throw new Error("CLOUD_FUNCTIONS_NOT_INITIALIZED");
    }

    const lookupStudent = window.studentFunctions
      .httpsCallable("lookupStudentByCode");

    const response = await lookupStudent({ code });
    const student = response.data?.student;

    if (!student || !student.studentId || !student.teacherId) {
      clearStudentSession();

      result.innerHTML = `
        <div class="error">❌ لم يتم العثور على الطالبة.</div>
      `;

      refreshRewards();
      playError();
      return;
    }

    window.currentStudentId = student.studentId;
    window.currentStudentCode = student.code || code;
    window.currentStudentName = student.name || "الطالبة";
    window.currentStudentPoints = Number(student.points) || 0;
    window.currentTeacherId = student.teacherId;
    window.currentStudentClass = student.className || "";
    window.currentStudentSection = student.section || "";

    result.innerHTML = `
      <div class="student-card">
        <h2>🌟 ${escapeHtml(window.currentStudentName)}</h2>

        <div class="points">
          🏆 مجموع النقاط
          <h1>${window.currentStudentPoints}</h1>
        </div>

        <p>${escapeHtml(student.message || "")}</p>
      </div>
    `;

    playSuccess();
    refreshRewards();

  } catch (error) {
    console.error("تعذر البحث عن الطالبة:", error);

    clearStudentSession();

    result.innerHTML = `
      <div class="error">
        ⚠️ تعذر البحث عن الطالبة حاليًا.
        يرجى المحاولة لاحقًا.
      </div>
    `;

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
    window.loadRewards();
  }
}

// ===================================
// أصوات النجاح والخطأ
// ===================================

function playSuccess() {
  clappingSound.currentTime = 0;
  clappingSound.play().catch(() => {});

  shineSound.currentTime = 0;
  shineSound.play().catch(() => {});
}

function playError() {
  takSound.currentTime = 0;
  takSound.play().catch(() => {});
}

// ===================================
// حماية النصوص من HTML
// ===================================

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ===================================
// اسم نجم الشهر
// ===================================

function setStarStudent() {
  const starStudent = document.getElementById("starStudent");

  if (starStudent) {
    starStudent.textContent = "سيتم تحديده لاحقًا";
  }
}

// ===================================
// الأصوات عند الضغط على الأزرار
// ===================================

function playClick() {
  clickSound.currentTime = 0;
  clickSound.play().catch(() => {});
}

function setupPageSounds() {
  setStarStudent();

  const startBtn = document.querySelector(".start-btn");
  const searchBtn = document.querySelector(".search-box button");
  const title = document.querySelector(".hero-title");

  if (startBtn) {
    startBtn.addEventListener("click", playClick);
  }

  if (searchBtn) {
    searchBtn.addEventListener("click", playClick);
  }

  if (title) {
    title.addEventListener("click", () => {
      titleSound.currentTime = 0;
      titleSound.play().catch((error) => {
        console.warn("تعذر تشغيل صوت العنوان:", error);
      });
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupPageSounds);
} else {
  setupPageSounds();
}
