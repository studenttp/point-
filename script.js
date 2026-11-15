
/* =========================================================
   نجوم صفي - script.js
   البحث عن الطالب في سجلات جميع المعلمات
   عرض المواد في بطاقات مستقلة
   Firebase Compat SDK
   ========================================================= */

"use strict";

/* -------------------- الأصوات -------------------- */

const clappingSound = new Audio("assets/sounds/clapping.mp3");
const clickSound = new Audio("assets/sounds/click.wav");
const magicSound = new Audio("assets/sounds/magic.mp3");
const shineSound = new Audio("assets/sounds/shine.mp3");
const takSound = new Audio("assets/sounds/tak.mp3");

const titleSound = new Audio(
  "assets/sounds/VoicesAI_Miku_Hatsune_ScreenRecording_001252_08092026.mov"
);

/* -------------------- بيانات الطالب -------------------- */

window.currentStudentId = null;
window.currentStudentCode = null;
window.currentStudentName = null;
window.currentStudentPoints = 0;
window.currentTeacherId = null;
window.currentStudentClass = "";
window.currentStudentSection = "";
window.currentStudentSubjects = [];

/* -------------------- أدوات مساعدة -------------------- */

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

/*
  توحيد كتابة الاسم للمقارنة فقط.
  لا يغيّر الاسم الأصلي المخزن أو المعروض.
*/
function normalizeStudentName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "") // إزالة التشكيل
    .replace(/\u0640/g, "")                // إزالة التطويل
    .replace(/[\u200B-\u200F\uFEFF]/g, "") // إزالة المحارف الخفية
    .replace(/[أإآٱ]/g, "ا")               // توحيد الألف
    .replace(/ى/g, "ي")                    // توحيد الألف المقصورة
    .replace(/\s+/g, " ")                  // توحيد المسافات
    .toLowerCase();
}

function getStudentDatabase() {
  if (window.db) return window.db;

  if (window.firebase?.apps?.length) {
    const app = window.firebase.apps.find(
      item => item.name === "[DEFAULT]"
    );

    if (app) return app.firestore();
  }

  throw new Error("FIREBASE_NOT_INITIALIZED");
}

/* -------------------- رسائل البحث -------------------- */

function showSearchError(message, details = "") {
  const result = getPageElement("result");
  if (!result) return;

  result.innerHTML = `
    <div class="error">
      <div>${escapeHtml(message)}</div>

      ${details ? `
        <div style="
          margin-top:12px;
          padding:10px;
          background:#fff3f3;
          border-radius:8px;
          font-size:12px;
          direction:rtl;
          text-align:right;
          overflow-wrap:anywhere;
        ">${escapeHtml(details)}</div>
      ` : ""}
    </div>
  `;
}

/* -------------------- تنظيف الجلسة -------------------- */

function clearStudentSession() {
  window.currentStudentId = null;
  window.currentStudentCode = null;
  window.currentStudentName = null;
  window.currentStudentPoints = 0;
  window.currentTeacherId = null;
  window.currentStudentClass = "";
  window.currentStudentSection = "";
  window.currentStudentSubjects = [];

  const oldStar = getPageElement("starStudent");

  if (oldStar) {
    oldStar.textContent = "سيتم تحديده لاحقًا";
  }

  const rewards = getPageElement("rewardsList");

  if (rewards) {
    rewards.innerHTML = `
      <div class="rewards-loading">
        أدخل رمز الطالب لعرض المكافآت.
      </div>
    `;
  }
}

/* =========================================================
   عرض بطاقة مادة واحدة
   ========================================================= */

