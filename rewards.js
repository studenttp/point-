
"use strict";

// =====================================
// نجوم صفي - متجر مكافآت الطالبات
// =====================================

// يعتمد على بيانات الطالبة الموجودة في script.js:
// currentStudentId
// currentStudentCode
// currentStudentName
// currentStudentPoints
// currentTeacherId
// currentStudentClass
// currentStudentSection

// =====================================
// أدوات مساعدة
// =====================================

function getRewardsDB() {
    if (typeof window.getStudentDatabase === "function") {
        return window.getStudentDatabase();
    }

    if (window.db) {
        return window.db;
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

function getTeacherRewardsRef() {
    const student = getRewardStudent();

    if (!student.teacherId) {
        throw new Error("STUDENT_NOT_FOUND");
    }

    return getRewardsDB()
        .collection("teachers")
        .doc(student.teacherId)
        .collection("rewards");
}

function getTeacherRequestsRef() {
    const student = getRewardStudent();

    if (!student.teacherId) {
        throw new Error("STUDENT_NOT_FOUND");
    }

    return getRewardsDB()
        .collection("teachers")
        .doc(student.teacherId)
        .collection("rewardRequests");
}

// =====================================
// تحميل المكافآت
// =====================================

async function loadRewards() {

    const list = rewardElement("rewardsList");

    if (!list) {
        console.warn("لم يتم العثور على rewardsList");
        return;
    }

    list.innerHTML = `
        <div class="message">
            ⏳ جاري تحميل المكافآت...
        </div>
    `;

    try {

        const student = getRewardStudent();

        if (!student.teacherId) {

            list.innerHTML = `
                <div class="message">
                    🔐 أدخلي رمز الطالبة أولًا لعرض المكافآت.
                </div>
            `;

            return;
        }

        const snapshot = await getTeacherRewardsRef().get();

        // عرض مكافآت الصف والشعبة الخاصة بالطالبة فقط

        const rewards = snapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            }))
            .filter(reward =>
                reward.active !== false &&
                String(reward.className || "") ===
                    String(student.className) &&
                String(reward.section ?? "") ===
                    String(student.section)
            );

        if (!rewards.length) {

            list.innerHTML = `
                <div class="message">
                    🎁 لا توجد مكافآت متاحة لصفك وشعبتك حاليًا.
                </div>
            `;

            return;
        }

        let html = "";

        for (const reward of rewards) {

            const price = Number(reward.price) || 0;

            const canRedeem = student.points >= price;

            html += `
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
                        ?
                        `
                        <button
                            class="redeem"
                            type="button"
                            onclick="redeemReward('${rewardEscape(reward.id)}')">
                            🎁 طلب المكافأة
                        </button>
                        `
                        :
                        `
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
        }

        list.innerHTML = html;

    } catch (error) {

        console.error(
            "[نجوم صفي] خطأ تحميل المكافآت:",
            error
        );

        list.innerHTML = `
    <div class="message" style="direction:ltr;text-align:left;">
        <strong>Reward Loading Error</strong>
        <p>${rewardEscape(error.code || "UNKNOWN")}</p>
        <p>${rewardEscape(error.message || String(error))}</p>
    </div>
`;
    }
}

// =====================================
// طلب استبدال المكافأة
// =====================================

async function redeemReward(rewardId) {

    try {

        const student = getRewardStudent();

        if (!student.id || !student.teacherId) {

            alert("🔐 أدخلي رمز الطالبة أولًا.");

            return;
        }

        const rewardRef = getTeacherRewardsRef().doc(rewardId);

        const rewardSnapshot = await rewardRef.get();

        if (!rewardSnapshot.exists) {

            alert("❌ المكافأة غير موجودة.");

            return;
        }

        const reward = rewardSnapshot.data();

        // التحقق من أن المكافأة تخص صف الطالبة وشعبتها

        if (
            reward.active === false ||
            String(reward.className || "") !==
                String(student.className) ||
            String(reward.section ?? "") !==
                String(student.section)
        ) {

            alert("❌ هذه المكافأة غير متاحة لصفك وشعبتك.");

            return;
        }

        const price = Number(reward.price) || 0;

        if (student.points < price) {

            alert("⭐ نقاطك غير كافية للحصول على هذه المكافأة.");

            return;
        }

        // =================================
        // التحقق من الطلبات السابقة
        // =================================

        const requestsRef = getTeacherRequestsRef();

        const requestsSnapshot = await requestsRef
            .where("studentId", "==", student.id)
            .get();

        let alreadyPending = false;

        requestsSnapshot.forEach(doc => {

            const request = doc.data();

            if (
                request.rewardId === rewardId &&
                request.status === "pending"
            ) {
                alreadyPending = true;
            }
        });

        if (alreadyPending) {

            alert("⏳ لديك طلب معلق لهذه المكافأة بالفعل.");

            return;
        }

        // =================================
        // تأكيد الطلب
        // =================================

        const confirmed = confirm(
            "هل تريدين طلب المكافأة: " +
            reward.name +
            "؟ 🎁\n\n" +
            "السعر: " + price + " نقطة\n\n" +
            "لن تُخصم النقاط إلا بعد موافقة المعلمة."
        );

        if (!confirmed) return;

        // =================================
        // إنشاء الطلب في مجلد المعلمة
        // =================================

        await requestsRef.add({

            studentId: student.id,

            studentCode: student.code,

            studentName: student.name,

            teacherId: student.teacherId,

            className: student.className,

            section: student.section,

            rewardId: rewardId,

            rewardName: reward.name,

            price: price,

            status: "pending",

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        alert(
            "🎉 تم إرسال طلبك إلى المعلمة بنجاح!\n\n" +
            "انتظري موافقتها، ولن تُخصم النقاط إلا بعد الموافقة."
        );

        await loadRewards();

    } catch (error) {

        console.error(
            "[نجوم صفي] خطأ طلب المكافأة:",
            error
        );

        alert(
            "❌ تعذر إرسال طلب المكافأة.\n" +
            "السبب: " + (error.message || "خطأ غير معروف")
        );
    }
}

// =====================================
// إتاحة الدوال لملف script.js
// =====================================

window.loadRewards = loadRewards;
window.redeemReward = redeemReward;

// =====================================
// تشغيل المتجر
// =====================================

document.addEventListener("DOMContentLoaded", () => {
    loadRewards();
});
