
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

        if (!student.className || !student.section) {

            alert("❌ تعذر تحديد صفك وشعبتك. أعيدي البحث عن رمز الطالبة.");

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

        const price = Number(reward.price);

        if (!Number.isSafeInteger(price) || price <= 0) {

            alert("❌ قيمة نقاط المكافأة غير صحيحة.");

            return;
        }

        if (student.points < price) {

            alert("⭐ نقاطك غير كافية للحصول على هذه المكافأة.");

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
        // إنشاء الطلب في مجموعة المعلمة
        // دون قراءة الطلبات السابقة
        // =================================

        const requestsRef = getTeacherRequestsRef();

        await requestsRef.add({

            studentId: String(student.id),

            studentCode: String(student.code || ""),

            studentName: String(student.name || "الطالبة"),

            teacherId: String(student.teacherId),

            className: String(student.className),

            section: String(student.section),

            rewardId: String(rewardId),

            rewardName: String(reward.name || "مكافأة"),

            price: price,

            status: "pending",

            createdAt:
                firebase.firestore.FieldValue.serverTimestamp()

        });

        alert(
            "🎉 تم إرسال طلبك إلى المعلمة بنجاح!\n\n" +
            "انتظري موافقتها، ولن تُخصم النقاط إلا بعد الموافقة."
        );

    } catch (error) {

        console.error(
            "[نجوم صفي] خطأ طلب المكافأة:",
            error
        );

        let message = error.message || "خطأ غير معروف";

        if (error.code === "permission-denied") {
            message =
                "رفضت قواعد Firestore إرسال الطلب. تحققي من صلاحيات إنشاء طلبات الاستبدال.";
        } else if (error.message === "FIREBASE_NOT_INITIALIZED") {
            message =
                "تعذر الاتصال بقاعدة البيانات.";
        } else if (error.message === "STUDENT_NOT_FOUND") {
            message =
                "تعذر تحديد المعلمة المرتبطة بالطالبة. أعيدي البحث عن الرمز.";
        }

        alert(
            "❌ تعذر إرسال طلب المكافأة.\n\n" +
            "السبب: " + message
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
