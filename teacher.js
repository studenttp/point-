
/* =========================================
   نجوم صفي - لوحة المعلمة
   تسجيل المعلمات وإدارة بياناتهن
========================================= */

const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.app().functions("us-central1");

// إبقاء تسجيل الدخول على الجهاز حتى تسجيل الخروج يدويًا
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => console.error("خطأ في إعداد الجلسة:", error));

let currentTeacher = null;
let currentTeacherData = null;

let currentSelection = {
    className: "",
    section: ""
};

let editingStudentId = null;
let editingRewardId = null;
let unsubscribeListeners = [];

/* =========================================
   عناصر الصفحة والمساعدات
========================================= */

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

function showLoginError(message) {
    const element = getElement("loginError");
    if (element) element.textContent = message || "";
}

function showRegistrationError(message) {
    const element = getElement("registrationError");
    if (element) element.textContent = message || "";
}

function showStatus(message, type = "success") {
    const element = getElement("statusMessage");

    if (element) {
        element.textContent = message;
        element.dataset.type = type;
        element.style.display = "block";
        return;
    }

    if (message) console.log(message);
}

function showFirebaseError(error, fallback = "حدث خطأ. يرجى المحاولة مرة أخرى.") {
    console.error(error);

    const messages = {
        "functions/invalid-argument": "البيانات المدخلة غير صحيحة.",
        "functions/not-found": "لم يتم العثور على بيانات المعلمة.",
        "functions/already-exists": "اسم المعلمة مسجل مسبقًا.",
        "functions/permission-denied": "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
        "functions/unauthenticated": "انتهت الجلسة. يرجى تسجيل الدخول مجددًا.",
        "functions/resource-exhausted": "محاولات كثيرة. يرجى الانتظار ثم المحاولة.",
        "functions/internal": "حدث خطأ في الخادم. يرجى المحاولة لاحقًا.",
        "auth/network-request-failed": "تحققي من اتصال الإنترنت."
    };

    return messages[error?.code] || error?.message || fallback;
}

function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
}

function normalizeArabicName(value) {
    return String(value || "")
        .normalize("NFKC")
        .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/\s+/g, " ")
        .trim();
}

function stopListeners() {
    unsubscribeListeners.forEach((unsubscribe) => {
        try {
            unsubscribe();
        } catch (error) {
            console.warn(error);
        }
    });

    unsubscribeListeners = [];
}

function teacherCollection(name) {
    if (!currentTeacher) {
        throw new Error("المعلمة غير مسجلة الدخول.");
    }

    return db.collection("teachers")
        .doc(currentTeacher.uid)
        .collection(name);
}

function selectedClassIsAllowed(className, section) {
    const classes = currentTeacherData?.classes;

    if (!Array.isArray(classes)) return false;

    return classes.some((item) =>
        item.className === className &&
        Array.isArray(item.sections) &&
        item.sections.includes(section)
    );
}

/* =========================================
   واجهة الدخول والتسجيل
========================================= */

function showLogin() {
    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "block";
    }

    if (getElement("dashboard")) {
        getElement("dashboard").style.display = "none";
    }

    if (getElement("teacherRegistrationBox")) {
        getElement("teacherRegistrationBox").style.display = "none";
    }

    showLoginError("");
}

function showDashboard() {
    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "none";
    }

    if (getElement("teacherRegistrationBox")) {
        getElement("teacherRegistrationBox").style.display = "none";
    }

    if (getElement("dashboard")) {
        getElement("dashboard").style.display = "block";
    }
}

function showTeacherRegistration() {
    if (getElement("teacherRegistrationBox")) {
        getElement("teacherRegistrationBox").style.display = "block";
    }

    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "none";
    }

    showRegistrationError("");
}

function hideTeacherRegistration() {
    if (getElement("teacherRegistrationBox")) {
        getElement("teacherRegistrationBox").style.display = "none";
    }

    if (getElement("loginBox")) {
        getElement("loginBox").style.display = "block";
    }

    showRegistrationError("");
}

/* =========================================
   تحميل أسماء المعلمات
========================================= */

