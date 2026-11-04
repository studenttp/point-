/* =========================================================
   نجوم صفي - teacher.js
   Firebase Compat SDK
   يستخدم تطبيق teacherApp من teacher-firebase.js
   ========================================================= */

"use strict";

if (
  !window.firebase ||
  !window.teacherApp ||
  !window.teacherAuth ||
  !window.teacherDB
) {
  console.error(
    "[نجوم صفي] Firebase غير مهيأ. تحققي من ترتيب ملفات Firebase وteacher-firebase.js."
  );

  const errorBox = document.getElementById("loginError");
  if (errorBox) {
    errorBox.textContent =
      "تعذر تهيئة الاتصال بالخدمة. أعيدي تحميل الصفحة، وإذا استمرت المشكلة فتحققي من إعدادات Firebase.";
    errorBox.style.display = "block";
  }
} else {
  initializeTeacherPanel();
}

function initializeTeacherPanel() {
  // استخدام تطبيق المعلمة المسمى teacherApp.
  const db = window.teacherDB;
  const auth = window.teacherAuth;

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
    return node ? String(node.value ?? "").trim() : "";
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
    console.error("[نجوم صفي] خطأ:", error);

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
        "الخدمة غير متاحة مؤقتًا. حاولي مجددًا.",
      "failed-precondition":
        "تعذر تنفيذ العملية بسبب إعدادات قاعدة البيانات."
    };

    return messages[code] || error?.message ||
      "حدث خطأ غير متوقع. افتحي Console لمعرفة التفاصيل.";
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

    if (el("teacherName")) {
      el("teacherName").textContent = name;
    }

    if (el("schoolName")) {
      el("schoolName").textContent = school;
    }

    if (el("subjectName")) {
      el("subjectName").value = subject;
    }

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

    if (el("className")) {
      el("className").value = className;
    }
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
    const originalText = button?.textContent || "دخول لوحة المعلمة";

    if (button) {
      button.disabled = true;
      button.textContent = "جارٍ تسجيل الدخول...";
    }

    try {
      console.log("[نجوم صفي] بدء تسجيل الدخول.");
      console.log(
        "[نجوم صفي] Firebase project:",
        auth.app.options.projectId
      );
      console.log("[نجوم صفي] Firebase app:", auth.app.name);

      const credential = await auth.signInWithEmailAndPassword(
        email,
        password
      );

      console.log(
        "[نجوم صفي] نجح تسجيل الدخول للمستخدم:",
        credential.user.uid
      );

      showMessage(
        "تم تسجيل الدخول بنجاح، جارٍ فتح لوحة المعلمة...",
        "success",
        "loginError"
      );
    } catch (error) {
      showMessage(errorMessage(error), "error", "loginError");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }
        const profile = {
        teacherId: credential.user.uid,
        name,
        email,
        schoolName,
        subjectName,
        classes,
        createdAt: serverTimestamp()
      };

      await db.collection("teachers").doc(credential.user.uid).set(profile);

      teacherProfile = {
        name,
        email,
        schoolName,
        subjectName,
        classes
      };

      showMessage(
        "تم إنشاء الحساب وحفظ بيانات المعلمة بنجاح.",
        "success",
        "registrationError"
      );
    } catch (error) {
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
      throw new Error(
        "تم تسجيل الدخول، لكن لم يُعثر على ملف المعلمة في مجموعة teachers. تحققي من حفظ الملف وصلاحيات Firestore."
      );
    }

    teacherProfile = snapshot.data() || {};
  }

  /* -------------------- مراقبة حالة المصادقة -------------------- */

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

    if (loginBox) loginBox.style.display = "none";
    if (registrationBox) registrationBox.style.display = "none";

    if (dashboard) {
      dashboard.style.display = "block";
      dashboard.setAttribute("aria-busy", "true");
    }

    try {
      await loadTeacherProfile(user);
      updateTeacherInfo();
      populateActiveClasses();

      await Promise.all([
        loadStudents(),
        loadRewards(),
        loadRewardRequests()
      ]);

      console.log("[نجوم صفي] اكتمل تحميل لوحة المعلمة.");
    } catch (error) {
      console.error(
        "[نجوم صفي] تعذر تحميل ملف المعلمة أو بيانات اللوحة:",
        error
      );
      showMessage(errorMessage(error), "error", "studentStatus");
    } finally {
      if (dashboard) dashboard.removeAttribute("aria-busy");
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
      container.innerHTML =
        "<p>لا توجد طالبات في هذه الشعبة حتى الآن.</p>";
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
          if (
          indexRef &&
          indexSnapshot?.exists &&
          indexSnapshot.data().teacherId === currentTeacher.uid &&
          indexSnapshot.data().studentId === studentId
        ) {
          transaction.delete(indexRef);
        }

        transaction.delete(studentRef);
      });

      await loadStudents();

      showMessage(
        "تم حذف الطالبة بنجاح.",
        "success",
        "studentStatus"
      );
    } catch (error) {
      showMessage(errorMessage(error), "error", "studentStatus");
    }
  }

  /* -------------------- إدارة المكافآت -------------------- */

  function getRewardFormData() {
    const name = value("rewardName");
    const priceValue = value("rewardPrice");
    const icon = value("rewardIcon") || "🎁";
    const description = value("rewardDescription");
    const price = Number(priceValue);

    if (!name) {
      throw new Error("أدخلي اسم المكافأة.");
    }

    if (
      priceValue === "" ||
      !Number.isSafeInteger(price) ||
      price <= 0
    ) {
      throw new Error("أدخلي سعرًا صحيحًا للمكافأة بالنقاط.");
    }

    return {
      name,
      price,
      icon,
      description,
      active: true
    };
  }

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

    if (!rewardsCache.length) {
      container.innerHTML = "<p>لا توجد مكافآت مضافة حتى الآن.</p>";
      return;
    }

    container.innerHTML = rewardsCache.map(reward => `
      <div class="reward-card">
        <div>
          <span>${escapeHTML(reward.icon || "🎁")}</span>
          <strong>${escapeHTML(reward.name)}</strong>
        </div>
        <div>السعر: ${Number(reward.price) || 0} نقطة</div>
        <div>${escapeHTML(reward.description || "")}</div>
        <button type="button" data-edit-reward="${escapeHTML(reward.id)}">
          تعديل
        </button>
        <button type="button" data-delete-reward="${escapeHTML(reward.id)}">
          حذف
        </button>
      </div>
    `).join("");
  }

  async function saveReward() {
    try {
      requireTeacher();

      const data = getRewardFormData();

      const rewardRef = editingRewardId
        ? rewardsRef().doc(editingRewardId)
        : rewardsRef().doc();

      await rewardRef.set({
        ...data,
        teacherId: currentTeacher.uid,
        updatedAt: serverTimestamp(),
        ...(editingRewardId ? {} : {
          createdAt: serverTimestamp()
        })
      }, { merge: true });

      editingRewardId = null;

      setValue("", "rewardName", "rewardDescription");
      setValue("1", "rewardPrice");
      setValue("🎁", "rewardIcon");

      if (el("rewardSaveButton")) {
        el("rewardSaveButton").textContent = "➕ إضافة المكافأة";
      }

      if (el("cancelRewardButton")) {
        el("cancelRewardButton").style.display = "none";
      }

      await loadRewards();

      showMessage(
        "تم حفظ المكافأة بنجاح.",
        "success",
        "rewardStatus"
      );
    } catch (error) {
      showMessage(errorMessage(error), "error", "rewardStatus");
    }
  }

  function editReward(rewardId) {
    const reward = rewardsCache.find(item => item.id === rewardId);

    if (!reward) {
      showMessage("لم يتم العثور على المكافأة.", "error", "rewardStatus");
      return;
    }

    editingRewardId = rewardId;

    setValue(reward.name, "rewardName");
    setValue(reward.price, "rewardPrice");
    setValue(reward.icon || "🎁", "rewardIcon");
    setValue(reward.description || "", "rewardDescription");

    if (el("rewardSaveButton")) {
      el("rewardSaveButton").textContent = "حفظ التعديلات";
    }

    if (el("cancelRewardButton")) {
      el("cancelRewardButton").style.display = "inline-block";
    }
  }

  function cancelRewardEdit() {
    editingRewardId = null;

    setValue("", "rewardName", "rewardDescription");
    setValue("1", "rewardPrice");
    setValue("🎁", "rewardIcon");

    if (el("rewardSaveButton")) {
      el("rewardSaveButton").textContent = "➕ إضافة المكافأة";
    }

    if (el("cancelRewardButton")) {
      el("cancelRewardButton").style.display = "none";
    }

    clearMessage("rewardStatus");
  }

  async function deleteReward(rewardId) {
    if (!confirm("هل تريدين حذف هذه المكافأة؟")) return;

    try {
      requireTeacher();

      await rewardsRef().doc(rewardId).delete();
      await loadRewards();

      showMessage(
        "تم حذف المكافأة بنجاح.",
        "success",
        "rewardStatus"
      );
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

    const pending = filtered.filter(
      request => request.status === "pending"
    ).length;

    if (el("pendingCount")) {
      el("pendingCount").textContent = String(pending);
    }

    if (!activeClass() || !activeSection()) {
      container.textContent = "اختاري الصف والشعبة لعرض الطلبات.";
      return;
    }

    if (!filtered.length) {
      container.innerHTML =
        "<p>لا توجد طلبات استبدال في هذه الشعبة.</p>";
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
            ? `
              <button
                type="button"
                data-process-request="${escapeHTML(request.id)}"
                data-new-status="approved">
                قبول الطلب
              </button>

              <button
                type="button"
                data-process-request="${escapeHTML(request.id)}"
                data-new-status="rejected">
                رفض الطلب
              </button>
            `
            : ""
        }
      </div>
    `).join("");
  }

  async function processRewardRequest(requestId, newStatus) {
    if (!["approved", "rejected"].includes(newStatus)) {
      showMessage(
        "حالة الطلب غير صحيحة.",
        "error",
        "studentStatus"
      );
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
        let pointsAfter = null;

        if (newStatus === "approved") {
          if (!request.studentId) {
            throw new Error(
              "الطلب لا يحتوي على معرّف الطالبة."
            );
          }

          studentRef = studentsRef().doc(request.studentId);

          const studentSnapshot =
            await transaction.get(studentRef);

          if (!studentSnapshot.exists) {
            throw new Error("تعذر العثور على الطالبة.");
          }

          const student = studentSnapshot.data();
          const points = Number(student.points) || 0;
          const price = Number(request.price);

          if (!Number.isSafeInteger(price) || price <= 0) {
            throw new Error(
              "قيمة نقاط المكافأة غير صحيحة."
            );
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

      await Promise.all([
        loadStudents(),
        loadRewardRequests()
      ]);

      showMessage(
        newStatus === "approved"
          ? "تم قبول الطلب وخصم النقاط."
          : "تم رفض الطلب.",
        "success",
        "studentStatus"
      );

    } catch (error) {
      showMessage(
        errorMessage(error),
        "error",
        "studentStatus"
      );
    }
  }
    /* -------------------- واجهة التسجيل -------------------- */

  function showLogin() {
    if (el("loginBox")) {
      el("loginBox").style.display = "block";
    }

    if (el("teacherRegistrationBox")) {
      el("teacherRegistrationBox").style.display = "none";
    }

    clearMessage("loginError");
    clearMessage("registrationError");
  }

  function showRegistration() {
    if (el("loginBox")) {
      el("loginBox").style.display = "none";
    }

    if (el("teacherRegistrationBox")) {
      el("teacherRegistrationBox").style.display = "block";
    }

    clearMessage("loginError");
    clearMessage("registrationError");
  }

  function addRegistrationClass() {
    const container = el("registrationClasses");
    const firstRow = container?.querySelector(
      ".registration-class-row"
    );

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

  function bindTeacherEvents() {
    const loginForm = el("teacherLoginForm");

    if (loginForm && !loginForm.dataset.bound) {
      loginForm.dataset.bound = "true";

      loginForm.addEventListener("submit", event => {
        event.preventDefault();
        teacherLogin();
      });
    }

    const registrationForm = el("teacherRegistrationForm");

    if (registrationForm && !registrationForm.dataset.bound) {
      registrationForm.dataset.bound = "true";

      registrationForm.addEventListener("submit", event => {
        event.preventDefault();
        teacherRegister();
      });
    }

    const bindClick = (id, handler) => {
      const node = el(id);

      if (!node || node.dataset.bound) return;

      node.dataset.bound = "true";
      node.addEventListener("click", handler);
    };

    bindClick("showRegisterButton", showRegistration);
    bindClick("backToLoginButton", showLogin);
    bindClick("resetPasswordButton", resetPassword);
    bindClick("logoutButton", teacherLogout);

    bindClick("studentSaveButton", saveStudent);
    bindClick("rewardSaveButton", saveReward);
    bindClick("cancelStudentButton", cancelStudentEdit);

    bindClick("cancelRewardButton", () => {
      editingRewardId = null;

      setValue(
        "",
        "rewardName",
        "rewardPrice",
        "rewardDescription"
      );

      setValue("🎁", "rewardIcon");

      if (el("rewardSaveButton")) {
        el("rewardSaveButton").textContent = "➕ إضافة المكافأة";
      }

      if (el("cancelRewardButton")) {
        el("cancelRewardButton").style.display = "none";
      }
    });

    bindClick(
      "addRegistrationClassButton",
      addRegistrationClass
    );

    const registrationClasses = el("registrationClasses");

    if (
      registrationClasses &&
      !registrationClasses.dataset.bound
    ) {
      registrationClasses.dataset.bound = "true";

      registrationClasses.addEventListener("click", event => {
        const button = event.target.closest(
          ".remove-class-button"
        );

        if (!button) return;

        const rows = document.querySelectorAll(
          ".registration-class-row"
        );

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
    }

    const classSelect = el("activeClassSelect");

    if (classSelect && !classSelect.dataset.bound) {
      classSelect.dataset.bound = "true";
      classSelect.addEventListener("change", updateSections);
    }

    const sectionSelect = el("activeSectionSelect");

    if (sectionSelect && !sectionSelect.dataset.bound) {
      sectionSelect.dataset.bound = "true";

      sectionSelect.addEventListener("change", () => {
        updateSelectedClassInfo();
        renderStudents();
        renderRewards();
        renderRewardRequests();
      });
    }

    const studentsList = el("studentsList");

    if (studentsList && !studentsList.dataset.bound) {
      studentsList.dataset.bound = "true";

      studentsList.addEventListener("click", event => {
        const editButton = event.target.closest(
          "[data-edit-student]"
        );

        const deleteButton = event.target.closest(
          "[data-delete-student]"
        );

        if (editButton) {
          editStudent(editButton.dataset.editStudent);
        }

        if (deleteButton) {
          deleteStudent(deleteButton.dataset.deleteStudent);
        }
      });
    }

    const rewardsList = el("rewardsManagerList");

    if (rewardsList && !rewardsList.dataset.bound) {
      rewardsList.dataset.bound = "true";

      rewardsList.addEventListener("click", event => {
        const deleteButton = event.target.closest(
          "[data-delete-reward]"
        );

        if (deleteButton) {
          deleteReward(deleteButton.dataset.deleteReward);
        }
      });
    }

    const requestsList = el("rewardRequestsList");

    if (requestsList && !requestsList.dataset.bound) {
      requestsList.dataset.bound = "true";

      requestsList.addEventListener("click", event => {
        const button = event.target.closest(
          "[data-process-request]"
        );

        if (!button) return;

        processRewardRequest(
          button.dataset.processRequest,
          button.dataset.newStatus
        );
      });
    }
  }

  /* -------------------- تشغيل ربط الأحداث -------------------- */

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bindTeacherEvents,
      { once: true }
    );
  } else {
    bindTeacherEvents();
  }

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