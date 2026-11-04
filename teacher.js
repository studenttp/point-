
/* =========================================================
   نجوم صفي - teacher.js
   Firebase Compat SDK
   متوافق مع teacher.html
   ========================================================= */

"use strict";

if (!window.firebase || !firebase.apps || !firebase.apps.length) {
  console.error("Firebase غير مهيأ. تحققي من teacher-firebase.js.");
  const errorBox = document.getElementById("loginError");
  if (errorBox) {
    errorBox.textContent = "تعذر الاتصال بالخدمة. أعيدي تحميل الصفحة.";
    errorBox.style.display = "block";
  }
} else {
  initializeTeacherPanel();
}

function initializeTeacherPanel() {
  const db = firebase.firestore();
  const auth = firebase.auth();

  let currentTeacher = null;
  let studentsCache = [];
  let rewardsCache = [];
  let requestsCache = [];
  let editingStudentId = null;
  let editingRewardId = null;
  let teacherProfile = {};

  /* -------------------- أدوات مساعدة -------------------- */

  function el(...ids) {
    for (const id of ids) {
      const node = document.getElementById(id);
      if (node) return node;
    }
    return null;
  }

  function value(...ids) {
    const node = el(...ids);
    return node ? node.value.trim() : "";
  }

  function setValue(val, ...ids) {
    const node = el(...ids);
    if (node) node.value = val ?? "";
  }

  function showMessage(message, type = "info", targetId = "") {
    let target = targetId ? el(targetId) : null;

    if (!target) {
      target = el(
        "loginError",
        "registrationError",
        "studentStatus",
        "rewardStatus"
      );
    }

    if (target) {
      target.textContent = message;
      target.dataset.type = type;
      target.style.display = "block";
    } else {
      alert(message);
    }
  }

  function clearMessage(targetId) {
    const node = el(targetId);
    if (node) {
      node.textContent = "";
      node.style.display = "none";
    }
  }

  function escapeHTML(input) {
    return String(input ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function errorMessage(error) {
    console.error("Teacher panel error:", error);

    const code = error?.code || "";

    const messages = {
      "auth/invalid-credential":
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/wrong-password":
        "كلمة المرور غير صحيحة.",
      "auth/user-not-found":
        "لا يوجد حساب بهذا البريد الإلكتروني.",
      "auth/invalid-email":
        "صيغة البريد الإلكتروني غير صحيحة.",
      "auth/email-already-in-use":
        "هذا البريد الإلكتروني مسجل مسبقًا.",
      "auth/weak-password":
        "كلمة المرور ضعيفة. استخدمي 8 أحرف على الأقل.",
      "auth/too-many-requests":
        "محاولات كثيرة. انتظري قليلًا ثم حاولي مجددًا.",
      "auth/network-request-failed":
        "تعذر الاتصال بالإنترنت. تحققي من الاتصال.",
      "permission-denied":
        "لا توجد صلاحية للعملية. تحققي من قواعد Firestore.",
      "unavailable":
        "الخدمة غير متاحة مؤقتًا. حاولي مجددًا."
    };

    return messages[code] || error?.message ||
      "حدث خطأ غير متوقع. حاولي مرة أخرى.";
  }

  function requireTeacher() {
    if (!currentTeacher) {
      throw new Error("يرجى تسجيل الدخول أولًا.");
    }
  }

  function teacherRef() {
    requireTeacher();
    return db.collection("teachers").doc(currentTeacher.uid);
  }

  function studentsRef() {
    return teacherRef().collection("students");
  }

  function rewardsRef() {
    return teacherRef().collection("rewards");
  }

  function requestsRef() {
    return teacherRef().collection("rewardRequests");
  }

  function codeIndexRef(code) {
    return db.collection("studentCodeIndex").doc(code);
  }

  function activeClass() {
    return value("activeClassSelect", "className");
  }

  function activeSection() {
    return value("activeSectionSelect");
  }

  function updateTeacherInfo() {
    const name = teacherProfile.name || currentTeacher?.email || "المعلمة";
    const school = teacherProfile.schoolName || "المدرسة";
    const subject = teacherProfile.subjectName || "";

    if (el("teacherName")) el("teacherName").textContent = name;
    if (el("schoolName")) el("schoolName").textContent = school;
    if (el("subjectName")) el("subjectName").value = subject;

    updateSelectedClassInfo();
  }

  function updateSelectedClassInfo() {
    const className = activeClass();
    const section = activeSection();

    if (el("selectedClass")) {
      el("selectedClass").textContent = className || "—";
    }

    if (el("selectedSection")) {
      el("selectedSection").textContent = section || "—";
    }

    if (el("className")) el("className").value = className;
  }

  /* -------------------- الصفوف والشعب -------------------- */

  function readRegistrationClasses() {
    const rows = [
      ...document.querySelectorAll(".registration-class-row")
    ];

    const result = [];

    for (const row of rows) {
      const className =
        row.querySelector(".register-class-select")?.value || "";

      const sections = [
        ...row.querySelectorAll(
          ".registration-sections input[type='checkbox']:checked"
        )
      ].map(input => input.value);

      if (className && sections.length) {
        result.push({ className, sections });
      }
    }

    return result;
  }

  function populateActiveClasses() {
    const select = el("activeClassSelect");
    const sectionSelect = el("activeSectionSelect");

    if (!select) return;

    const classes = Array.isArray(teacherProfile.classes)
      ? teacherProfile.classes
      : [];

    const uniqueClasses = [...new Set(
      classes.map(item => item.className).filter(Boolean)
    )];

    select.innerHTML =
      '<option value="">اختاري الصف</option>' +
      uniqueClasses.map(name =>
        `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`
      ).join("");

    if (sectionSelect) {
      sectionSelect.innerHTML =
        '<option value="">اختاري الشعبة</option>';
    }

    updateSelectedClassInfo();
  }

  function updateSections() {
    const className = activeClass();
    const sectionSelect = el("activeSectionSelect");

    if (!sectionSelect) return;

    const entry = (teacherProfile.classes || []).find(
      item => item.className === className
    );

    const sections = entry?.sections || [];

    sectionSelect.innerHTML =
      '<option value="">اختاري الشعبة</option>' +
      sections.map(section =>
        `<option value="${escapeHTML(section)}">${escapeHTML(section)}</option>`
      ).join("");

    updateSelectedClassInfo();
    renderStudents();
    renderRewards();
    renderRewardRequests();
  }

  /* -------------------- تسجيل الدخول والخروج -------------------- */

  async function teacherLogin() {
    clearMessage("loginError");

    const email = value("teacherEmail");
    const password = value("teacherPassword");

    if (!email || !password) {
      showMessage(
        "أدخلي البريد الإلكتروني وكلمة المرور.",
        "error",
        "loginError"
      );
      return;
    }

    const button = el("teacherLoginButton");
    if (button) button.disabled = true;

    try {
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged يتولى إظهار لوحة التحكم.
    } catch (error) {
      showMessage(errorMessage(error), "error", "loginError");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function teacherRegister() {
    clearMessage("registrationError");

    const name = value("registerTeacherName");
    const schoolName = value("registerSchoolName");
    const subjectName = value("registerSubjectName");
    const email = value("registerTeacherEmail");
    const password = value("registerTeacherPassword");
    const confirmPassword = value("confirmTeacherPassword");
    const classes = readRegistrationClasses();

    if (!name || !schoolName || !subjectName || !email || !password) {
      showMessage(
        "أكملي جميع البيانات المطلوبة.",
        "error",
        "registrationError"
      );
      return;
    }

    if (password.length < 8) {
      showMessage(
        "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
        "error",
        "registrationError"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        "كلمتا المرور غير متطابقتين.",
        "error",
        "registrationError"
      );
      return;
    }

    if (!classes.length) {
      showMessage(
        "اختاري صفًا واحدًا على الأقل وحددي شعبة له.",
        "error",
        "registrationError"
      );
      return;
    }

    const button = el("registerTeacherButton");
    if (button) button.disabled = true;

    let credential = null;

    try {
      credential = await auth.createUserWithEmailAndPassword(
        email,
        password
      );

      await db.collection("teachers").doc(credential.user.uid).set({
        teacherId: credential.user.uid,
        name,
        email,
        schoolName,
        subjectName,
        classes,
        createdAt: serverTimestamp()
      });

      teacherProfile = {
        name,
        email,
        schoolName,
        subjectName,
        classes
      };

      showMessage(
        "تم إنشاء الحساب بنجاح.",
        "success",
        "registrationError"
      );

      // تغيير الواجهة بعد نجاح إنشاء الحساب.
      // ستُظهر مراقبة حالة المصادقة لوحة التحكم.
    } catch (error) {
      // إذا فشل حفظ الملف بعد إنشاء الحساب، نوضح المشكلة.
      showMessage(errorMessage(error), "error", "registrationError");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function resetPassword() {
    clearMessage("loginError");

    const email = value("teacherEmail");

    if (!email) {
      showMessage(
        "أدخلي بريدك الإلكتروني أولًا لاستعادة كلمة المرور.",
        "error",
        "loginError"
      );
      return;
    }

    try {
      await auth.sendPasswordResetEmail(email);
      showMessage(
        "إذا كان البريد مسجلًا، فستصلك رسالة لاستعادة كلمة المرور.",
        "success",
        "loginError"
      );
    } catch (error) {
      showMessage(errorMessage(error), "error", "loginError");
    }
  }

  async function teacherLogout() {
    try {
      await auth.signOut();
    } catch (error) {
      showMessage(errorMessage(error), "error", "loginError");
    }
  }

  async function loadTeacherProfile(user) {
    const snapshot = await db.collection("teachers").doc(user.uid).get();

    if (!snapshot.exists) {
      teacherProfile = {
        name: user.email || "المعلمة",
        email: user.email || "",
        schoolName: "",
        subjectName: "",
        classes: []
      };
      return;
    }

    teacherProfile = snapshot.data() || {};
  }

  auth.onAuthStateChanged(async user => {
    currentTeacher = user || null;

    const loginBox = el("loginBox");
    const registrationBox = el("teacherRegistrationBox");
    const dashboard = el("dashboard");

    if (!user) {
      if (loginBox) loginBox.style.display = "block";
      if (registrationBox) registrationBox.style.display = "none";
      if (dashboard) dashboard.style.display = "none";

      studentsCache = [];
      rewardsCache = [];
      requestsCache = [];
      teacherProfile = {};
      return;
    }

    try {
      if (loginBox) loginBox.style.display = "none";
      if (registrationBox) registrationBox.style.display = "none";
      if (dashboard) dashboard.style.display = "block";

      await loadTeacherProfile(user);
      updateTeacherInfo();
      populateActiveClasses();

      await Promise.all([
        loadStudents(),
        loadRewards(),
        loadRewardRequests()
      ]);
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
    }
  });

  /* -------------------- إدارة الطالبات -------------------- */

  function getStudentFormData() {
    const name = value("studentName");
    const code = value("studentCode");
    const className = activeClass();
    const section = activeSection();
    const pointsValue = value("studentPoints");
    const message = value("studentMessage");

    if (!name || !code) {
      throw new Error("أدخلي اسم الطالبة ورمزها.");
    }

    if (!className || !section) {
      throw new Error("اختاري الصف والشعبة أولًا.");
    }

    if (code.includes("/") || code.length > 100) {
      throw new Error("تحققي من رمز الطالبة؛ الرمز غير صالح.");
    }

    const points = pointsValue === "" ? 0 : Number(pointsValue);

    if (!Number.isSafeInteger(points) || points < 0) {
      throw new Error("أدخلي عدد نقاط صحيحًا غير سالب.");
    }

    return { name, code, className, section, points, message };
  }

  async function loadStudents() {
    if (!currentTeacher) return [];

    try {
      const snapshot = await studentsRef().get();

      studentsCache = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      renderStudents();
      return studentsCache;
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
      return [];
    }
  }

  function renderStudents() {
    const container = el("studentsList");
    if (!container) return;

    const className = activeClass();
    const section = activeSection();

    if (!className || !section) {
      container.textContent = "اختاري الصف والشعبة لعرض الطالبات.";
      return;
    }

    const filtered = studentsCache.filter(student =>
      student.className === className &&
      String(student.section) === String(section)
    );

    if (!filtered.length) {
      container.innerHTML = "<p>لا توجد طالبات في هذه الشعبة حتى الآن.</p>";
      return;
    }

    container.innerHTML = filtered.map(student => `
      <div class="student-card">
        <strong>${escapeHTML(student.name)}</strong>
        <div>الرمز: ${escapeHTML(student.code)}</div>
        <div>الصف: ${escapeHTML(student.className || "")}</div>
        <div>الشعبة: ${escapeHTML(student.section || "")}</div>
        <div>النقاط: ${Number(student.points) || 0}</div>
        <div>${escapeHTML(student.message || "")}</div>
        <button type="button" data-edit-student="${escapeHTML(student.id)}">
          تعديل
        </button>
        <button type="button" data-delete-student="${escapeHTML(student.id)}">
          حذف
        </button>
      </div>
    `).join("");
  }

  async function saveStudent() {
    try {
      requireTeacher();

      const data = getStudentFormData();
      const teacherId = currentTeacher.uid;

      const studentRef = editingStudentId
        ? studentsRef().doc(editingStudentId)
        : studentsRef().doc();

      const newIndexRef = codeIndexRef(data.code);

      await db.runTransaction(async transaction => {
        const studentSnapshot = editingStudentId
          ? await transaction.get(studentRef)
          : null;

        if (editingStudentId && !studentSnapshot.exists) {
          throw new Error("لم يتم العثور على سجل الطالبة.");
        }

        const newIndexSnapshot = await transaction.get(newIndexRef);

        let oldIndexRef = null;
        let oldIndexSnapshot = null;
        let oldCode = null;

        if (studentSnapshot?.exists) {
          oldCode = studentSnapshot.data().code;

          if (oldCode && oldCode !== data.code) {
            oldIndexRef = codeIndexRef(oldCode);
            oldIndexSnapshot = await transaction.get(oldIndexRef);
          }
        }

        if (newIndexSnapshot.exists) {
          const index = newIndexSnapshot.data();

          const sameStudent =
            index.teacherId === teacherId &&
            index.studentId === studentRef.id;

          if (!sameStudent) {
            throw new Error("هذا الرمز مستخدم بالفعل. اختاري رمزًا آخر.");
          }
        }

        const oldData = studentSnapshot?.exists
          ? studentSnapshot.data()
          : {};

        transaction.set(studentRef, {
          ...data,
          teacherId,
          createdAt: oldData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });

        transaction.set(newIndexRef, {
          code: data.code,
          teacherId,
          studentId: studentRef.id,
          className: data.className,
          section: data.section,
          createdAt: newIndexSnapshot.exists
            ? (newIndexSnapshot.data().createdAt || serverTimestamp())
            : serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });

        if (oldIndexRef && oldIndexSnapshot?.exists) {
          const oldIndex = oldIndexSnapshot.data();

          if (
            oldIndex.teacherId === teacherId &&
            oldIndex.studentId === studentRef.id
          ) {
            transaction.delete(oldIndexRef);
          }
        }
      });

      editingStudentId = null;

      setValue("", "studentName", "studentCode", "studentMessage");
      setValue("0", "studentPoints");

      if (el("studentSaveButton")) {
        el("studentSaveButton").textContent = "➕ إضافة الطالبة";
      }
      if (el("cancelStudentButton")) {
        el("cancelStudentButton").style.display = "none";
      }

      await loadStudents();
      showMessage("تم حفظ بيانات الطالبة بنجاح.", "success", "studentStatus");
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
    }
  }

  function editStudent(studentId) {
    const student = studentsCache.find(item => item.id === studentId);
    if (!student) {
      showMessage("لم يتم العثور على الطالبة.", "error", "studentStatus");
      return;
    }

    editingStudentId = studentId;

    setValue(student.name, "studentName");
    setValue(student.code, "studentCode");
    setValue(student.points ?? 0, "studentPoints");
    setValue(student.message, "studentMessage");
    setValue(student.className, "activeClassSelect");
    updateSections();
    setValue(student.section, "activeSectionSelect");
    updateSelectedClassInfo();

    if (el("studentSaveButton")) {
      el("studentSaveButton").textContent = "حفظ التعديلات";
    }
    if (el("cancelStudentButton")) {
      el("cancelStudentButton").style.display = "inline-block";
    }
  }

  function cancelStudentEdit() {
    editingStudentId = null;

    setValue("", "studentName", "studentCode", "studentMessage");
    setValue("0", "studentPoints");

    if (el("studentSaveButton")) {
      el("studentSaveButton").textContent = "➕ إضافة الطالبة";
    }
    if (el("cancelStudentButton")) {
      el("cancelStudentButton").style.display = "none";
    }

    clearMessage("studentStatus");
  }

  async function deleteStudent(studentId) {
    if (!confirm("هل تريدين حذف هذه الطالبة؟")) return;

    try {
      requireTeacher();

      const studentRef = studentsRef().doc(studentId);

      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(studentRef);

        if (!snapshot.exists) {
          throw new Error("سجل الطالبة غير موجود.");
        }

        const student = snapshot.data();
        const code = student.code;

        let indexRef = null;
        let indexSnapshot = null;

        if (code) {
          indexRef = codeIndexRef(code);
          indexSnapshot = await transaction.get(indexRef);
        }

        if (indexSnapshot?.exists) {
          const index = indexSnapshot.data();

          if (
            index.teacherId === currentTeacher.uid &&
            index.studentId === studentId
          ) {
            transaction.delete(indexRef);
          }
        }

        transaction.delete(studentRef);
      });

      if (editingStudentId === studentId) cancelStudentEdit();

      await loadStudents();
      showMessage("تم حذف الطالبة.", "success", "studentStatus");
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
    }
  }

  /* -------------------- إدارة المكافآت -------------------- */

  async function loadRewards() {
    if (!currentTeacher) return [];

    try {
      const snapshot = await rewardsRef().get();

      rewardsCache = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      renderRewards();
      return rewardsCache;
    } catch (error) {
      showMessage(errorMessage(error), "error", "rewardStatus");
      return [];
    }
  }

  function renderRewards() {
    const container = el("rewardsManagerList");
    if (!container) return;

    if (!activeClass() || !activeSection()) {
      container.textContent = "اختاري الصف والشعبة أولًا.";
      return;
    }

    const filtered = rewardsCache.filter(reward =>
      reward.className === activeClass() &&
      String(reward.section) === String(activeSection())
    );

    if (!filtered.length) {
      container.innerHTML = "<p>لا توجد مكافآت في هذه الشعبة حتى الآن.</p>";
      return;
    }

    container.innerHTML = filtered.map(reward => `
      <div class="reward-card">
        <span>${escapeHTML(reward.icon || "🎁")}</span>
        <strong>${escapeHTML(reward.name || "")}</strong>
        <div>النقاط المطلوبة: ${Number(reward.price) || 0}</div>
        <div>${escapeHTML(reward.description || "")}</div>
        <button type="button" data-delete-reward="${escapeHTML(reward.id)}">
          حذف المكافأة
        </button>
      </div>
    `).join("");
  }

  async function saveReward() {
    try {
      requireTeacher();

      const name = value("rewardName");
      const priceValue = value("rewardPrice");
      const icon = value("rewardIcon") || "🎁";
      const description = value("rewardDescription");

      const className = activeClass();
      const section = activeSection();
      const price = Number(priceValue);

      if (!className || !section) {
        throw new Error("اختاري الصف والشعبة أولًا.");
      }

      if (!name) throw new Error("أدخلي اسم المكافأة.");

      if (
        priceValue === "" ||
        !Number.isSafeInteger(price) ||
        price <= 0
      ) {
        throw new Error("أدخلي عدد نقاط صحيحًا أكبر من صفر.");
      }

      const data = {
        name,
        price,
        icon,
        description,
        className,
        section,
        active: true,
        teacherId: currentTeacher.uid,
        updatedAt: serverTimestamp()
      };

      if (editingRewardId) {
        await rewardsRef().doc(editingRewardId).update(data);
      } else {
        await rewardsRef().add({
          ...data,
          createdAt: serverTimestamp()
        });
      }

      editingRewardId = null;

      setValue("", "rewardName", "rewardDescription");
      setValue("🎁", "rewardIcon");
      setValue("", "rewardPrice");

      if (el("rewardSaveButton")) {
        el("rewardSaveButton").textContent = "➕ إضافة المكافأة";
      }
      if (el("cancelRewardButton")) {
        el("cancelRewardButton").style.display = "none";
      }

      await loadRewards();
      showMessage("تم حفظ المكافأة بنجاح.", "success", "rewardStatus");
    } catch (error) {
      showMessage(errorMessage(error), "error", "rewardStatus");
    }
  }

  async function deleteReward(rewardId) {
    if (!confirm("هل تريدين حذف هذه المكافأة؟")) return;

    try {
      await rewardsRef().doc(rewardId).delete();
      await loadRewards();
      showMessage("تم حذف المكافأة.", "success", "rewardStatus");
    } catch (error) {
      showMessage(errorMessage(error), "error", "rewardStatus");
    }
  }

  /* -------------------- طلبات استبدال المكافآت -------------------- */

  async function loadRewardRequests() {
    if (!currentTeacher) return [];

    try {
      const snapshot = await requestsRef().get();

      requestsCache = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      renderRewardRequests();
      return requestsCache;
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
      return [];
    }
  }

  function renderRewardRequests() {
    const container = el("rewardRequestsList");
    if (!container) return;

    const filtered = requestsCache.filter(request =>
      request.className === activeClass() &&
      String(request.section) === String(activeSection())
    );

    const pending = filtered.filter(request =>
      request.status === "pending"
    ).length;

    if (el("pendingCount")) {
      el("pendingCount").textContent = String(pending);
    }

    if (!activeClass() || !activeSection()) {
      container.textContent = "اختاري الصف والشعبة لعرض الطلبات.";
      return;
    }

    if (!filtered.length) {
      container.innerHTML = "<p>لا توجد طلبات استبدال في هذه الشعبة.</p>";
      return;
    }

    container.innerHTML = filtered.map(request => `
      <div class="request-card">
        <strong>${escapeHTML(request.studentName || "طالبة")}</strong>
        <div>المكافأة: ${escapeHTML(request.rewardName || "")}</div>
        <div>النقاط: ${Number(request.price) || 0}</div>
        <div>الحالة: ${escapeHTML(request.status || "pending")}</div>
        ${
          request.status === "pending"
            ? `<button type="button"
                 data-process-request="${escapeHTML(request.id)}"
                 data-new-status="approved">قبول الطلب</button>
               <button type="button"
                 data-process-request="${escapeHTML(request.id)}"
                 data-new-status="rejected">رفض الطلب</button>`
            : ""
        }
      </div>
    `).join("");
  }

  async function processRewardRequest(requestId, newStatus) {
    if (!["approved", "rejected"].includes(newStatus)) {
      showMessage("حالة الطلب غير صحيحة.", "error", "studentStatus");
      return;
    }

    try {
      requireTeacher();

      const requestRef = requestsRef().doc(requestId);

      await db.runTransaction(async transaction => {
        const requestSnapshot = await transaction.get(requestRef);

        if (!requestSnapshot.exists) {
          throw new Error("طلب الاستبدال غير موجود.");
        }

        const request = requestSnapshot.data();

        if (request.status !== "pending") {
          throw new Error("تمت معالجة هذا الطلب مسبقًا.");
        }

        let studentRef = null;
        let studentSnapshot = null;
        let pointsAfter = null;

        if (newStatus === "approved") {
          if (!request.studentId) {
            throw new Error("الطلب لا يحتوي على معرّف الطالبة.");
          }

          studentRef = studentsRef().doc(request.studentId);
          studentSnapshot = await transaction.get(studentRef);

          if (!studentSnapshot.exists) {
            throw new Error("تعذر العثور على الطالبة.");
          }

          const student = studentSnapshot.data();
          const points = Number(student.points) || 0;
          const price = Number(request.price);

          if (!Number.isSafeInteger(price) || price <= 0) {
            throw new Error("قيمة نقاط المكافأة غير صحيحة.");
          }

          if (points < price) {
            throw new Error("نقاط الطالبة غير كافية.");
          }

          pointsAfter = points - price;

          transaction.update(studentRef, {
            points: pointsAfter,
            updatedAt: serverTimestamp()
          });
        }

        transaction.update(requestRef, {
          status: newStatus,
          processedAt: serverTimestamp(),
          processedBy: currentTeacher.uid,
          ...(pointsAfter !== null ? { pointsAfter } : {})
        });
      });

      await Promise.all([loadStudents(), loadRewardRequests()]);

      showMessage(
        newStatus === "approved"
          ? "تم قبول الطلب وخصم النقاط."
          : "تم رفض الطلب.",
        "success",
        "studentStatus"
      );
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
    }
  }

  /* -------------------- واجهة التسجيل وإدارة الصفوف -------------------- */

  function showLogin() {
    if (el("loginBox")) el("loginBox").style.display = "block";
    if (el("teacherRegistrationBox")) {
      el("teacherRegistrationBox").style.display = "none";
    }
    clearMessage("loginError");
    clearMessage("registrationError");
  }

  function showRegistration() {
    if (el("loginBox")) el("loginBox").style.display = "none";
    if (el("teacherRegistrationBox")) {
      el("teacherRegistrationBox").style.display = "block";
    }
    clearMessage("loginError");
    clearMessage("registrationError");
  }

  function addRegistrationClass() {
    const container = el("registrationClasses");
    const firstRow = container?.querySelector(".registration-class-row");

    if (!container || !firstRow) return;

    const clone = firstRow.cloneNode(true);
    const select = clone.querySelector(".register-class-select");
    if (select) select.value = "";

    clone.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = false;
    });

    container.appendChild(clone);
  }

  /* -------------------- ربط الأحداث -------------------- */

tton")?.addEventListener("click", teacherLogout);

    el("studentSaveButton")?.addEventListener("click", saveStudent);
    el("rewardSaveButton")?.addEventListener("click", saveReward);

    el("cancelStudentButton")?.addEventListener(
      "click",
      cancelStudentEdit
    );

    el("cancelRewardButton")?.addEventListener("click", () => {
      editingRewardId = null;
      setValue("", "rewardName", "rewardPrice", "rewardDescription");
      setValue("🎁", "rewardIcon");

      if (el("rewardSaveButton")) {
        el("rewardSaveButton").textContent = "➕ إضافة المكافأة";
      }
      if (el("cancelRewardButton")) {
        el("cancelRewardButton").style.display = "none";
      }
    });

    el("addRegistrationClassButton")?.addEventListener(
      "click",
      addRegistrationClass
    );

    el("registrationClasses")?.addEventListener("click", event => {
      const button = event.target.closest(".remove-class-button");
      if (!button) return;

      const rows = document.querySelectorAll(".registration-class-row");

      if (rows.length <= 1) {
        showMessage(
          "يجب الاحتفاظ بصف واحد على الأقل.",
          "error",
          "registrationError"
        );
        return;
      }

      button.closest(".registration-class-row")?.remove();
    });

    el("activeClassSelect")?.addEventListener("change", updateSections);

    el("activeSectionSelect")?.addEventListener("change", () => {
      updateSelectedClassInfo();
      renderStudents();
      renderRewards();
      renderRewardRequests();
    });

    el("studentsList")?.addEventListener("click", event => {
      const editButton = event.target.closest("[data-edit-student]");
      const deleteButton = event.target.closest("[data-delete-student]");

      if (editButton) editStudent(editButton.dataset.editStudent);
      if (deleteButton) deleteStudent(deleteButton.dataset.deleteStudent);
    });

    el("rewardsManagerList")?.addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-delete-reward]");
      if (deleteButton) deleteReward(deleteButton.dataset.deleteReward);
    });

    el("rewardRequestsList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-process-request]");
      if (!button) return;

      processRewardRequest(
        button.dataset.processRequest,
        button.dataset.newStatus
      );
    });
  });

  /* -------------------- إتاحة الدوال عند الحاجة -------------------- */

  Object.assign(window, {
    teacherLogin,
    teacherRegister,
    teacherLogout,
    loadStudents,
    saveStudent,
    editStudent,
    deleteStudent,
    cancelStudentEdit,
    loadRewards,
    saveReward,
    deleteReward,
    loadRewardRequests,
    processRewardRequest
  });
}
