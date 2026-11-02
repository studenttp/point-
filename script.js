
const clappingSound = new Audio("assets/sounds/clapping.mp3");
const clickSound = new Audio("assets/sounds/click.wav");
const magicSound = new Audio("assets/sounds/magic.mp3");
const shineSound = new Audio("assets/sounds/shine.mp3");
const takSound = new Audio("assets/sounds/tak.mp3");

// ملاحظة: إذا كان الملف الصوتي بصيغة MOV، فقد لا يعمل كصوت في جميع المتصفحات.
// الأفضل تحويله إلى MP3 ووضعه في assets/sounds.
const titleSound = new Audio(
    "assets/sounds/VoicesAI_Miku_Hatsune_ScreenRecording_001252_08092026.mov"
);

// ===================================
// نجوم صفي
// ===================================

// بيانات الطالب الذي قام بتسجيل الدخول
window.currentStudentId = null;
window.currentStudentCode = null;
window.currentStudentName = null;
window.currentStudentPoints = 0;


// ===================================
// البحث عن الطالب
// ===================================

function searchStudent() {

    console.log("البحث يعمل");

    const codeInput = document.getElementById("studentcode");
    const result = document.getElementById("result");

    if (!codeInput || !result) {
        console.error("تعذر العثور على حقل الرمز أو مساحة النتائج.");
        return;
    }

    const code = codeInput.value.trim();

    if (code === "") {

        result.innerHTML = `
            <div class="error">
                يرجى إدخال الرمز.
            </div>
        `;

        clearStudentSession();
        refreshRewards();
        playError();

        return;
    }

    result.innerHTML = `
        <div class="rewards-loading">
            جارٍ البحث عن الطالب...
        </div>
    `;

    db.collection("students")
        .where("code", "==", code)
        .get()

        .then((snapshot) => {

            // =================================
            // الرمز غير صحيح
            // =================================

            if (snapshot.empty) {

                clearStudentSession();

                result.innerHTML = `
                    <div class="error">
                        ❌ الرمز غير صحيح
                    </div>
                `;

                refreshRewards();
                playError();

                return;
            }

            // =================================
            // الطالب موجود
            // =================================

            const doc = snapshot.docs[0];
            const student = doc.data();

            // حفظ بيانات الطالب
            window.currentStudentId = doc.id;
            window.currentStudentCode = student.code || code;
            window.currentStudentName = student.name || "الطالب";
            window.currentStudentPoints = Number(student.points) || 0;

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

                    <p>
                        ${escapeHtml(student.message || "")}
                    </p>

                </div>
            `;

            playSuccess();

            // تحديث متجر المكافآت
            refreshRewards();

        })

        .catch((error) => {

            console.error("خطأ في البحث عن الطالب:", error);

            clearStudentSession();

            result.innerHTML = `
                <div class="error">
                    ⚠️ حدث خطأ أثناء البحث.
                    يرجى المحاولة مرة أخرى.
                </div>
            `;

            refreshRewards();

        });

}


// =====================================
// مسح بيانات الطالب الحالي
// =====================================

function clearStudentSession() {

    window.currentStudentId = null;
    window.currentStudentCode = null;
    window.currentStudentName = null;
    window.currentStudentPoints = 0;

}


// =====================================
// تحديث متجر المكافآت عند الحاجة
// =====================================

function refreshRewards() {

    if (typeof window.loadRewards === "function") {
        window.loadRewards();
    }

}


// =====================================
// أصوات النجاح والخطأ
// =====================================

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


// =====================================
// حماية النصوص
// =====================================

function escapeHtml(text) {

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =====================================
// تغيير اسم نجم الشهر
// =====================================

function setStarStudent() {

    const starStudent = document.getElementById("starStudent");

    if (starStudent) {
        starStudent.textContent = "سيتم تحديده لاحقًا";
    }

}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", setStarStudent);

} else {

    setStarStudent();

}


// =====================================
// صوت زر البداية
// =====================================

const startBtn = document.querySelector(".start-btn");

if (startBtn) {

    startBtn.addEventListener("click", () => {

        clickSound.currentTime = 0;
        clickSound.play().catch(() => {});

    });

}


// =====================================
// صوت زر البحث
// =====================================

const searchBtn = document.querySelector(".search-box button");

if (searchBtn) {

    searchBtn.addEventListener("click", () => {

        clickSound.currentTime = 0;
        clickSound.play().catch(() => {});

    });

}


// =====================================
// جعل الدالة متاحة للزر
// =====================================

window.searchStudent = searchStudent;
window.escapeHtml = escapeHtml;


// =====================================
// صوت عنوان نجوم صفي
// =====================================

function setupTitleSound() {

    const title = document.querySelector(".hero-title");

    if (title) {

        title.addEventListener("click", () => {

            titleSound.currentTime = 0;

            titleSound.play().catch((error) => {
                console.warn("تعذر تشغيل صوت العنوان:", error);
            });

        });

    }

}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", setupTitleSound);

} else {

    setupTitleSound();

}
