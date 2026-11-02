
/* =============================================
   نجوم صَفّي - لوحة المعلمة
   نظام متعدد المعلمات والصفوف والشعب
   يتطلب Firebase Authentication وFirestore
   ويتطلب Cloud Functions للتحقق من رموز المعلمات
   ============================================= */

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.app().functions("us-central1");

let currentTeacher = null;
let currentTeacherData = null;

let currentSelection = {
    className: "",
    section: ""
};

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

function showLoginError(message) {
    const element = getElement("loginError");
    if (element) element.textContent = message;
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
        "unavailable": "تعذر الاتصال بالخدمة. حاولي لاحقًا.",
        "functions/not-found": "خدمة الدخول غير منشأة في Firebase بعد.",
        "functions/unauthenticated": "تعذّر التحقق من الهوية."
    };

    alert(
        messages[error?.code] ||
        error?.message ||
        "حدث خطأ. تحققي من الاتصال والصلاحيات."
    );
}

function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
}

// =============================================
// تسجيل الدخول باسم المعلمة والصف والشعبة
// =============================================

async function loginWithSelection() {
    const button = getElement("loginButton");

    try {
        showLoginError("");

        const teacherId = getElement("teacherSelect")?.value;
        const className = getElement("classSelect")?.value;
        const section = getElement("sectionSelect")?.value;
        const code = getElement("teacherCode")?.value;

        if (!teacherId || !className || !section || !code) {
            throw new Error(
                "اختاري اسم المعلمة والصف والشعبة وأدخلي الرمز السري."
            );
        }

        if (button) button.disabled = true;

        /*
          يجب إنشاء Cloud Function باسم:
          loginTeacherWithCode

          تتحقق الخدمة من الرمز على الخادم،
          ثم تصدر Firebase Custom Token صالحًا.
          لا تتحققي من الرمز داخل هذا الملف.
        */

        const response = await functions
            .httpsCallable("loginTeacherWithCode")({
                teacherId,
                className,
                section,
                code
            });

        const customToken = response.data?.customToken;

        if (!customToken) {
            throw new Error("لم يتم استلام رمز مصادقة صالح.");
        }

        await auth.signInWithCustomToken(customToken);

        // تتم متابعة الدخول وتحميل بيانات المعلمة
        // من خلال auth.onAuthStateChanged.

    } catch (error) {
        console.error("Login error:", error);

        showLoginError(
            error?.message || "تعذر تسجيل الدخول. حاولي مجددًا."
        );
    } finally {
        if (button) button.disabled = false;
    }
}

// =============================================
// إنشاء رمز المعلمة
// =============================================

async function createTeacherCode() {
    const button = getElement("createCodeButton");

    try {
        showLoginError("");

        const teacherId = getElement("teacherSelect")?.value;
        const className = getElement("classSelect")?.value;
        const section = getElement("sectionSelect")?.value;
        const code = getElement("teacherCode")?.value;

        if (!teacherId || !className || !section || !code) {
            throw new Error(
                "اختاري اسم المعلمة والصف والشعبة، ثم أدخلي الرمز."
            );
        }

        if (code.length < 8) {
            throw new Error(
                "يجب أن يتكون الرمز من 8 أحرف أو أرقام على الأقل."
            );
        }

        if (button) button.disabled = true;

        /*
          يجب إنشاء Cloud Function باسم:
          createTeacherCode

          يجب ألا تسمح الخدمة لأي شخص بإنشاء حساب
          باسم معلمة غير مسجلة أو غير معتمدة.
          ويجب حفظ الرمز بطريقة آمنة على الخادم.
        */

        const response = await functions
            .httpsCallable("createTeacherCode")({
                teacherId,
                className,
                section,
                code
            });

        if (response.data?.success !== true) {
            throw new Error("لم يتم تأكيد إنشاء الرمز.");
        }

        showLoginError("تم إنشاء الرمز بنجاح. يمكنكِ تسجيل الدخول.");

    } catch (error) {
        console.error("Create code error:", error);

        showLoginError(
            error?.message || "تعذر إنشاء الرمز."
        );
    } finally {
        if (button) button.disabled = false;
    }
}

// إظهار الرمز أو إخفاؤه
getElement("toggleCode")?.addEventListener("click", () => {
    const input = getElement("teacherCode");
    const button = getElement("toggleCode");

    if (!input || !button) return;

    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "إظهار الرمز" : "إخفاء الرمز";
});

// =============================================
// تسجيل الخروج
// =============================================