async function loadTeachers() {
    const select = getElement("teacherSelect");
    if (!select) return;

    select.innerHTML = '<option value="">جارٍ تحميل المعلمات...</option>';

    try {
        const result = await functions.httpsCallable("listTeachers")();

        const teachers = Array.isArray(result.data?.teachers)
            ? result.data.teachers
            : [];

        select.innerHTML = '<option value="">اختاري اسم المعلمة</option>';

        teachers
            .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"))
            .forEach((teacher) => {
                const option = document.createElement("option");
                option.value = teacher.id;
                option.textContent = teacher.name;
                select.appendChild(option);
            });

        if (!teachers.length) {
            select.innerHTML = '<option value="">لا توجد معلمات مسجلات</option>';
        }

        populateClassesForLogin();
    } catch (error) {
        console.error("تعذر تحميل المعلمات:", error);
        select.innerHTML = '<option value="">تعذر تحميل المعلمات</option>';
        showLoginError(showFirebaseError(error, "تعذر تحميل قائمة المعلمات."));
    }
}

/* =========================================
   تحميل الصفوف والشعب الخاصة بالمعلمة
========================================= */

function populateClassesForLogin() {
    const teacherSelect = getElement("teacherSelect");
    const classSelect = getElement("classSelect");
    const sectionSelect = getElement("sectionSelect");

    if (!teacherSelect || !classSelect || !sectionSelect) return;

    classSelect.innerHTML = '<option value="">اختاري الصف</option>';
    sectionSelect.innerHTML = '<option value="">اختاري الشعبة</option>';

    const teacherId = teacherSelect.value;
    if (!teacherId) return;

    // الصفوف والشعب تُحمّل من الخادم بعد اختيار المعلمة.
    functions.httpsCallable("getTeacherClasses")({ teacherId })
        .then((result) => {
            const classes = Array.isArray(result.data?.classes)
                ? result.data.classes
                : [];

            classSelect.innerHTML = '<option value="">اختاري الصف</option>';

            classes.forEach((item) => {
                const option = document.createElement("option");
                option.value = item.className;
                option.textContent = item.className;
                classSelect.appendChild(option);
            });

            classSelect.onchange = () => {
                const selected = classes.find(
                    (item) => item.className === classSelect.value
                );

                sectionSelect.innerHTML = '<option value="">اختاري الشعبة</option>';

                (selected?.sections || []).forEach((section) => {
                    const option = document.createElement("option");
                    option.value = section;
                    option.textContent = section;
                    sectionSelect.appendChild(option);
                });
            };
        })
        .catch((error) => {
            console.error(error);
            showLoginError(showFirebaseError(error, "تعذر تحميل صفوف المعلمة."));
        });
}

/* =========================================
   تسجيل الدخول برمز المعلمة
========================================= */

async function loginWithSelection() {
    const teacherSelect = getElement("teacherSelect");
    const classSelect = getElement("classSelect");
    const sectionSelect = getElement("sectionSelect");
    const codeInput = getElement("teacherCode");

    const button = getElement("teacherLoginButton");

    const teacherId = teacherSelect?.value;
    const className = classSelect?.value;
    const section = sectionSelect?.value;
    const code = codeInput?.value?.trim();

    showLoginError("");

    if (!teacherId || !className || !section || !code) {
        showLoginError("يرجى اختيار المعلمة والصف والشعبة وإدخال الرمز.");
        return;
    }

    if (button) button.disabled = true;

    try {
        const result = await functions.httpsCallable("loginTeacherWithCode")({
            teacherId,
            className,
            section,
            code
        });

        if (!result.data?.customToken) {
            throw new Error("لم يُرجع الخادم رمز تسجيل الدخول.");
        }

        await auth.signInWithCustomToken(result.data.customToken);

        currentSelection = { className, section };

        if (codeInput) codeInput.value = "";
    } catch (error) {
        showLoginError(showFirebaseError(error, "تعذر تسجيل الدخول."));
    } finally {
        if (button) button.disabled = false;
    }
}

/* =========================================
   إظهار وإخفاء رمز الدخول
========================================= */

