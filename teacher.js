// =============================================
// نجوم صَفّي - لوحة المعلمة
// نسخة متعددة المعلمات
// تتطلب Firebase Authentication وFirestore
// =============================================

const auth = firebase.auth();
const db = firebase.firestore();

let currentTeacher = null;
let currentTeacherData = null;

let editingStudentId = null;
let editingRewardId = null;

let studentsUnsubscribe = null;
let rewardsUnsubscribe = null;
let requestsUnsubscribe = null;

// =============================================
// أدوات مساعدة
// =============================================

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showStatus(id, message, success = false) {
    const element = getElement(id);

    if (!element) return;

    element.textContent = message;
    element.style.color = success ? "#21845b" : "#d97706";
}

function showFirebaseError(error) {
    console.error("Firebase error:", error);

    const messages = {
        "auth/invalid-email": "البريد الإلكتروني غير صحيح.",
        "auth/invalid-credential": "بيانات تسجيل الدخول غير صحيحة.",
        "auth/user-not-found": "الحساب غير موجود.",
        "auth/wrong-password": "كلمة المرور غير صحيحة.",
        "auth/too-many-requests": "محاولات كثيرة. حاولي لاحقًا.",
        "permission-denied": "ليس لديكِ صلاحية لتنفيذ هذه العملية.",
        "unavailable": "تعذر الاتصال بالخدمة. حاولي لاحقًا."
    };

    alert(
        messages[error?.code] ||
        "حدث خطأ أثناء تنفيذ العملية. تحققي من الاتصال والصلاحيات."
    );
}

// =============================================
// تسجيل الدخول
// =============================================

async function login() {
    const email = getElement("teacherEmail")?.value.trim();
    const password = getElement("password")?.value;
    const errorElement = getElement("loginError");

    if (!email || !password) {
        if (errorElement) {
            errorElement.textContent =
                "أدخلي البريد الإلكتروني وكلمة المرور.";
        }
        return;
    }

    try {
        if (errorElement) errorElement.textContent = "";

        await auth.signInWithEmailAndPassword(email, password);

        // تُحمّل بيانات المعلمة بواسطة onAuthStateChanged.
    } catch (error) {
        if (errorElement) {
            errorElement.textContent =
                "تعذر تسجيل الدخول. تحققي من بيانات الحساب.";
        }

        console.error(error);
    }
}

// =============================================
// تسجيل الخروج
// =============================================

async function logout() {
    stopListeners();
    await auth.signOut();
}

// =============================================
// متابعة حالة الحساب
// =============================================

auth.onAuthStateChanged(async user => {
    stopListeners();

    currentTeacher = user;
    currentTeacherData = null;

    if (!user) {
        showLogin();
        return;
    }

    try {
        // وثيقة المعلمة تُنشأ مسبقًا في قاعدة البيانات
        // بواسطة إجراء إداري موثوق.
        const teacherDoc = await db
            .collection("teachers")
            .doc(user.uid)
            .get();

        if (!teacherDoc.exists) {
            await auth.signOut();

            const errorElement = getElement("loginError");
            if (errorElement) {
                errorElement.textContent =
                    "لم يتم إعداد ملف المعلمة بعد. تواصلي مع مسؤولة المنصة.";
            }
            return;
        }

        currentTeacherData = teacherDoc.data();

        if (currentTeacherData.active !== true) {
            await auth.signOut();

            const errorElement = getElement("loginError");
            if (errorElement) {
                errorElement.textContent =
                    "الحساب غير مفعّل حاليًا.";
            }
            return;
        }

        showDashboard();
        loadTeacherInfo();

        loadStudents();
        loadRewardsManager();
        loadRewardRequests();

    } catch (error) {
        showFirebaseError(error);
    }
});

function showLogin() {
    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "block";
    }

    if (getElement("dashboard")) {
        getElement("dashboard").style.display = "none";
    }
}

function showDashboard() {
    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "none";
    }

    if (getElement("dashboard")) {
        getElement("dashboard").style.display = "block";
    }
}

function loadTeacherInfo() {
    if (!currentTeacherData) return;

    if (getElement("teacherName")) {
        getElement("teacherName").textContent =
            currentTeacherData.name || currentTeacher.email || "المعلمة";
    }

    if (getElement("schoolName")) {
        getElement("schoolName").textContent =
            currentTeacherData.schoolName || "المدرسة";
    }

    if (getElement("className")) {
        getElement("className").value =
            currentTeacherData.className || "";
    }

    if (getElement("subjectName")) {
        getElement("subjectName").value =
            currentTeacherData.subjectName || "";
    }
}

// =============================================
// نطاق بيانات المعلمة
// =============================================

// لا يُستخدم هذا النطاق بدل قواعد Firestore.
// يجب أن تفرض قواعد الأمان العزل نفسه على الخادم.

function teacherCollection(name) {
    if (!currentTeacher) {
        throw new Error("يجب تسجيل الدخول أولًا.");
    }

    return db
        .collection("teachers")
        .doc(currentTeacher.uid)
        .collection(name);
}

// =============================================
// إيقاف المستمعات
// =============================================