function renderSubjectCard(subject, index) {
  const points = Number(subject.points) || 0;

  const subjectName = subject.subjectName || "لم تُحدد المادة";
  const teacherName = subject.teacherName || "المعلمة";

  return `
    <article
      class="subject-card"
      data-teacher-id="${escapeHtml(subject.teacherId)}"
      data-subject-index="${index}"
    >

      <header class="subject-card-header">
        <div class="subject-icon">📚</div>

        <div>
          <h2>${escapeHtml(subjectName)}</h2>
          <p>${escapeHtml(teacherName)}</p>
        </div>
      </header>

      <div class="subject-student-name">
        ⭐ ${escapeHtml(subject.name)}
      </div>

      <div class="subject-points">
        <span>رصيد النقاط في المادة</span>
        <strong>${points}</strong>
        <small>نقطة</small>
      </div>

      <div class="subject-message">
        <h3>💌 رسالة المعلمة</h3>

        <p>
          ${escapeHtml(
            subject.message || "لم تضف المعلمة رسالة بعد."
          )}
        </p>
      </div>

      <section class="subject-monthly-star">
        <h3>🏆 نجم الشهر</h3>

        <p id="subject-star-${index}">
          جارٍ تحميل نجم الشهر...
        </p>
      </section>

      <section class="subject-rewards">
        <h3>🎁 متجر مكافآت المادة</h3>

        <div
          id="subject-rewards-${index}"
          class="subject-rewards-list"
        >
          <p>سيتم تحميل المكافآت...</p>
        </div>
      </section>

    </article>
  `;
}

/* =========================================================
   تحميل نجم الشهر لكل مادة
   ========================================================= */

async function loadSubjectMonthlyStar(subject, index) {
  const target = getPageElement(`subject-star-${index}`);

  if (!target) return;

  try {
    const db = getStudentDatabase();

    const docId =
      encodeURIComponent(subject.className) +
      "__" +
      encodeURIComponent(String(subject.section));

    const snapshot = await db
      .collection("teachers")
      .doc(subject.teacherId)
      .collection("monthlyStars")
      .doc(docId)
      .get();

    if (!snapshot.exists) {
      target.textContent = "لم يتم تحديد نجم الشهر بعد.";
      return;
    }

    const star = snapshot.data() || {};

    target.textContent =
      "🌟 " + (star.studentName || "نجم الشهر");

  } catch (error) {
    console.error(
      "[نجوم صفي] خطأ تحميل نجم الشهر:",
      error
    );

    target.textContent = "تعذر تحميل نجم الشهر.";
  }
}

/* =========================================================
   تحميل مكافآت مادة واحدة
   ========================================================= */

async function loadSubjectRewards(subject, index) {
  const target = getPageElement(`subject-rewards-${index}`);

  if (!target) return;

  try {
    const db = getStudentDatabase();

    const snapshot = await db
      .collection("teachers")
      .doc(subject.teacherId)
      .collection("rewards")
      .get();

    const rewards = snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .filter(reward =>
        reward.active !== false &&
        String(reward.className || "") ===
          String(subject.className) &&
        String(reward.section ?? "") ===
          String(subject.section)
      );

    if (!rewards.length) {
      target.innerHTML = `
        <p>لا توجد مكافآت متاحة حاليًا.</p>
      `;
      return;
    }

    target.innerHTML = rewards.map(reward => {
      const price = Number(reward.price) || 0;
      const enoughPoints =
        Number(subject.points) >= price;

      return `
        <div class="reward-card">

          <div class="reward-icon">
            ${escapeHtml(reward.icon || "🎁")}
          </div>

          <h3>
            ${escapeHtml(reward.name || "مكافأة")}
          </h3>

          <p>
            ${escapeHtml(reward.description || "")}
          </p>

          <div class="reward-price">
            ⭐ ${price} نقطة
          </div>

          ${
            enoughPoints
              ? `
                <button
                  type="button"
                  class="redeem"
                  data-reward-id="${escapeHtml(reward.id)}"
                  data-subject-index="${index}"
                >
                  🎁 طلب المكافأة
                </button>
              `
              : `
                <button
                  type="button"
                  class="locked"
                  disabled
                >
                  🔒 نقاط غير كافية
                </button>
              `
          }

        </div>
      `;
    }).join("");

  } catch (error) {
    console.error(
      "[نجوم صفي] خطأ تحميل مكافآت المادة:",
      error
    );

    target.innerHTML = `
      <p>تعذر تحميل مكافآت المادة.</p>
    `;
  }
}

/* =========================================================
   عرض جميع المواد
   ========================================================= */