function toggleTeacherCode() {
    const input = getElement("teacherCode");
    if (!input) return;

    input.type = input.type === "password" ? "text" : "password";
}

/* =========================================
   تسجيل معلمة جديدة
========================================= */

function addRegistrationClass() {
    const container = getElement("registrationClasses");
    if (!container) return;

    const firstRow = container.querySelector(".registration-class-row");
    if (!firstRow) return;

    const newRow = firstRow.cloneNode(true);

    newRow.querySelectorAll("select").forEach((select) => {
        select.selectedIndex = 0;
    });

    newRow.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
    });

    container.appendChild(newRow);
}

function removeRegistrationClass(button) {
    const container = getElement("registrationClasses");
    const rows = container?.querySelectorAll(".registration-class-row");

    if (!rows || rows.length <= 1) {
        showRegistrationError("يجب تحديد صف واحد على الأقل.");
        return;
    }

    button.closest(".registration-class-row")?.remove();
    showRegistrationError("");
}

function collectRegistrationClasses() {
    const container = getElement("registrationClasses");
    const rows = container?.querySelectorAll(".registration-class-row");

    if (!rows?.length) {
        throw new Error("يرجى تحديد الصفوف والشعب.");
    }

    const classes = [];
    const usedClasses = new Set();

    rows.forEach((row) => {
        const classSelect = row.querySelector(".register-class-select");
        const className = classSelect?.value;

        const sections = Array.from(
            row.querySelectorAll('input[type="checkbox"]:checked')
        ).map((checkbox) => checkbox.value);

        if (!className) {
            throw new Error("يرجى اختيار الصف في جميع الأسطر.");
        }

        if (!sections.length) {
            throw new Error(`يرجى اختيار شعبة واحدة على الأقل للصف ${className}.`);
        }

        if (usedClasses.has(className)) {
            throw new Error(`تم اختيار ${className} أكثر من مرة.`);
        }

        usedClasses.add(className);
        classes.push({ className, sections });
    });

    return classes;
}