async function logout() {
    stopListeners();

    currentTeacher = null;
    currentTeacherData = null;
    currentSelection = {
        className: "",
        section: ""
    };

    try {
        await auth.signOut();
    } catch (error) {
        showFirebaseError(error);
    }
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
        const teacherDoc = await db
            .collection("teachers")
            .doc(user.uid)
            .get();

        if (!teacherDoc.exists) {
            await auth.signOut();
            showLoginError(
                "لم يتم إعداد ملف المعلمة. تواصلي مع مسؤولة المنصة."
            );
            return;
        }

        currentTeacherData = teacherDoc.data();

        if (currentTeacherData.active !== true) {
            await auth.signOut();
            showLoginError("الحساب غير مفعّل حاليًا.");
            return;
        }

        /*
          يجب أن تصدر Cloud Function الصف والشعبة
          ضمن Custom Claims بعد التحقق منهما.
        */
        const tokenResult = await user.getIdTokenResult(true);
        const claims = tokenResult.claims || {};

        currentSelection = {
            className: String(claims.className || ""),
            section: String(claims.section || "")
        };

        if (!currentSelection.className ||
            !currentSelection.section) {
            await auth.signOut();
            showLoginError(
                "لم يتم تحديد الصف والشعبة لهذا الدخول."
            );
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

// =============================================
// إظهار الواجهات
// =============================================

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
    if (!currentTeacherData || !currentTeacher) return;

    if (getElement("teacherName")) {
        getElement("teacherName").textContent =
            currentTeacherData.name || "المعلمة";
    }

    if (getElement("schoolName")) {
        getElement("schoolName").textContent =
            currentTeacherData.schoolName || "المدرسة";
    }

    if (getElement("className")) {
        getElement("className").value =
            currentSelection.className;
    }

    if (getElement("selectedClass")) {
        getElement("selectedClass").textContent =
            currentSelection.className;
    }

    if (getElement("selectedSection")) {
        getElement("selectedSection").textContent =
            currentSelection.section;
    }

    if (getElement("subjectName")) {
        getElement("subjectName").value =
            currentTeacherData.subjectName || "";
    }
}

// =============================================
// نطاق بيانات المعلمة
// =============================================

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
// إيقاف مستمعات Firestore
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
    if (!currentTeacher || !currentTeacherData) return;

    const name = getElement("studentName")?.value.trim();
    const code = getElement("studentCode")?.value.trim();
    const points = Number(getElement("studentPoints")?.value || 0);
    const message = getElement("studentMessage")?.value.trim();

    if (!name || !code) {
        showStatus("studentStatus", "أدخلي اسم الطالب ورمزه.");
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
            "لم تُربط المعلمة بمدرسة بعد."
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
            className: currentSelection.className,
            section: currentSelection.section,
            subjectName: currentTeacherData.subjectName || "",
            updatedAt: serverTimestamp()
        };

        if (editingStudentId) {
            await teacherCollection("students")
                .doc(editingStudentId)
                .update(studentData);

            showStatus(
                "studentStatus",
                "تم تعديل بيانات الطالب.",
                true
            );
        } else {
            await teacherCollection("students").add({
                ...studentData,
                initialPoints: points,
                createdAt: serverTimestamp()
            });

            showStatus(
                "studentStatus",
                "تمت إضافة الطالب.",
                true
            );
        }

        cancelStudentEdit();

    } catch (error) {
        showFirebaseError(error);
    }
}

function loadStudents() {
    if (!currentTeacher) return;

    const list = getElement("studentsList");
    if (!list) return;

    list.textContent = "جاري تحميل الطلاب...";

    if (studentsUnsubscribe) studentsUnsubscribe();

    studentsUnsubscribe = teacherCollection("students")
        .where("className", "==", currentSelection.className)
        .where("section", "==", currentSelection.section)
        .orderBy("name")
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                list.textContent = "لا يوجد طلاب في هذه الشعبة حاليًا.";
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
                        <p>🏫 الصف: ${escapeHtml(student.className || "")}</p>
                        <p>الشعبة: ${escapeHtml(student.section || "")}</p>
                        <p>💬 ${escapeHtml(student.message || "")}</p>
                        <div class="card-actions">
                            <button class="edit-button"
                                onclick="editStudent(decodeURIComponent('${id}'))">
                                ✏️ تعديل
                            </button>
                            <button class="delete-button"
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

        if (student.className !== currentSelection.className ||
            student.section !== currentSelection.section) {
            throw new Error("لا يمكن تعديل طالب من شعبة أخرى.");
        }

        getElement("studentName").value = student.name || "";
        getElement("studentCode").value = student.code || "";
        getElement("studentPoints").value = student.initialPoints ?? "";
        getElement("studentMessage").value = student.message || "";

        editingStudentId = id;

        getElement("studentSaveButton").textContent = "💾 حفظ التعديلات";

        if (getElement("cancelStudentButton")) {
            getElement("cancelStudentButton").style.display =
                "inline-block";
        }

        getElement("studentName")?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {
        showFirebaseError(error);
    }
}

async function deleteStudent(id) {
    if (!confirm("هل تريدين حذف هذا الطالب من قائمة المعلمة؟")) return;

    try {
        const ref = teacherCollection("students").doc(id);
        const doc = await ref.get();

        if (!doc.exists) return;

        const student = doc.data();

        if (student.className !== currentSelection.className ||
            student.section !== currentSelection.section) {
            throw new Error("لا يمكن حذف طالب من شعبة أخرى.");
        }

        await ref.delete();

        showStatus("studentStatus", "تم حذف الطالب.", true);

    } catch (error) {
        showFirebaseError(error);
    }
}