function renderStudentSubjects(subjects) {
  const result = getPageElement("result");

  if (!result) return;

  const totalPoints = subjects.reduce(
    (sum, subject) =>
      sum + (Number(subject.points) || 0),
    0
  );

  result.innerHTML = `
    <div class="student-overview">

      <h2>
        🌟 أهلًا ${escapeHtml(window.currentStudentName)}
      </h2>

      <p>
        هذه إنجازاتك في جميع المواد.
      </p>

      <div class="total-points">
        <span>إجمالي نقاطك في جميع المواد</span>

        <strong>${totalPoints}</strong>

        <small>للعرض فقط</small>
      </div>

    </div>

    <div class="subjects-grid">
      ${subjects.map((subject, index) =>
        renderSubjectCard(subject, index)
      ).join("")}
    </div>
  `;

  subjects.forEach((subject, index) => {
    loadSubjectMonthlyStar(subject, index);
    loadSubjectRewards(subject, index);
  });
}

/* =========================================================
   البحث بالرمز الموحد
   ========================================================= */

async function searchStudent() {
  const input = getPageElement("studentcode");
  const result = getPageElement("result");

  if (!input || !result) return;

  const code = String(input.value || "").trim();

  if (!code) {
    clearStudentSession();
    showSearchError("يرجى إدخال رمز الطالب.");
    playError();
    return;
  }

  clearStudentSession();

  result.innerHTML = `
    <div class="rewards-loading">
      ⏳ جارٍ البحث عن بيانات الطالب في جميع المواد...
    </div>
  `;

  try {
    const db = getStudentDatabase();

    // البحث عن جميع سجلات الرمز لدى المعلمات
    const snapshot = await db
      .collectionGroup("students")
      .where("code", "==", code)
      .get();

    if (snapshot.empty) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    const subjects = [];

    for (const studentDoc of snapshot.docs) {
      const student = studentDoc.data() || {};

      const teacherDoc = studentDoc.ref.parent.parent;

      // التأكد من أن السجل تابع لمجموعة المعلمات
      if (
        !teacherDoc ||
        teacherDoc.parent.id !== "teachers"
      ) {
        continue;
      }

      // التأكد من تطابق الرمز
      if (String(student.code || "").trim() !== code) {
        continue;
      }

      const originalName = String(
        student.name || ""
      ).trim();

      if (!originalName) continue;

      const subjectName = String(
        student.subjectName || ""
      ).trim();

      subjects.push({
        id: studentDoc.id,
        teacherId: teacherDoc.id,

        name: originalName,
        normalizedName: normalizeStudentName(originalName),

        code,

        points: Number(student.points) || 0,

        className: student.className || "",
        section: String(student.section ?? ""),

        message: student.message || "",

        subjectName:
          subjectName || "لم تُحدد المادة",

        teacherName:
          student.teacherName || "المعلمة"
      });
    }

    if (!subjects.length) {
      throw new Error("STUDENT_NOT_FOUND");
    }

    /*
      التحقق من الاسم بعد توحيد طريقة الكتابة.
      اختلاف الهمزات أو التشكيل أو المسافات
      لن يؤدي إلى اعتبار السجلات لطالبات مختلفات.
    */

    const normalizedNames = [
      ...new Set(
        subjects
          .map(item => item.normalizedName)
          .filter(Boolean)
      )
    ];

    if (normalizedNames.length > 1) {
      const differentNames = [
        ...new Set(subjects.map(item => item.name))
      ];

      const conflictError = new Error(
        "STUDENT_NAME_CONFLICT"
      );

      conflictError.details =
        "الأسماء المسجلة: " + differentNames.join(" — ");

      throw conflictError;
    }

    // منع تكرار السجل نفسه إن ظهر أكثر من مرة
    const uniqueSubjects = [
      ...new Map(
        subjects.map(subject => [
          `${subject.teacherId}_${subject.id}`,
          subject
        ])
      ).values()
    ];

    // حفظ بيانات الطالب
    window.currentStudentCode = code;

    window.currentStudentId =
      uniqueSubjects[0].id;

    // الاحتفاظ بالاسم الأصلي للعرض
    window.currentStudentName =
      uniqueSubjects[0].name;

    // هذا الإجمالي للعرض فقط
    window.currentStudentPoints =
      uniqueSubjects.reduce(
        (sum, item) => sum + item.points,
        0
      );

    window.currentTeacherId =
      uniqueSubjects[0].teacherId;

    window.currentStudentClass =
      uniqueSubjects[0].className;

    window.currentStudentSection =
      uniqueSubjects[0].section;

    window.currentStudentSubjects =
      uniqueSubjects;

    renderStudentSubjects(uniqueSubjects);

    playSuccess();

  } catch (error) {
    console.error(
      "[نجوم صفي] خطأ البحث:",
      error
    );

    clearStudentSession();

    let message = "حدث خطأ أثناء البحث.";
    let details = error.details || error.message || "";

    if (error.message === "FIREBASE_NOT_INITIALIZED") {
      message =
        "تعذر الاتصال بقاعدة بيانات Firebase.";
      details = "";

    } else if (error.message === "STUDENT_NOT_FOUND") {
      message =
        "لم يتم العثور على طالب بهذا الرمز.";
      details = "";

    } else if (
      error.message === "STUDENT_NAME_CONFLICT"
    ) {
      message =
        "توجد اختلافات فعلية في أسماء السجلات المرتبطة بهذا الرمز. يرجى مراجعة الأسماء التالية.";
      
    } else if (error.code === "permission-denied") {
      message =
        "قواعد Firestore لا تسمح بالبحث عن سجلات المواد.";

    } else if (
      error.code === "failed-precondition"
    ) {
      message =
        "قد يحتاج البحث إلى فهرس في Firestore.";
    }

    showSearchError(message, details);

    playError();
  }
}

