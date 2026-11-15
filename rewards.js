
"use strict";

// =====================================
// نجوم صفي - متجر مكافآت الطالبات
// إصدار متعدد المواد
// Firebase Compat SDK
// =====================================

/*
  يعتمد على بيانات الطالب الموجودة في script.js:

  currentStudentId
  currentStudentCode
  currentStudentName
  currentStudentPoints
  currentTeacherId
  currentStudentClass
  currentStudentSection
  currentStudentSubjects

  كل مادة لها:
  - معلمة مستقلة
  - رصيد نقاط مستقل
  - متجر مكافآت مستقل
  - طلبات استبدال مستقلة
*/

// =====================================
// أدوات مساعدة
// =====================================

function getRewardsDB() {
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

function rewardElement(id) {
    return document.getElementById(id);
}

function rewardEscape(text) {
    if (typeof window.escapeHtml === "function") {
        return window.escapeHtml(text);
    }

    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getRewardStudent() {
    return {
        id: window.currentStudentId,
        code: window.currentStudentCode,
        name: window.currentStudentName,
        points: Number(window.currentStudentPoints) || 0,
        teacherId: window.currentTeacherId,
        className: window.currentStudentClass || "",
        section: String(window.currentStudentSection ?? "")
    };
}

// الحصول على مرجع مكافآت معلمة محددة
function getTeacherRewardsRef(teacherId) {
    if (!teacherId) {
        throw new Error("STUDENT_NOT_FOUND");
    }

    return getRewardsDB()
        .collection("teachers")
        .doc(teacherId)
        .collection("rewards");
}

// الحصول على مرجع طلبات معلمة محددة
function getTeacherRequestsRef(teacherId) {
    if (!teacherId) {
        throw new Error("STUDENT_NOT_FOUND");
    }

    return getRewardsDB()
        .collection("teachers")
        .doc(teacherId)
        .collection("rewardRequests");
}

// =====================================
// تحميل المتجر القديم للتوافق
// =====================================

async function loadRewards() {
    const list = rewardElement("rewardsList");

    if (!list) {
        return;
    }

    list.innerHTML = `
        <div class="message">
            ⏳ جاري تحميل المكافآت...
        </div>
    `;

    try {
        const subjects = window.currentStudentSubjects || [];

        if (!subjects.length) {
            list.innerHTML = `
                <div class="message">
                    🔐 أدخلي رمز الطالبة أولًا لعرض المكافآت.
                </div>
            `;
            return;
        }

        // عرض مكافآت أول مادة فقط في الحاوية القديمة
        // المتجر الأساسي متعدد المواد موجود داخل بطاقات المواد
        const subject = subjects[0];

        const snapshot = await getTeacherRewardsRef(
            subject.teacherId
        ).get();

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
            list.innerHTML = `
                <div class="message">
                    🎁 لا توجد مكافآت متاحة حاليًا.
                </div>
            `;
            return;
        }

        list.innerHTML = rewards.map(reward => {
            const price = Number(reward.price) || 0;
            const canRedeem = Number(subject.points) >= price;

            return `
                <div class="reward-card">

                    <div class="reward-icon">
                        ${rewardEscape(reward.icon || "🎁")}
                    </div>

                    <h3>
                        ${rewardEscape(reward.name || "مكافأة")}
                    </h3>

                    <p class="reward-description">
                        ${rewardEscape(reward.description || "")}
                    </p>

                    <div class="reward-price">
                        ⭐ ${price} نقطة
                    </div>

                    ${
                        canRedeem
                        ? `
                            <button
                                class="redeem"
                                type="button"
                                data-reward-id="${rewardEscape(reward.id)}"
                                data-subject-index="0">
                                🎁 طلب المكافأة
                            </button>
                        `
                        : `
                            <button
                                class="locked"
                                type="button"
                                disabled>
                                🔒 نقاط غير كافية
                            </button>
                        `
                    }

                </div>
            `;
        }).join("");

    } catch (error) {
        console.error(
            "[نجوم صفي] خطأ تحميل المكافآت:",
            error
        );

        list.innerHTML = `
            <div class="message">
                تعذر تحميل المكافآت حاليًا.
            </div>
        `;
    }
}

// =====================================
// إرسال طلب مكافأة لمادة محددة
// =====================================

async function redeemSubjectReward(
    subject,
    rewardId,
    button = null
) {
    if (!subject || !rewardId) {
        alert("تعذر تحديد المادة أو المكافأة.");
        return;
    }

    if (button && button.disabled) {
        return;
    }

    const originalText = button?.textContent || "";

    try {
        const code = window.currentStudentCode;
        const studentName = window.currentStudentName;

        if (!code || !studentName || !subject.id) {
            throw new Error("STUDENT_NOT_FOUND");
        }

        if (
            !subject.teacherId ||
            !subject.className ||
            !subject.section
        ) {
            throw new Error("STUDENT_SUBJECT_DATA_MISSING");
        }

        if (button) {
            button.disabled = true;
            button.textContent = "⏳ جارٍ إرسال الطلب...";
        }

        const db = getRewardsDB();

        // المعلمة المرتبطة بهذه المادة فقط
        const rewardsRef = getTeacherRewardsRef(
            subject.teacherId
        );

        const rewardRef = rewardsRef.doc(rewardId);

        const rewardSnapshot = await rewardRef.get();

        if (!rewardSnapshot.exists) {
            throw new Error("REWARD_NOT_FOUND");
        }

        const reward = rewardSnapshot.data() || {};

        // التأكد من أن المكافأة تخص المعلمة والصف والشعبة
        if (
            reward.active === false ||
            String(reward.teacherId || subject.teacherId) !==
                String(subject.teacherId) ||
            String(reward.className || "") !==
                String(subject.className) ||
            String(reward.section ?? "") !==
                String(subject.section)
        ) {
            throw new Error("REWARD_NOT_AVAILABLE");
        }

        const price = Number(reward.price);

        if (
            !Number.isSafeInteger(price) ||
            price <= 0
        ) {
            throw new Error("INVALID_REWARD_PRICE");
        }

        // رصيد هذه المادة فقط
        const subjectPoints = Number(subject.points) || 0;

        if (subjectPoints < price) {
            throw new Error("INSUFFICIENT_POINTS");
        }

        const confirmed = confirm(
            "هل تريدين طلب المكافأة: " +
            (reward.name || "مكافأة") +
            "؟ 🎁\n\n" +
            "المادة: " + (subject.subjectName || "") +
            "\nالسعر: " + price + " نقطة\n" +
            "رصيدك في المادة: " + subjectPoints + " نقطة\n\n" +
            "لن تُخصم النقاط إلا بعد موافقة المعلمة."
        );

        if (!confirmed) {
            return;
        }

        // إنشاء الطلب لدى معلمة المادة
        // دون قراءة الطلبات السابقة
        const requestsRef = getTeacherRequestsRef(
            subject.teacherId
        );

        await requestsRef.add({
            studentId: String(subject.id),

            studentCode: String(code),

            studentName: String(studentName),

            teacherId: String(subject.teacherId),

            subjectName: String(subject.subjectName || ""),

            className: String(subject.className),

            section: String(subject.section),

            rewardId: String(rewardId),

            rewardName: String(reward.name || "مكافأة"),

            price: price,

            status: "pending",

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()
        });

        alert(
            "🎉 تم إرسال طلبك إلى معلمة مادة " +
            (subject.subjectName || "") +
            " بنجاح!\n\n" +
            "انتظري موافقتها، ولن تُخصم النقاط إلا بعد الموافقة."
        );

    } catch (error) {
        console.error(
            "[نجوم صفي] خطأ طلب المكافأة:",
            error
        );

        let message = error.message || "خطأ غير معروف";

        const messages = {
            FIREBASE_NOT_INITIALIZED:
                "تعذر الاتصال بقاعدة البيانات.",

            STUDENT_NOT_FOUND:
                "تعذر تحديد بيانات الطالبة. أعيدي البحث عن الرمز.",

            STUDENT_SUBJECT_DATA_MISSING:
                "بيانات المادة غير مكتملة. أعيدي البحث عن الرمز.",

            REWARD_NOT_FOUND:
                "المكافأة غير موجودة.",

            REWARD_NOT_AVAILABLE:
                "هذه المكافأة غير متاحة لهذه المادة أو الشعبة.",

            INVALID_REWARD_PRICE:
                "قيمة نقاط المكافأة غير صحيحة.",

            INSUFFICIENT_POINTS:
                "نقاطك في هذه المادة غير كافية للحصول على المكافأة."
        };

        message = messages[error.message] || message;

        if (error.code === "permission-denied") {
            message =
                "رفضت قواعد Firestore إرسال الطلب. تحققي من صلاحيات إنشاء طلبات الاستبدال.";
        }

        alert(
            "❌ تعذر إرسال طلب المكافأة.\n\n" +
            "السبب: " + message
        );

    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

// =====================================
// دعم الطلبات القديمة
// =====================================

async function redeemReward(rewardId) {
    const subjects = window.currentStudentSubjects || [];

    if (!subjects.length) {
        alert("🔐 أدخلي رمز الطالبة أولًا.");
        return;
    }

    // التوافق مع استدعاءات النسخة القديمة
    // يرسل الطلب إلى أول مادة فقط
    return redeemSubjectReward(
        subjects[0],
        rewardId
    );
}

// =====================================
// إتاحة الدوال لبقية الملفات
// =====================================

window.loadRewards = loadRewards;
window.redeemReward = redeemReward;
window.redeemSubjectReward = redeemSubjectReward;

// =====================================
// تشغيل المتجر
// =====================================

document.addEventListener("DOMContentLoaded", () => {
    loadRewards();
});