async function registerTeacher(event) {
    if (event) event.preventDefault();

    showRegistrationError("");

    const name = getElement("registerTeacherName")?.value?.trim();
    const schoolName = getElement("registerSchoolName")?.value?.trim();
    const subjectName = getElement("registerSubjectName")?.value?.trim();
    const code = getElement("registerTeacherCode")?.value || "";
    const confirmCode = getElement("confirmTeacherCode")?.value || "";

    if (!name || !schoolName || !subjectName || !code || !confirmCode) {
        showRegistrationError("يرجى تعبئة جميع البيانات.");
        return;
    }

    if (normalizeArabicName(name).length < 3) {
        showRegistrationError("يرجى إدخال اسم المعلمة كاملًا.");
        return;
    }

    if (code.length < 8) {
        showRegistrationError("يجب ألا يقل رمز المعلمة عن 8 أحرف أو أرقام.");
        return;
    }

    if (code !== confirmCode) {
        showRegistrationError("رمز الدخول وتأكيده غير متطابقين.");
        return;
    }

    let classes;

    try {
        classes = collectRegistrationClasses();
    } catch (error) {
        showRegistrationError(error.message);
        return;
    }

    const submitButton = getElement("registerTeacherButton");
    if (submitButton) submitButton.disabled = true;

    try {
        await functions.httpsCallable("registerTeacher")({
            name,
            schoolName,
            subjectName,
            code,
            classes
        });

        const form = getElement("teacherRegistrationForm");
        if (form) form.reset();

        hideTeacherRegistration();
        await loadTeachers();

        showLoginError("تم إنشاء حساب المعلمة. اختاري اسمك والصف والشعبة ثم سجّلي الدخول.");
    } catch (error) {
        showRegistrationError(showFirebaseError(error, "تعذر إنشاء حساب المعلمة."));
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

/* =========================================
   تسجيل الخروج
========================================= */

async function logout() {
    stopListeners();

    currentTeacher = null;
    currentTeacherData = null;
    currentSelection = { className: "", section: "" };

    try {
        await auth.signOut();
        showLogin();
        await loadTeachers();
    } catch (error) {
        console.error(error);
        showStatus("تعذر تسجيل الخروج. حاولي مرة أخرى.", "error");
    }
}

/* =========================================
   التحقق من جلسة المعلمة
========================================= */

auth.onAuthStateChanged(async (user) => {
    stopListeners();

    if (!user) {
        currentTeacher = null;
        currentTeacherData = null;
        showLogin();
        return;
    }

    try {
        const teacherRef = db.collection("teachers").doc(user.uid);
        const teacherSnapshot = await teacherRef.get();

        if (!teacherSnapshot.exists) {
            await auth.signOut();
            showLoginError("لم يتم العثور على ملف المعلمة.");
            return;
        }

        const teacherData = teacherSnapshot.data();

        if (teacherData.active !== true) {
            await auth.signOut();
            showLoginError("حساب المعلمة غير مفعل.");
            return;
        }

        const tokenResult = await user.getIdTokenResult(true);
        const claims = tokenResult.claims;

        const className = claims.className;
        const section = claims.section;

        if (!className || !section) {
            await auth.signOut();
            showLoginError("تعذر التحقق من الصف والشعبة. سجّلي الدخول مجددًا.");
            return;
        }

        currentTeacher = user;
        currentTeacherData = teacherData;
        currentSelection = { className, section };

        if (!selectedClassIsAllowed(className, section)) {
            await auth.signOut();
            showLoginError("الصف أو الشعبة غير مسجلين ضمن بيانات المعلمة.");
            return;
        }

        showDashboard();
        loadTeacherInfo();
        loadStudents();
        loadRewardsManager();
        loadRewardRequests();
    } catch (error) {
        console.error("خطأ في تحميل حساب المعلمة:", error);
        showLoginError(showFirebaseError(error, "تعذر تحميل حساب المعلمة."));
        await auth.signOut().catch(() => {});
    }
});

/* =========================================
   معلومات المعلمة
========================================= */

function loadTeacherInfo() {
    if (!currentTeacherData) return;

    const data = currentTeacherData;

    if (getElement("teacherName")) {
        getElement("teacherName").textContent = data.name || "";
    }

    if (getElement("schoolName")) {
        getElement("schoolName").textContent = data.schoolName || "";
    }

    if (getElement("subjectName")) {
        getElement("subjectName").textContent = data.subjectName || "";
    }

    if (getElement("className")) {
        getElement("className").textContent = currentSelection.className;
    }

    if (getElement("selectedClass")) {
        getElement("selectedClass").textContent = currentSelection.className;
    }

    if (getElement("selectedSection")) {
        getElement("selectedSection").textContent = currentSelection.section;
    }
}

/* =========================================
   الطلاب
   ملاحظة: تبقى البيانات في المسار الحالي
   teachers/{uid}/students
========================================= */

async function addStudent(student) {
    if (!currentTeacher || !currentTeacherData) {
        throw new Error("يرجى تسجيل الدخول أولًا.");
    }

    if (!student?.name?.trim() || !student?.code?.trim()) {
        throw new Error("يرجى إدخال اسم الطالب ورمزه.");
    }

    const data = {
        name: student.name.trim(),
        code: student.code.trim(),
        points: Number(student.points) || 0,
        message: String(student.message || ""),
        schoolId: currentTeacherData.schoolId || "",
        teacherId: currentTeacher.uid,
        className: currentSelection.className,
        section: currentSelection.section,
        subjectName: currentTeacherData.subjectName || "",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    };

    await teacherCollection("students").add(data);
    showStatus("تمت إضافة الطالب.");
    await loadStudents();
}

async function loadStudents() {
    if (!currentTeacher) return;

    const container = getElement("studentsList");
    if (!container) return;

    try {
        const snapshot = await teacherCollection("students")
            .where("className", "==", currentSelection.className)
            .where("section", "==", currentSelection.section)
            .get();

        container.innerHTML = "";

        const students = [];
        snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));

        students.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), "ar")
        );

        if (!students.length) {
            container.textContent = "لا يوجد طلاب في هذا الصف والشعبة حتى الآن.";
            return;
        }

        students.forEach((student) => {
            const card = document.createElement("div");
            card.className = "student-card";

            card.innerHTML = `
                <h3>${escapeHtml(student.name)}</h3>
                <p>الرمز: ${escapeHtml(student.code)}</p>
                <p>النقاط: ${Number(student.points) || 0}</p>
                <p>${escapeHtml(student.message || "")}</p>
                <button type="button" data-action="edit">تعديل</button>
                <button type="button" data-action="delete">حذف</button>
            `;

            card.querySelector('[data-action="edit"]').addEventListener("click", () => {
                editStudent(student.id, student);
            });

            card.querySelector('[data-action="delete"]').addEventListener("click", () => {
                deleteStudent(student.id);
            });

            container.appendChild(card);
        });
    } catch (error) {
        console.error(error);
        showStatus(showFirebaseError(error, "تعذر تحميل الطلاب."), "error");
    }
}

