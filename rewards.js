let currentStudent = null;
let currentStudentCode = null;
let currentStudentName = null;
let currentPoints = 0;

// =====================================
// تحميل المكافآت
// =====================================

function loadRewards() {

    const list = document.getElementById("rewardsList");

    if (!list) return;

    list.innerHTML = `
        <div class="message">
            ⏳ جاري تحميل المكافآت...
        </div>
    `;

    db.collection("rewards")
        .get()

        .then((snapshot) => {

            if (snapshot.empty) {

                list.innerHTML = `
                    <div class="message">
                        🎁 لا توجد مكافآت حاليًا.
                    </div>
                `;

                return;
            }

            let html = "";

            snapshot.forEach((doc) => {

                const reward = doc.data();

                const price =
                    Number(reward.price) || 0;

                const canRedeem =
                    currentStudent &&
                    currentPoints >= price;

                html += `

                    <div class="reward-card">

                        <div class="reward-icon">
                            ${reward.icon || "🎁"}
                        </div>

                        <h3>
                            ${escapeHtml(
                                reward.name || "مكافأة"
                            )}
                        </h3>

                        <p class="reward-description">
                            ${escapeHtml(
                                reward.description || ""
                            )}
                        </p>

                        <div class="reward-price">
                            ⭐ ${price} نقطة
                        </div>

                        ${
                            currentStudent

                            ?

                            canRedeem

                            ?

                            `
                            <button
                                class="redeem"
                                onclick="redeemReward('${doc.id}')">

                                🎁 طلب المكافأة

                            </button>
                            `

                            :

                            `
                            <button
                                class="locked"
                                disabled>

                                🔒 نقاط غير كافية

                            </button>
                            `

                            :

                            `
                            <button
                                class="locked"
                                disabled>

                                🔐 أدخل رمز الطالب أولًا

                            </button>
                        }

                    </div>

                `;

            });

            list.innerHTML = html;

        })

        .catch((error) => {

            console.error(error);

            list.innerHTML = `
                <div class="message">
                    ❌ حدث خطأ في تحميل المكافآت.
                </div>
            `;

        });
}

// =====================================
// تحميل الطالب
// =====================================

function loadStudent() {

    const input =
        document.getElementById("studentCode");

    const message =
        document.getElementById("studentMessage");

    const code =
        input.value.trim();

    if (code === "") {

        message.innerHTML = `
            <div class="message">
                ⚠️ أدخل رمز الطالب أولًا.
            </div>
        `;

        return;
    }

    db.collection("students")
        .where("code", "==", code)
        .get()

        .then((snapshot) => {

            if (snapshot.empty) {

                currentStudent = null;
                currentStudentCode = null;
                currentStudentName = null;
                currentPoints = 0;

                document.getElementById(
                    "studentPoints"
                ).textContent = "0";

                message.innerHTML = `
                    <div class="message">
                        ❌ رمز الطالب غير صحيح.
                    </div>
                `;

                loadRewards();

                return;
            }

            snapshot.forEach((doc) => {

                currentStudent = doc.id;

                const student = doc.data();

                currentStudentCode =
                    student.code;

                currentStudentName =
                    student.name;

                currentPoints =
                    Number(student.points) || 0;

                document.getElementById(
                    "studentPoints"
                ).textContent =
                    currentPoints;

                message.innerHTML = `

                    <div class="message">

                        👋 أهلًا
                        <strong>
                            ${escapeHtml(student.name)}
                        </strong>
                        🌟

                        <br>

                        لديك الآن
                        <strong>
                            ${currentPoints}
                        </strong>
                        نقطة.

                    </div>

                `;

            });

            loadRewards();

        })

        .catch((error) => {

            console.error(error);

            message.innerHTML = `
                <div class="message">
                    ❌ حدث خطأ في الاتصال.
                </div>
            `;

        });
}

// =====================================
// طلب المكافأة
// =====================================

async function redeemReward(rewardId) {

    if (!currentStudent) {

        alert(
            "🔐 أدخل رمز الطالب أولًا."
        );

        return;
    }

    try {

        const rewardSnapshot =
            await db.collection("rewards")
                .doc(rewardId)
                .get();

        if (!rewardSnapshot.exists) {

            alert(
                "❌ المكافأة غير موجودة."
            );

            return;
        }

        const reward =
            rewardSnapshot.data();

        const price =
            Number(reward.price) || 0;

        if (currentPoints < price) {

            alert(
                "⭐ لا توجد نقاط كافية."
            );

            return;
        }

        // =================================
        // البحث عن الطلبات السابقة
        // =================================

        const requestsSnapshot =
            await db.collection("rewardRequests")
                .where(
                    "studentId",
                    "==",
                    currentStudent
                )
                .get();

        let alreadyPending = false;

        requestsSnapshot.forEach((doc) => {

            const request = doc.data();

            if (
                request.rewardId === rewardId &&
                request.status === "pending"
            ) {

                alreadyPending = true;

            }

        });

        if (alreadyPending) {

            alert(
                "⏳ لديك طلب معلق لهذه المكافأة بالفعل."
            );

            return;
        }

        // =================================
        // تأكيد الطلب
        // =================================

        const confirmed = confirm(

            "هل تريد إرسال طلب الحصول على " +
            reward.name +

            " إلى المعلمة؟ 🎁\n\n" +

            "السعر: " +
            price +
            " نقطة\n\n" +

            "لن تُخصم النقاط إلا بعد موافقة المعلمة."

        );

        if (!confirmed) {
            return;
        }

        // =================================
        // إنشاء الطلب
        // =================================

        await db.collection("rewardRequests")
            .add({

                studentId:
                    currentStudent,

                studentCode:
                    currentStudentCode,

                studentName:
                    currentStudentName,

                rewardId:
                    rewardId,

                rewardName:
                    reward.name,

                price:
                    price,

                status:
                    "pending",

                createdAt:
                    firebase.firestore.FieldValue
                        .serverTimestamp()

            });

        alert(
            "🎉 تم إرسال طلبك إلى المعلمة!\n\n" +
            "انتظر موافقتها، ولن تُخصم النقاط إلا بعد الموافقة."
        );

        loadRewards();

    }

    catch (error) {

        console.error(error);

        alert(
            "❌ حدث خطأ أثناء إرسال الطلب:\n" +
            error.message
        );

    }
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
// تشغيل المتجر
// =====================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadRewards();

    }
);