function cancelStudentEdit() {
    editingStudentId = null;

    if (getElement("studentName")) getElement("studentName").value = "";
    if (getElement("studentCode")) getElement("studentCode").value = "";
    if (getElement("studentPoints")) getElement("studentPoints").value = "";
    if (getElement("studentMessage")) getElement("studentMessage").value = "";

    if (getElement("studentSaveButton")) {
        getElement("studentSaveButton").textContent = "➕ إضافة الطالب";
    }

    if (getElement("cancelStudentButton")) {
        getElement("cancelStudentButton").style.display = "none";
    }
}

// =============================================
// إدارة المكافآت
// =============================================

async function saveReward() {
    if (!currentTeacher) return;

    const name = getElement("rewardName")?.value.trim();
    const price = Number(getElement("rewardPrice")?.value);
    const icon = getElement("rewardIcon")?.value.trim();
    const description = getElement("rewardDescription")?.value.trim();

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
            description: description || "",
            className: currentSelection.className,
            section: currentSelection.section,
            updatedAt: serverTimestamp()
        };

        if (editingRewardId) {
            await teacherCollection("rewards")
                .doc(editingRewardId)
                .update(rewardData);
        } else {
            await teacherCollection("rewards").add({
                ...rewardData,
                createdAt: serverTimestamp()
            });
        }

        showStatus(
            "rewardStatus",
            editingRewardId ? "تم تعديل المكافأة." : "تمت إضافة المكافأة.",
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

    if (rewardsUnsubscribe) rewardsUnsubscribe();

    rewardsUnsubscribe = teacherCollection("rewards")
        .where("className", "==", currentSelection.className)
        .where("section", "==", currentSelection.section)
        .orderBy("name")
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                list.textContent = "لا توجد مكافآت لهذه الشعبة حاليًا 🎁";
                return;
            }

            let html = "";

            snapshot.forEach(doc => {
                const reward = doc.data();
                const id = encodeURIComponent(doc.id);

                html += `
                    <div class="reward-manager-card">
                        <h3>${escapeHtml(reward.icon || "🎁")}
                            ${escapeHtml(reward.name)}</h3>
                        <p>⭐ السعر: ${Number(reward.price) || 0} نقطة</p>
                        <p>${escapeHtml(reward.description || "")}</p>
                        <div class="card-actions">
                            <button class="edit-button"
                                onclick="editReward(decodeURIComponent('${id}'))">
                                ✏️ تعديل
                            </button>
                            <button class="delete-button"
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

        if (reward.className !== currentSelection.className ||
            reward.section !== currentSelection.section) {
            throw new Error("لا يمكن تعديل مكافأة من شعبة أخرى.");
        }

        getElement("rewardName").value = reward.name || "";
        getElement("rewardPrice").value = reward.price || "";
        getElement("rewardIcon").value = reward.icon || "";
        getElement("rewardDescription").value = reward.description || "";

        editingRewardId = id;

        getElement("rewardSaveButton").textContent = "💾 حفظ التعديلات";

        if (getElement("cancelRewardButton")) {
            getElement("cancelRewardButton").style.display = "inline-block";
        }

    } catch (error) {
        showFirebaseError(error);
    }
}

async function deleteReward(id) {
    if (!confirm("هل أنتِ متأكدة من حذف المكافأة؟")) return;

    try {
        const ref = teacherCollection("rewards").doc(id);
        const doc = await ref.get();

        if (!doc.exists) return;

        const reward = doc.data();

        if (reward.className !== currentSelection.className ||
            reward.section !== currentSelection.section) {
            throw new Error("لا يمكن حذف مكافأة من شعبة أخرى.");
        }

        await ref.delete();

    } catch (error) {
        showFirebaseError(error);
    }
}

function cancelRewardEdit() {
    editingRewardId = null;

    if (getElement("rewardName")) getElement("rewardName").value = "";
    if (getElement("rewardPrice")) getElement("rewardPrice").value = "";
    if (getElement("rewardIcon")) getElement("rewardIcon").value = "";
    if (getElement("rewardDescription")) {
        getElement("rewardDescription").value = "";
    }

    if (getElement("rewardSaveButton")) {
        getElement("rewardSaveButton").textContent = "➕ إضافة المكافأة";
    }

    if (getElement("cancelRewardButton")) {
        getElement("cancelRewardButton").style.display = "none";
    }
}

// =============================================
// طلبات استبدال المكافآت
// =============================================

function loadRewardRequests() {
    if (!currentTeacher) return;

    const list = getElement("rewardRequestsList");
    if (!list) return;

    list.textContent = "جاري تحميل الطلبات...";

    if (requestsUnsubscribe) requestsUnsubscribe();

    requestsUnsubscribe = teacherCollection("rewardRequests")
        .where("className", "==", currentSelection.className)
        .where("section", "==", currentSelection.section)
        .orderBy("createdAt", "desc")
        .onSnapshot(snapshot => {
            let html = "";
            let pending = 0;

            snapshot.forEach(doc => {
                const request = doc.data();

                if (request.status === "pending") pending++;

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
                ? "لا توجد طلبات لهذه الشعبة حاليًا."
                : html;

            if (getElement("pendingCount")) {
                getElement("pendingCount").textContent = pending;
            }

        }, showFirebaseError);
}