function editStudent(id, student) {
    editingStudentId = id;

    const nameInput = getElement("studentName");
    const codeInput = getElement("studentCode");
    const pointsInput = getElement("studentPoints");
    const messageInput = getElement("studentMessage");

    if (nameInput) nameInput.value = student.name || "";
    if (codeInput) codeInput.value = student.code || "";
    if (pointsInput) pointsInput.value = Number(student.points) || 0;
    if (messageInput) messageInput.value = student.message || "";

    const button = getElement("saveStudentButton");
    if (button) button.textContent = "حفظ التعديلات";

    const form = getElement("studentForm");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveStudentFromForm(event) {
    if (event) event.preventDefault();

    const student = {
        name: getElement("studentName")?.value?.trim(),
        code: getElement("studentCode")?.value?.trim(),
        points: getElement("studentPoints")?.value,
        message: getElement("studentMessage")?.value || ""
    };

    try {
        if (!student.name || !student.code) {
            throw new Error("يرجى إدخال اسم الطالب ورمزه.");
        }

        if (editingStudentId) {
            await teacherCollection("students").doc(editingStudentId).update({
                name: student.name,
                code: student.code,
                points: Math.max(0, Number(student.points) || 0),
                message: student.message,
                updatedAt: serverTimestamp()
            });

            editingStudentId = null;
            showStatus("تم تحديث بيانات الطالب.");
        } else {
            await addStudent(student);
        }

        getElement("studentForm")?.reset();

        const button = getElement("saveStudentButton");
        if (button) button.textContent = "إضافة الطالب";

        await loadStudents();
    } catch (error) {
        showStatus(error.message || showFirebaseError(error), "error");
    }
}

async function deleteStudent(id) {
    if (!confirm("هل تريدين حذف هذا الطالب؟")) return;

    try {
        const ref = teacherCollection("students").doc(id);
        const snapshot = await ref.get();

        if (!snapshot.exists) return;

        const student = snapshot.data();

        if (
            student.className !== currentSelection.className ||
            student.section !== currentSelection.section
        ) {
            throw new Error("لا يمكن حذف طالب من صف أو شعبة أخرى.");
        }

        await ref.delete();
        showStatus("تم حذف الطالب.");
        await loadStudents();
    } catch (error) {
        showStatus(error.message || showFirebaseError(error), "error");
    }
}

/* =========================================
   المكافآت
========================================= */

async function saveReward(event) {
    if (event) event.preventDefault();

    if (!currentTeacher) {
        showStatus("يرجى تسجيل الدخول أولًا.", "error");
        return;
    }

    const name = getElement("rewardName")?.value?.trim();
    const price = Number(getElement("rewardPrice")?.value);
    const icon = getElement("rewardIcon")?.value?.trim() || "🎁";
    const description = getElement("rewardDescription")?.value?.trim() || "";

    if (!name || !Number.isFinite(price) || price < 0) {
        showStatus("أدخلي اسم المكافأة وسعرًا صحيحًا بالنقاط.", "error");
        return;
    }

    const data = {
        name,
        price,
        icon,
        description,
        className: currentSelection.className,
        section: currentSelection.section,
        updatedAt: serverTimestamp()
    };

    try {
        if (editingRewardId) {
            await teacherCollection("rewards").doc(editingRewardId).update(data);
            editingRewardId = null;
            showStatus("تم تعديل المكافأة.");
        } else {
            data.createdAt = serverTimestamp();
            await teacherCollection("rewards").add(data);
            showStatus("تمت إضافة المكافأة.");
        }

        getElement("rewardForm")?.reset();

        const button = getElement("saveRewardButton");
        if (button) button.textContent = "إضافة المكافأة";

        await loadRewardsManager();
    } catch (error) {
        showStatus(showFirebaseError(error, "تعذر حفظ المكافأة."), "error");
    }
}

async function loadRewardsManager() {
    if (!currentTeacher) return;

    const container = getElement("rewardsList");
    if (!container) return;

    try {
        const snapshot = await teacherCollection("rewards")
            .where("className", "==", currentSelection.className)
            .where("section", "==", currentSelection.section)
            .get();

        container.innerHTML = "";

        const rewards = [];
        snapshot.forEach((doc) => rewards.push({ id: doc.id, ...doc.data() }));

        rewards.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), "ar")
        );

        if (!rewards.length) {
            container.textContent = "لا توجد مكافآت مضافة لهذا الصف والشعبة.";
            return;
        }

        rewards.forEach((reward) => {
            const card = document.createElement("div");
            card.className = "reward-card";

            card.innerHTML = `
                <h3>${escapeHtml(reward.icon || "🎁")} ${escapeHtml(reward.name)}</h3>
                <p>السعر: ${Number(reward.price) || 0} نقطة</p>
                <p>${escapeHtml(reward.description || "")}</p>
                <button type="button" data-action="edit">تعديل</button>
                <button type="button" data-action="delete">حذف</button>
            `;

            card.querySelector('[data-action="edit"]').addEventListener("click", () => {
                editReward(reward.id, reward);
            });

            card.querySelector('[data-action="delete"]').addEventListener("click", () => {
                deleteReward(reward.id);
            });

            container.appendChild(card);
        });
    } catch (error) {
        showStatus(showFirebaseError(error, "تعذر تحميل المكافآت."), "error");
    }
}