function stopListeners() {
    [
        studentsUnsubscribe,
        rewardsUnsubscribe,
        requestsUnsubscribe
    ].forEach(unsubscribe => {
        if (typeof unsubscribe === "function") {
            unsubscribe();
        }
    });

    studentsUnsubscribe = null;
    rewardsUnsubscribe = null;
    requestsUnsubscribe = null;
}

// =============================================
// إدارة الطلاب
// =============================================

async function addStudent() {
    if (!currentTeacher) return;

    const name = getElement("studentName").value.trim();
    const code = getElement("studentCode").value.trim();
    const points = Number(getElement("studentPoints").value || 0);
    const message = getElement("studentMessage").value.trim();

    if (!name || !code) {
        showStatus(
            "studentStatus",
            "أدخلي اسم الطالب ورمزه."
        );
        return;
    }

    if (!Number.isFinite(points) || points < 0) {
        showStatus("studentStatus", "أدخلي عدد نقاط صحيحًا.");
        return;
    }

    const schoolId = currentTeacherData.schoolId;

    if (!schoolId) {
        showStatus(
            "studentStatus",
            "لم تُربط المعلمة بمدرسة. تواصلي مع مسؤولة المنصة."
        );
        return;
    }

    try {
        const studentData = {
            name,
            code,
            message: message || "بداية مشرقة ⭐",
            schoolId,
            teacherId: currentTeacher.uid,
            className: getElement("className")?.value.trim() || "",
            subjectName: getElement("subjectName")?.value.trim() || "",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingStudentId) {
            // لا نغيّر النقاط من نموذج البيانات العام.
            // النقاط تُدار بسجل معاملات مستقل عند اكتمال نظامها.
            await teacherCollection("students")
                .doc(editingStudentId)
                .update(studentData);

            showStatus(
                "studentStatus",
                "تم تعديل بيانات الطالب.",
                true
            );

        } else {
            // هذا المسار خاص بقائمة المعلمة.
            // لا ينشئ ملفًا موحدًا للطالب تلقائيًا.
            await teacherCollection("students").add({
                ...studentData,
                initialPoints: points,
                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp()
            });

            showStatus(
                "studentStatus",
                "تمت إضافة الطالب إلى قائمة المعلمة.",
                true
            );
        }

        cancelStudentEdit();
        loadStudents();

    } catch (error) {
        showFirebaseError(error);
    }
}

function loadStudents() {
    if (!currentTeacher) return;

    const list = getElement("studentsList");
    if (!list) return;

    list.textContent = "جاري تحميل الطلاب...";

    if (studentsUnsubscribe) {
        studentsUnsubscribe();
    }

    studentsUnsubscribe = teacherCollection("students")
        .orderBy("name")
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                list.textContent = "لا يوجد طلاب حاليًا.";
                return;
            }

            let html = "";

            snapshot.forEach(doc => {
                const student = doc.data();
                const id = encodeURIComponent(doc.id);

                html += `
                    <div class="student-card">
                        <h3>🌟 ${escapeHtml(student.name)}</h3>
                        <p>🔑 الرمز: ${escapeHtml(student.code)}</p>
                        <p>📚 المادة: ${escapeHtml(student.subjectName || "غير محددة")}</p>
                        <p>🏫 الصف: ${escapeHtml(student.className || "غير محدد")}</p>
                        <p>💬 ${escapeHtml(student.message || "")}</p>

                        <div class="card-actions">
                            <button
                                class="edit-button"
                                onclick="editStudent(decodeURIComponent('${id}'))">
                                ✏️ تعديل
                            </button>

                            <button
                                class="delete-button"
                                onclick="deleteStudent(decodeURIComponent('${id}'))">
                                🗑 حذف
                            </button>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

        }, showFirebaseError);
}

async function editStudent(id) {
    try {
        const doc = await teacherCollection("students").doc(id).get();

        if (!doc.exists) {
            alert("الطالب غير موجود.");
            return;
        }

        const student = doc.data();

        getElement("studentName").value = student.name || "";
        getElement("studentCode").value = student.code || "";
        getElement("studentPoints").value = "";
        getElement("studentMessage").value = student.message || "";

        editingStudentId = id;

        getElement("studentSaveButton").textContent =
            "💾 حفظ التعديلات";

        getElement("cancelStudentButton").style.display =
            "inline-block";

        getElement("studentName").scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {
        showFirebaseError(error);
    }
}

async function deleteStudent(id) {
    if (!confirm("هل تريدين حذف هذا الطالب من قائمة المعلمة؟")) {
        return;
    }

    try {
        await teacherCollection("students").doc(id).delete();

        showStatus(
            "studentStatus",
            "تم حذف الطالب من قائمة المعلمة.",
            true
        );

    } catch (error) {
        showFirebaseError(error);
    }
}

function cancelStudentEdit() {
    editingStudentId = null;

    getElement("studentName").value = "";
    getElement("studentCode").value = "";
    getElement("studentPoints").value = "";
    getElement("studentMessage").value = "";

    getElement("studentSaveButton").textContent =
        "➕ إضافة الطالب";

    getElement("cancelStudentButton").style.display = "none";
}

// =============================================
// إدارة المكافآت
// =============================================

async function saveReward() {
    if (!currentTeacher) return;

    const name = getElement("rewardName").value.trim();
    const price = Number(getElement("rewardPrice").value);
    const icon = getElement("rewardIcon").value.trim();
    const description = getElement("rewardDescription").value.trim();

    if (!name) {
        showStatus("rewardStatus", "أدخلي اسم المكافأة.");
        return;
    }

    if (!Number.isFinite(price) || price <= 0) {
        showStatus("rewardStatus", "أدخلي عدد نقاط صحيحًا.");
        return;
    }

    try {
        const rewardData = {
            name,
            price,
            icon: icon || "🎁",
            description,
            updatedAt:
                firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingRewardId) {
            await teacherCollection("rewards")
                .doc(editingRewardId)
                .update(rewardData);
        } else {
            await teacherCollection("rewards").add({
                ...rewardData,
                createdAt:
                    firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        showStatus(
            "rewardStatus",
            editingRewardId
                ? "تم تعديل المكافأة."
                : "تمت إضافة المكافأة.",
            true
        );

        cancelRewardEdit();

    } catch (error) {
        showFirebaseError(error);
    }
}

function loadRewardsManager() {
    if (!currentTeacher) return;

    const list = getElement("rewardsManagerList");
    if (!list) return;

    list.textContent = "جاري تحميل المكافآت...";

    if (rewardsUnsubscribe) {
        rewardsUnsubscribe();
    }

    rewardsUnsubscribe = teacherCollection("rewards")
        .orderBy("name")
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                list.textContent = "لا توجد مكافآت حاليًا 🎁";
                return;
            }

            let html = "";

            snapshot.forEach(doc => {
                const reward = doc.data();
                const id = encodeURIComponent(doc.id);

                html += `
                    <div class="reward-manager-card">
                        <h3>
                            ${escapeHtml(reward.icon || "🎁")}
                            ${escapeHtml(reward.name)}
                        </h3>

                        <p>⭐ السعر: ${Number(reward.price) || 0} نقطة</p>
                        <p>${escapeHtml(reward.description || "")}</p>

                        <div class="card-actions">
                            <button
                                class="edit-button"
                                onclick="editReward(decodeURIComponent('${id}'))">
                                ✏️ تعديل
                            </button>

                            <button
                                class="delete-button"
                                onclick="deleteReward(decodeURIComponent('${id}'))">
                                🗑 حذف
                            </button>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

        }, showFirebaseError);
}