/* =========================================================
   أصوات الموقع
   ========================================================= */

function playAudio(audio) {
  if (!audio) return;

  try {
    audio.currentTime = 0;

    const playback = audio.play();

    if (playback?.catch) {
      playback.catch(error =>
        console.warn(
          "[نجوم صفي] تعذر تشغيل الصوت:",
          error
        )
      );
    }

  } catch (error) {
    console.warn(
      "[نجوم صفي] خطأ تشغيل الصوت:",
      error
    );
  }
}

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

/* =========================================================
   أحداث الصفحة والأصوات
   ========================================================= */

function setupPageSounds() {
  const startBtn =
    document.querySelector(".start-btn");

  const searchBtn =
    document.querySelector(".search-box button");

  const title =
    document.querySelector(".hero-title");

  if (startBtn && !startBtn.dataset.soundBound) {
    startBtn.dataset.soundBound = "true";
    startBtn.addEventListener("click", playClick);
  }

  if (searchBtn && !searchBtn.dataset.searchBound) {
    searchBtn.dataset.searchBound = "true";

    searchBtn.addEventListener("click", event => {
      event.preventDefault();
      playClick();
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

/* =========================================================
   أزرار طلب المكافآت
   ========================================================= */

document.addEventListener("click", event => {
  const button = event.target.closest(
    "[data-reward-id]"
  );

  if (!button) return;

  const index = Number(
    button.dataset.subjectIndex
  );

  const subject =
    window.currentStudentSubjects[index];

  if (!subject) return;

  const rewardId = button.dataset.rewardId;

  if (typeof window.redeemSubjectReward === "function") {
    window.redeemSubjectReward(
      subject,
      rewardId,
      button
    );

    return;
  }

  alert(
    "سيتم تفعيل إرسال طلب المكافأة لهذه المادة بعد تحديث ملف rewards.js."
  );
});

/* =========================================================
   إتاحة الدوال لبقية الملفات
   ========================================================= */

window.searchStudent = searchStudent;
window.escapeHtml = escapeHtml;
window.normalizeStudentName = normalizeStudentName;
window.clearStudentSession = clearStudentSession;

window.renderStudentSubjects = renderStudentSubjects;
window.loadSubjectMonthlyStar = loadSubjectMonthlyStar;
window.loadSubjectRewards = loadSubjectRewards;

window.playSuccess = playSuccess;
window.playError = playError;
window.playClick = playClick;
window.playMagic = playMagic;

/* =========================================================
   تشغيل الصفحة
   ========================================================= */

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setupPageSounds,
    { once: true }
  );
} else {
  setupPageSounds();
}