function editReward(id, reward) {
    editingRewardId = id;

    if (getElement("rewardName")) getElement("rewardName").value = reward.name || "";
    if (getElement("rewardPrice")) getElement("rewardPrice").value = reward.price ?? 0;
    if (getElement("rewardIcon")) getElement("rewardIcon").value = reward.icon || "🎁";
    if (getElement("rewardDescription")) {
        getElement("rewardDescription").value = reward.description || "";
    }

    const button = getElement("saveRewardButton");
    if (button) button.textContent = "حفظ التعديلات";

    getElement("rewardForm")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });
}

async function deleteReward(id) {
    if (!confirm("هل تريدين حذف هذه المكافأة؟")) return;

    try {
        const ref = teacherCollection("rewards").doc(id);
        const snapshot = await ref.get();

        if (!snapshot.exists) return;

        const reward = snapshot.data();

        if (
            reward.className !== currentSelection.className ||
            reward.section !== currentSelection.section
        ) {
            throw new Error("لا يمكن حذف مكافأة من صف أو شعبة أخرى.");
        }

        await ref.delete();
        showStatus("تم حذف المكافأة.");
        await loadRewardsManager();
    } catch (error) {
        showStatus(error.message || showFirebaseError(error), "error");
    }
}

/* =========================================
   طلبات استبدال المكافآت
========================================= */