async function editReward(id) {
    try {
        const doc = await teacherCollection("rewards").doc(id).get();

        if (!doc.exists) return;

        const reward = doc.data();

        getElement("rewardName").value = reward.name || "";
        getElement("rewardPrice").value = reward.price || "";
        getElement("rewardIcon").value = reward.icon || "";
        getElement("rewardDescription").value =
            reward.description || "";

        editingRewardId = id;

        getElement("rewardSaveButton").textContent =
            "💾 حفظ التعديلات";

        getElement("cancelRewardButton").style.display =
            "inline-block";

    } catch (error) {
        showFirebaseError(error);
    }
}

async function deleteReward(id) {
    if (!confirm("هل أنتِ متأكدة من حذف المكافأة؟")) return;

    try {
        await teacherCollection("rewards").doc(id).delete();
    } catch (error) {
        showFirebaseError(error);
    }
}

function cancelRewardEdit() {
    editingRewardId = null;

    getElement("rewardName").value = "";
    getElement("rewardPrice").value = "";
    getElement("rewardIcon").value = "";
    getElement("rewardDescription").value = "";

    getElement("rewardSaveButton").textContent =
        "➕ إضافة المكافأة";

    getElement("cancelRewardButton").style.display = "none";
}

// =============================================
// طلبات المكافآت
// =============================================

function loadRewardRequests() {
    if (!currentTeacher) return;

    const list = getElement("rewardRequestsList");
    if (!list) return;

    list.textContent = "جاري تحميل الطلبات...";

    if (requestsUnsubscribe) {
        requestsUnsubscribe();
    }

    requestsUnsubscribe = teacherCollection("rewardRequests")
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            let html = "";
            let pending = 0;

            snapshot.forEach(doc => {
                const request = doc.data();

                if (request.status === "pending") {
                    pending++;
                }

                html += `
                    <div class="request-card">
                        <h3>🎁 ${escapeHtml(request.rewardName || "مكافأة")}</h3>

                        <div class="request-info">
                            <p>👩🏻‍🎓 الطالب: ${escapeHtml(request.studentName || "")}</p>
                            <p>🔑 الرمز: ${escapeHtml(request.studentCode || "")}</p>
                            <p>⭐ النقاط: ${Number(request.price) || 0}</p>
                            <p>الحالة: ${escapeHtml(request.status || "pending")}</p>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = snapshot.empty
                ? "لا توجد طلبات حاليًا."
                : html;

            if (getElement("pendingCount")) {
                getElement("pendingCount").textContent = pending;
            }

        }, showFirebaseError);
}