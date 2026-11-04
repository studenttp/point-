
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
// التحقق من وجود عناصر الصفحة
// ===================================

function getPageElement(id) {
  return document.getElementById(id);
}

// ===================================
// البحث عن الطالبة عبر Cloud Functions
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

  // منع البحث برمز فارغ.
  if (!code) {
    clearStudentSession();

    result.innerHTML = `
      <div class="error">
        يرجى إدخال رمز الطالبة.
      </div>
    `;

    refreshRewards();
    playError();
    return;
  }

  // مسح بيانات الطالبة السابقة قبل بدء بحث جديد.
  clearStudentSession();

  result.innerHTML = `
    <div class="rewards-loading">
      جارٍ البحث عن الطالبة...
    </div>
  `;

  try {
    if (
      !window.studentFunctions ||
      typeof window.studentFunctions.httpsCallable !== "function"
    ) {
      throw new Error("CLOUD_FUNCTIONS_NOT_INITIALIZED");
    }

    // استدعاء الدالة السحابية للبحث عن الرمز.
    const lookupStudent = window.studentFunctions.httpsCallable(
      "lookupStudentByCode"
    );

    const response = await lookupStudent({ code });

    const student = response?.data?.student;

    // التحقق من اكتمال البيانات الأساسية.
    if (
      !student ||
      !student.studentId ||
      !student.teacherId ||
      !student.code
    ) {
      result.innerHTML = `
        <div class="error">
          ❌ لم يتم العثور على الطالبة.
          يرجى التأكد من الرمز والمحاولة مرة أخرى.
        </div>
      `;

      refreshRewards();
      playError();
      return;
    }

    // حفظ بيانات الطالبة التي أعادها الخادم.
    window.currentStudentId = student.studentId;
    window.currentStudentCode = student.code;
    window.currentStudentName = student.name || "الطالبة";
    window.currentStudentPoints = Number(student.points) || 0;
    window.currentTeacherId = student.teacherId;
    window.currentStudentClass = student.className || "";
    window.currentStudentSection = student.section || "";

    // عرض بطاقة الطالبة.
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
            ? `<p>الصف: ${escapeHtml(window.currentStudentClass)}</p>`
            : ""
        }

        ${
          window.currentStudentSection
            ? `<p>الشعبة: ${escapeHtml(window.currentStudentSection)}</p>`
            : ""
        }

        <p>${escapeHtml(student.message || "")}</p>
      </div>
    `;

    playSuccess();

    // تحديث المتجر بعد تحديد معلمة الطالبة.
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
    try {
      window.loadRewards();
    } catch (error) {
      console.error("تعذر تحديث متجر المكافآت:", error);
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
    console.warn("حدث خطأ أثناء تشغيل الصوت:", error);
  }
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
  const starStudent = getPageElement("starStudent");

  if (starStudent) {
    starStudent.textContent = "سيتم تحديده لاحقًا";
  }
}

// ===================================
// إعداد أصوات الصفحة
// ===================================

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
    setupPageSounds
  );
} else {
  setupPageSounds();
}