async function loadRewardRequests() {
    if (!currentTeacher) return;

    const container = getElement("rewardRequestsList");
    if (!container) return;

    try {
        const snapshot = await teacherCollection("rewardRequests")
            .where("className", "==", currentSelection.className)
            .where("section", "==", currentSelection.section)
            .get();

        container.innerHTML = "";

        const requests = [];
        snapshot.forEach((doc) => requests.push({ id: doc.id, ...doc.data() }));

        requests.sort((a, b) => {
            const aTime = a.createdAt?.toMillis?.() || 0;
            const bTime = b.createdAt?.toMillis?.() || 0;
            return bTime - aTime;
        });

        const pendingCount = requests.filter(
            (request) => (request.status || "pending") === "pending"
        ).length;

        if (getElement("pendingRequestsCount")) {
            getElement("pendingRequestsCount").textContent = pendingCount;
        }

        if (!requests.length) {
            container.textContent = "لا توجد طلبات استبدال لهذا الصف والشعبة.";
            return;
        }

        requests.forEach((request) => {
            const card = document.createElement("div");
            card.className = "request-card";

            card.innerHTML = `
                <h3>${escapeHtml(request.studentName || "طالب")}</h3>
                <p>المكافأة: ${escapeHtml(request.rewardName || "—")}</p>
                <p>الحالة: ${escapeHtml(request.status || "pending")}</p>
                <p>الصف: ${escapeHtml(request.className || "")}
                   - الشعبة: ${escapeHtml(request.section || "")}</p>
                <button type="button" data-action="approve">قبول الطلب</button>
                <button type="button" data-action="reject">رفض الطلب</button>
            `;

            card.querySelector('[data-action="approve"]').addEventListener("click", () => {
                updateRewardRequest(request.id, "approved");
            });

            card.querySelector('[data-action="reject"]').addEventListener("click", () => {
                updateRewardRequest(request.id, "rejected");
            });

            container.appendChild(card);
        });
    } catch (error) {
        showStatus(showFirebaseError(error, "تعذر تحميل طلبات الاستبدال."), "error");
    }
}

async function updateRewardRequest(id, status) {
    try {
        const ref = teacherCollection("rewardRequests").doc(id);
        const snapshot = await ref.get();

        if (!snapshot.exists) {
            throw new Error("الطلب غير موجود.");
        }

        const request = snapshot.data();

        if (
            request.className !== currentSelection.className ||
            request.section !== currentSelection.section
        ) {
            throw new Error("لا يمكن تعديل طلب تابع لصف أو شعبة أخرى.");
        }

        await ref.update({
            status,
            reviewedAt: serverTimestamp()
        });

        showStatus(status === "approved" ? "تم قبول الطلب." : "تم رفض الطلب.");
        await loadRewardRequests();
    } catch (error) {
        showStatus(error.message || showFirebaseError(error), "error");
    }
}

/* =========================================
   ربط الأزرار بالنماذج
========================================= */

document.addEventListener("DOMContentLoaded", () => {
    getElement("teacherSelect")?.addEventListener("change", populateClassesForLogin);

    getElement("toggleCode")?.addEventListener("click", toggleTeacherCode);

    getElement("studentForm")?.addEventListener("submit", saveStudentFromForm);
    getElement("rewardForm")?.addEventListener("submit", saveReward);

    loadTeachers();
});

// إتاحة الدوال التي تستدعيها أزرار HTML
window.loginWithSelection = loginWithSelection;
window.showTeacherRegistration = showTeacherRegistration;
window.hideTeacherRegistration = hideTeacherRegistration;
window.registerTeacher = registerTeacher;
window.addRegistrationClass = addRegistrationClass;
window.removeRegistrationClass = removeRegistrationClass;
window.logout = logout;

window.addStudent = addStudent;
window.loadStudents = loadStudents;
window.editStudent = editStudent;
window.deleteStudent = deleteStudent;

window.saveReward = saveReward;
window.loadRewardsManager = loadRewardsManager;
window.editReward = editReward;
window.deleteReward = deleteReward;

window.loadRewardRequests = loadRewardRequests;
window.updateRewardRequest = updateRewardRequest;


/* إظهار نموذج تسجيل معلمة جديدة */
window.showTeacherRegistration = function () {
    const loginBox = document.getElementById("loginBox");
    const registrationBox = document.getElementById("teacherRegistrationBox");

    if (!registrationBox) {
        alert("لم يتم العثور على نموذج تسجيل المعلمة. تأكدي من وجود العنصر teacherRegistrationBox في ملف teacher.html.");
        return;
    }

    if (loginBox) {
        loginBox.style.display = "none";
    }

    registrationBox.style.display = "block";
    registrationBox.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
};
