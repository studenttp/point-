
/* =========================================================
   نجوم صَفّي — teacher.js
   تسجيل المعلمين وإدارة الطلاب والنقاط والمكافآت والطلبات
   يعتمد على teacher-firebase.js:
   teacherApp, teacherAuth, teacherDB
   ========================================================= */

(() => {
  "use strict";

  // منع تشغيل الملف مرتين إذا تم تضمينه بالخطأ أكثر من مرة.
  if (window.__najoomTeacherJSLoaded) return;
  window.__najoomTeacherJSLoaded = true;

  const $ = (id) => document.getElementById(id);

  // Firebase الخاص بالمعلمين فقط.
  const auth = window.teacherAuth;
  const db = window.teacherDB;

  if (!auth || !db) {
    console.error(
      "نجوم صفي: لم يتم العثور على teacherAuth أو teacherDB. تأكدي من تحميل teacher-firebase.js قبل teacher.js."
    );
    return;
  }

  let currentTeacher = null;
  let teacherProfile = null;
  let lastInitializedUid = null;
  let isRegistering = false;
  let dashboardListenersBound = false;

  let studentsCache = [];
  let rewardsCache = [];
  let requestsCache = [];

  let editingStudentId = null;
  let editingRewardId = null;

  let activeClass = "";
  let activeSection = "";

  const teacherDoc = () => {
    if (!currentTeacher) throw new Error("يجب تسجيل الدخول أولًا.");
    return db.collection("teachers").doc(currentTeacher.uid);
  };

  const studentsCollection = () => teacherDoc().collection("students");
  const rewardsCollection = () => teacherDoc().collection("rewards");
  const requestsCollection = () => teacherDoc().collection("rewardRequests");

  // ---------------------------------------------------------
  // أدوات مساعدة
  // ---------------------------------------------------------

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value ?? "";
  }

  function setStatus(id, message, isError = false) {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#c62828" : "#237547";
    element.setAttribute("role", "status");
  }

  function showElement(element, visible) {
    if (element) element.hidden = !visible;
  }

  function showLoginError(message) {
    setStatus("loginError", message, true);
  }

  function clearLoginError() {
    setStatus("loginError", "");
  }

  function getErrorMessage(error) {
    const code = error?.code || "";

    const messages = {
      "auth/email-already-in-use":
        "هذا البريد الإلكتروني مسجل مسبقًا.",
      "auth/invalid-email":
        "صيغة البريد الإلكتروني غير صحيحة.",
      "auth/weak-password":
        "كلمة المرور ضعيفة. استخدمي كلمة مرور لا تقل عن 6 أحرف.",
      "auth/invalid-credential":
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/user-not-found":
        "لا يوجد حساب بهذا البريد الإلكتروني.",
      "auth/wrong-password":
        "كلمة المرور غير صحيحة.",
      "auth/too-many-requests":
        "تمت محاولات كثيرة. حاولي مرة أخرى لاحقًا.",
      "auth/network-request-failed":
        "تعذر الاتصال بالإنترنت. تحققي من الاتصال وحاولي مجددًا.",
      "permission-denied":
        "لا توجد صلاحية لتنفيذ العملية. تحققي من قواعد Firestore.",
      "unavailable":
        "الخدمة غير متاحة مؤقتًا. حاولي مرة أخرى."
    };

    return messages[code] || error?.message || "حدث خطأ غير متوقع.";
  }

  function normalizeString(value) {
    return String(value ?? "").trim();
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "—";

    let date = value;

    if (typeof value.toDate === "function") {
      date = value.toDate();
    } else if (!(value instanceof Date)) {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("ar-OM");
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getClassesFromProfile(profile) {
    if (!Array.isArray(profile?.classes)) return [];

    return profile.classes
      .map((item) => {
        if (typeof item === "string") {
          return { name: item, sections: [] };
        }

        return {
          name: normalizeString(item?.name || item?.className),
          sections: Array.isArray(item?.sections)
            ? item.sections.map(normalizeString).filter(Boolean)
            : []
        };
      })
      .filter((item) => item.name);
  }

  function getSelectedClassFromForm() {
    const select = $("activeClassSelect");
    return normalizeString(select?.value || activeClass);
  }

  function getSelectedSectionFromForm() {
    const select = $("activeSectionSelect");
    return normalizeString(select?.value || activeSection);
  }

  function getStudentClass(student) {
    return normalizeString(student.className || student.class);
  }

  function getStudentSection(student) {
    return normalizeString(student.section);
  }

  function studentMatchesActiveClass(student) {
    const className = getSelectedClassFromForm();
    const section = getSelectedSectionFromForm();

    if (className && getStudentClass(student) !== className) return false;
    if (section && getStudentSection(student) !== section) return false;

    return true;
  }

  // ---------------------------------------------------------
  // التنقل بين واجهات الدخول والتسجيل ولوحة التحكم
  // ---------------------------------------------------------

  function showLoginView() {
    showElement($("teacherLoginSection"), true);
    showElement($("teacherRegistrationSection"), false);
    showElement($("teacherDashboard"), false);
  }

  function showRegistrationView() {
    showElement($("teacherLoginSection"), false);
    showElement($("teacherRegistrationSection"), true);
    showElement($("teacherDashboard"), false);
    clearLoginError();
  }

  function showDashboardView() {
    showElement($("teacherLoginSection"), false);
    showElement($("teacherRegistrationSection"), false);
    showElement($("teacherDashboard"), true);
  }

  // دعم الأسماء المستخدمة في أزرار HTML القديمة.
  window.showTeacherRegistration = showRegistrationView;
  window.hideTeacherRegistration = showLoginView;
  window.showRegistration = showRegistrationView;

  // ---------------------------------------------------------
  // قراءة صفوف الصفوف والشعب من نموذج التسجيل
  // ---------------------------------------------------------

  function readRegistrationClasses() {
    const rows = document.querySelectorAll(".registration-class-row");
    const classes = [];

    rows.forEach((row) => {
      const classSelect = row.querySelector(".register-class-select");
      const className = normalizeString(classSelect?.value);

      if (!className) return;

      const sections = Array.from(
        row.querySelectorAll('input[type="checkbox"]:checked')
      )
        .map((checkbox) => normalizeString(checkbox.value))
        .filter(Boolean);

      const existing = classes.find((item) => item.name === className);

      if (existing) {
        existing.sections = [
          ...new Set([...existing.sections, ...sections])
        ];
      } else {
        classes.push({
          name: className,
          sections: [...new Set(sections)]
        });
      }
    });

    return classes;
  }

  // ---------------------------------------------------------
  // تسجيل معلم جديد
  // ---------------------------------------------------------

  async function registerTeacher(event) {
    event?.preventDefault();

    if (isRegistering) return;

    const name = normalizeString($("registerTeacherName")?.value);
    const school = normalizeString($("registerSchoolName")?.value);
    const subject = normalizeString($("registerSubjectName")?.value);
    const email = normalizeString($("registerTeacherEmail")?.value).toLowerCase();
    const password = $("registerTeacherPassword")?.value || "";
    const confirmPassword = $("confirmTeacherPassword")?.value || "";
    const classes = readRegistrationClasses();

    if (!name || !school || !subject || !email || !password) {
      setStatus("registrationStatus", "يرجى تعبئة جميع البيانات المطلوبة.", true);
      return;
    }

    if (password.length < 6) {
      setStatus(
        "registrationStatus",
        "يجب ألا تقل كلمة المرور عن 6 أحرف.",
        true
      );
      return;
    }

    if (password !== confirmPassword) {
      setStatus("registrationStatus", "كلمتا المرور غير متطابقتين.", true);
      return;
    }

    if (!classes.length) {
      setStatus(
        "registrationStatus",
        "يرجى اختيار صف دراسي واحد على الأقل.",
        true
      );
      return;
    }

    isRegistering = true;

    const submitButton = $("teacherRegistrationForm")?.querySelector(
      'button[type="submit"]'
    );
    if (submitButton) submitButton.disabled = true;

    setStatus("registrationStatus", "جارٍ إنشاء حساب المعلم...");

    try {
      const credential = await auth.createUserWithEmailAndPassword(
        email,
        password
      );

      const user = credential.user;

      await user.updateProfile({ displayName: name });

      // يجب أن تتوافق أسماء الحقول مع قواعد Firestore المنشورة.
      const profile = {
        name,
        school,
        subject,
        email,
        classes,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      try {
        await db.collection("teachers").doc(user.uid).set(profile);
      } catch (profileError) {
        console.error("تعذر حفظ ملف المعلم:", profileError);

        setStatus(
          "registrationStatus",
          "تم إنشاء حساب الدخول، لكن تعذر حفظ بيانات المعلم. لا تنشئي حسابًا جديدًا؛ سجّلي الدخول بهذا البريد وحاولي إكمال إعداد الملف بعد تصحيح صلاحيات Firestore.",
          true
        );

        return;
      }

      teacherProfile = {
        name,
        school,
        subject,
        email,
        classes
      };

      setStatus(
        "registrationStatus",
        "تم إنشاء الحساب وحفظ بيانات المعلم بنجاح."
      );

      // لا نستدعي initializeDashboard هنا؛ مستمع تسجيل الدخول
      // هو المسؤول عن تهيئة اللوحة لتجنب التهيئة المكررة.
    } catch (error) {
      console.error("خطأ تسجيل المعلم:", error);
      setStatus(
        "registrationStatus",
        getErrorMessage(error),
        true
      );
    } finally {
      isRegistering = false;
      if (submitButton) submitButton.disabled = false;
    }
  }

  // ---------------------------------------------------------
  // تسجيل الدخول واستعادة كلمة المرور
  // ---------------------------------------------------------

  async function loginTeacher(event) {
    event?.preventDefault();

    const email = normalizeString($("teacherEmail")?.value).toLowerCase();
    const password = $("teacherPassword")?.value || "";

    if (!email || !password) {
      showLoginError("أدخلي البريد الإلكتروني وكلمة المرور.");
      return;
    }

    const button = $("teacherLoginButton");
    if (button) button.disabled = true;

    clearLoginError();

    try {
      await auth.signInWithEmailAndPassword(email, password);
      // تتم قراءة ملف المعلم وفتح اللوحة عبر onAuthStateChanged.
    } catch (error) {
      console.error("خطأ تسجيل الدخول:", error);
      showLoginError(getErrorMessage(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function resetTeacherPassword() {
    const email = normalizeString($("teacherEmail")?.value).toLowerCase();

    if (!email) {
      showLoginError("أدخلي بريدك الإلكتروني أولًا لاستعادة كلمة المرور.");
      return;
    }

    try {
      await auth.sendPasswordResetEmail(email);
      setStatus(
        "loginError",
        "إذا كان البريد مسجلًا، فستصلك رسالة لإعادة تعيين كلمة المرور."
      );
    } catch (error) {
      console.error("خطأ استعادة كلمة المرور:", error);
      showLoginError(getErrorMessage(error));
    }
  }

  async function logoutTeacher() {
    try {
      await auth.signOut();
      currentTeacher = null;
      teacherProfile = null;
      lastInitializedUid = null;
      studentsCache = [];
      rewardsCache = [];
      requestsCache = [];
      showLoginView();
    } catch (error) {
      console.error("خطأ تسجيل الخروج:", error);
      alert("تعذر تسجيل الخروج. حاولي مرة أخرى.");
    }
  }

  // ---------------------------------------------------------
  // تحميل ملف المعلم
  // ---------------------------------------------------------

  async function loadTeacherProfile(user) {
    const profileRef = db.collection("teachers").doc(user.uid);
    const snapshot = await profileRef.get();

    if (snapshot.exists) {
      const data = snapshot.data() || {};

      teacherProfile = {
        ...data,
        classes: getClassesFromProfile(data)
      };

      return teacherProfile;
    }

    // يسمح باستكمال إنشاء الملف إذا سبق إنشاء حساب الدخول
    // وفشل حفظ الملف الشخصي.
    if (user.email) {
      const fallbackProfile = {
        name: user.displayName || "",
        school: "",
        subject: "",
        email: user.email,
        classes: [],
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      return {
        ...fallbackProfile,
        _missingProfile: true
      };
    }

    throw new Error("لم يتم العثور على ملف المعلم.");
  }

  async function completeMissingTeacherProfile(profile) {
    if (!currentTeacher || !profile?._missingProfile) return profile;

    // لا يمكن استنتاج المدرسة أو المادة أو الصفوف تلقائيًا.
    // نعرض اللوحة مع رسالة توضح أن الملف يحتاج إلى إكمال التسجيل.
    setStatus(
      "teacherProfileStatus",
      "حساب الدخول موجود، لكن ملف المعلم غير مكتمل. سجّلي بيانات المدرسة والمادة والصفوف من نموذج التسجيل أو أصلحي ملف المعلم في Firestore.",
      true
    );

    return profile;
  }

  // ---------------------------------------------------------
  // تهيئة لوحة المعلم
  // ---------------------------------------------------------

  async function initializeDashboard() {
    if (!currentTeacher) return;

    if (lastInitializedUid === currentTeacher.uid) {
      showDashboardView();
      return;
    }

    lastInitializedUid = currentTeacher.uid;

    try {
      const profile = await loadTeacherProfile(currentTeacher);

      // قد يكون المستخدم قد سجّل الخروج أثناء تحميل الملف.
      if (!currentTeacher || auth.currentUser?.uid !== currentTeacher.uid) {
        return;
      }

      teacherProfile = await completeMissingTeacherProfile(profile);

      setText(
        "teacherName",
        teacherProfile.name || currentTeacher.displayName || "المعلم"
      );
      setText("schoolName", teacherProfile.school || "—");
      setText("subjectName", teacherProfile.subject || "—");

      populateClassSelectors();

      bindDashboardEvents();
      showDashboardView();

      await refreshDashboardData();
    } catch (error) {
      console.error("تعذر تهيئة لوحة المعلم:", error);

      setStatus(
        "teacherProfileStatus",
        "تعذر تحميل بيانات المعلم: " + getErrorMessage(error),
        true
      );

      // لا نُخرج المستخدم تلقائيًا عند فشل مؤقت في قراءة Firestore.
      showDashboardView();
    }
  }

  function populateClassSelectors() {
    const classes = getClassesFromProfile(teacherProfile);
    const classSelect = $("activeClassSelect");
    const sectionSelect = $("activeSectionSelect");

    if (!classSelect) return;

    const previousClass = classSelect.value || activeClass;

    classSelect.innerHTML = "";

    if (!classes.length) {
      classSelect.add(new Option("لا توجد صفوف مسجلة", ""));
      activeClass = "";
      activeSection = "";
      if (sectionSelect) {
        sectionSelect.innerHTML = "";
        sectionSelect.add(new Option("—", ""));
      }
      setText("className", "—");
      setText("selectedClass", "—");
      setText("selectedSection", "—");
      return;
    }

    classes.forEach((item) => {
      classSelect.add(new Option(item.name, item.name));
    });

    activeClass = classes.some((item) => item.name === previousClass)
      ? previousClass
      : classes[0].name;

    classSelect.value = activeClass;
    populateSectionSelector();
  }

  function populateSectionSelector() {
    const classes = getClassesFromProfile(teacherProfile);
    const selected = classes.find((item) => item.name === activeClass);
    const sectionSelect = $("activeSectionSelect");

    if (!sectionSelect) return;

    const previousSection = sectionSelect.value || activeSection;
    sectionSelect.innerHTML = "";

    const sections = selected?.sections || [];

    // إذا لم توجد شعب مسجلة، نعرض خيارًا عامًا.
    if (!sections.length) {
      sectionSelect.add(new Option("جميع الشعب", ""));
      activeSection = "";
    } else {
      sectionSelect.add(new Option("جميع الشعب", ""));

      sections.forEach((section) => {
        sectionSelect.add(new Option(section, section));
      });

      activeSection = sections.includes(previousSection)
        ? previousSection
        : "";
    }

    sectionSelect.value = activeSection;

    setText("className", activeClass || "—");
    setText("selectedClass", activeClass || "—");
    setText("selectedSection", activeSection || "جميع الشعب");
  }

  // ---------------------------------------------------------
  // تحميل البيانات
  // ---------------------------------------------------------

  async function refreshDashboardData() {
    if (!currentTeacher) return;

    try {
      const [studentsSnapshot, rewardsSnapshot, requestsSnapshot] =
        await Promise.all([
          studentsCollection().get(),
          rewardsCollection().get(),
          requestsCollection().get()
        ]);

      studentsCache = studentsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      rewardsCache = rewardsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      requestsCache = requestsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      renderStudents();
      renderUnifiedStudents();
      renderRewards();
      renderRewardRequests();
    } catch (error) {
      console.error("تعذر تحميل بيانات لوحة المعلم:", error);

      setStatus(
        "studentStatus",
        "تعذر تحميل البيانات. تحققي من قواعد Firestore.",
        true
      );
    }
  }

  // ---------------------------------------------------------
  // الطلاب: إضافة وتعديل وحذف
  // ---------------------------------------------------------

  function resetStudentForm() {
    editingStudentId = null;

    if ($("studentName")) $("studentName").value = "";
    if ($("studentCode")) $("studentCode").value = "";
    if ($("studentPoints")) $("studentPoints").value = "0";
    if ($("studentMessage")) $("studentMessage").value = "";

    if ($("studentSaveButton")) {
      $("studentSaveButton").textContent = "حفظ الطالب";
    }

    showElement($("cancelStudentButton"), false);
  }

  function cancelStudentEdit() {
    resetStudentForm();
    setStatus("studentStatus", "");
  }

  async function saveStudent(event) {
    event?.preventDefault();

    if (!currentTeacher) {
      setStatus("studentStatus", "يرجى تسجيل الدخول أولًا.", true);
      return;
    }

    const name = normalizeString($("studentName")?.value);
    const code = normalizeString($("studentCode")?.value);
    const points = toNumber($("studentPoints")?.value, NaN);
    const message = normalizeString($("studentMessage")?.value);
    const className = getSelectedClassFromForm();
    const section = getSelectedSectionFromForm();

    if (!name || !code) {
      setStatus("studentStatus", "أدخلي اسم الطالب ورمزه.", true);
      return;
    }

    if (!Number.isFinite(points) || points < 0) {
      setStatus(
        "studentStatus",
        "أدخلي عدد نقاط صحيحًا لا يقل عن صفر.",
        true
      );
      return;
    }

    if (!className) {
      setStatus("studentStatus", "اختاري الصف الدراسي أولًا.", true);
      return;
    }

    try {
      const duplicate = studentsCache.find(
        (student) =>
          normalizeString(student.code) === code &&
          student.id !== editingStudentId
      );

      if (duplicate) {
        setStatus(
          "studentStatus",
          "رمز الطالب مستخدم لطالب آخر في حسابك.",
          true
        );
        return;
      }

      const studentData = {
        name,
        code,
        points,
        message,
        className,
        section,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (editingStudentId) {
        await studentsCollection()
          .doc(editingStudentId)
          .update(studentData);

        setStatus("studentStatus", "تم تحديث بيانات الطالب.");
      } else {
        studentData.createdAt =
          firebase.firestore.FieldValue.serverTimestamp();

        await studentsCollection().add(studentData);

        setStatus("studentStatus", "تمت إضافة الطالب بنجاح.");
      }

      resetStudentForm();
      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ حفظ الطالب:", error);
      setStatus("studentStatus", getErrorMessage(error), true);
    }
  }

  function editStudent(studentId) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    editingStudentId = studentId;

    if ($("studentName")) $("studentName").value = student.name || "";
    if ($("studentCode")) $("studentCode").value = student.code || "";
    if ($("studentPoints")) $("studentPoints").value = toNumber(student.points);
    if ($("studentMessage")) $("studentMessage").value = student.message || "";

    if ($("studentSaveButton")) {
      $("studentSaveButton").textContent = "حفظ التعديلات";
    }

    showElement($("cancelStudentButton"), true);
    setStatus("studentStatus", "تعديل بيانات الطالب.");
    $("studentName")?.focus();
  }

  async function deleteStudent(studentId) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    if (!confirm(`هل تريدين حذف الطالب "${student.name || ""}"؟`)) {
      return;
    }

    try {
      await studentsCollection().doc(studentId).delete();

      if (editingStudentId === studentId) resetStudentForm();

      setStatus("studentStatus", "تم حذف الطالب.");
      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ حذف الطالب:", error);
      setStatus("studentStatus", getErrorMessage(error), true);
    }
  }

  async function changeStudentPoints(studentId, change) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    const currentPoints = toNumber(student.points);
    const newPoints = currentPoints + change;

    if (newPoints < 0) {
      alert("لا يمكن أن تصبح نقاط الطالب أقل من صفر.");
      return;
    }

    try {
      await studentsCollection().doc(studentId).update({
        points: newPoints,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ تحديث النقاط:", error);
      alert(getErrorMessage(error));
    }
  }

  function renderStudents() {
    const container = $("studentsList");
    if (!container) return;

    const students = studentsCache.filter(studentMatchesActiveClass);

    if (!students.length) {
      container.innerHTML = "<p>لا يوجد طلاب في الصف والشعبة المحددين.</p>";
      return;
    }

    container.innerHTML = students.map((student) => `
      <div class="student-card" data-student-id="${escapeHTML(student.id)}">
        <div class="student-card-info">
          <strong>${escapeHTML(student.name || "بدون اسم")}</strong>
          <p>الرمز: ${escapeHTML(student.code || "—")}</p>
          <p>النقاط: <strong>${toNumber(student.points)}</strong></p>
          <p>الصف: ${escapeHTML(getStudentClass(student) || "—")}</p>
          <p>الشعبة: ${escapeHTML(getStudentSection(student) || "—")}</p>
          ${student.message
            ? `<p>${escapeHTML(student.message)}</p>`
            : ""}
        </div>

        <div class="student-card-actions">
          <button type="button" data-action="add-point"
            data-id="${escapeHTML(student.id)}">+ نقطة</button>
          <button type="button" data-action="remove-point"
            data-id="${escapeHTML(student.id)}">− نقطة</button>
          <button type="button" data-action="edit-student"
            data-id="${escapeHTML(student.id)}">تعديل</button>
          <button type="button" data-action="delete-student"
            data-id="${escapeHTML(student.id)}">حذف</button>
        </div>
      </div>
    `).join("");
  }

  function renderUnifiedStudents() {
    const container = $("unifiedStudentsList");
    if (!container) return;

    const students = studentsCache.filter(studentMatchesActiveClass);

    if (!students.length) {
      container.innerHTML = "<p>لا يوجد طلاب لعرضهم.</p>";
      return;
    }

    container.innerHTML = students.map((student) => `
      <div class="unified-student-row">
        <strong>${escapeHTML(student.name || "بدون اسم")}</strong>
        <span>الرمز: ${escapeHTML(student.code || "—")}</span>
        <span>النقاط: ${toNumber(student.points)}</span>
        <span>${escapeHTML(getStudentClass(student) || "—")}</span>
        <span>${escapeHTML(getStudentSection(student) || "—")}</span>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------
  // المكافآت: إضافة وتعديل وحذف
  // ---------------------------------------------------------

  function resetRewardForm() {
    editingRewardId = null;

    if ($("rewardName")) $("rewardName").value = "";
    if ($("rewardPrice")) $("rewardPrice").value = "";
    if ($("rewardIcon")) $("rewardIcon").value = "🎁";
    if ($("rewardDescription")) $("rewardDescription").value = "";

    if ($("rewardSaveButton")) {
      $("rewardSaveButton").textContent = "حفظ المكافأة";
    }

    showElement($("cancelRewardButton"), false);
  }

  function cancelRewardEdit() {
    resetRewardForm();
    setStatus("rewardStatus", "");
  }

  async function saveReward(event) {
    event?.preventDefault();

    if (!currentTeacher) {
      setStatus("rewardStatus", "يرجى تسجيل الدخول أولًا.", true);
      return;
    }

    const name = normalizeString($("rewardName")?.value);
    const price = toNumber($("rewardPrice")?.value, NaN);
    const icon = normalizeString($("rewardIcon")?.value) || "🎁";
    const description = normalizeString($("rewardDescription")?.value);

    if (!name) {
      setStatus("rewardStatus", "أدخلي اسم المكافأة.", true);
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setStatus("rewardStatus", "أدخلي تكلفة صحيحة أكبر من صفر.", true);
      return;
    }

    try {
      const rewardData = {
        name,
        price,
        icon,
        description,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (editingRewardId) {
        await rewardsCollection().doc(editingRewardId).update(rewardData);
        setStatus("rewardStatus", "تم تحديث المكافأة.");
      } else {
        rewardData.createdAt =
          firebase.firestore.FieldValue.serverTimestamp();

        rewardData.active = true;

        await rewardsCollection().add(rewardData);
        setStatus("rewardStatus", "تمت إضافة المكافأة بنجاح.");
      }

      resetRewardForm();
      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ حفظ المكافأة:", error);
      setStatus("rewardStatus", getErrorMessage(error), true);
    }
  }

  function editReward(rewardId) {
    const reward = rewardsCache.find((item) => item.id === rewardId);
    if (!reward) return;

    editingRewardId = rewardId;

    if ($("rewardName")) $("rewardName").value = reward.name || "";
    if ($("rewardPrice")) $("rewardPrice").value = toNumber(reward.price);
    if ($("rewardIcon")) $("rewardIcon").value = reward.icon || "🎁";
    if ($("rewardDescription")) {
      $("rewardDescription").value = reward.description || "";
    }

    if ($("rewardSaveButton")) {
      $("rewardSaveButton").textContent = "حفظ التعديلات";
    }

    showElement($("cancelRewardButton"), true);
    setStatus("rewardStatus", "تعديل بيانات المكافأة.");
    $("rewardName")?.focus();
  }

  async function deleteReward(rewardId) {
    const reward = rewardsCache.find((item) => item.id === rewardId);
    if (!reward) return;

    if (!confirm(`هل تريدين حذف المكافأة "${reward.name || ""}"؟`)) {
      return;
    }

    try {
      await rewardsCollection().doc(rewardId).delete();

      if (editingRewardId === rewardId) resetRewardForm();

      setStatus("rewardStatus", "تم حذف المكافأة.");
      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ حذف المكافأة:", error);
      setStatus("rewardStatus", getErrorMessage(error), true);
    }
  }

  function renderRewards() {
    const container = $("rewardsManagerList");
    if (!container) return;

    if (!rewardsCache.length) {
      container.innerHTML = "<p>لم تتم إضافة مكافآت بعد.</p>";
      return;
    }

    container.innerHTML = rewardsCache.map((reward) => `
      <div class="reward-manager-card">
        <div>
          <strong>
            ${escapeHTML(reward.icon || "🎁")}
            ${escapeHTML(reward.name || "مكافأة")}
          </strong>
          <p>التكلفة: ${toNumber(reward.price)} نقطة</p>
          ${reward.description
            ? `<p>${escapeHTML(reward.description)}</p>`
            : ""}
        </div>

        <div class="reward-manager-actions">
          <button type="button" data-action="edit-reward"
            data-id="${escapeHTML(reward.id)}">تعديل</button>
          <button type="button" data-action="delete-reward"
            data-id="${escapeHTML(reward.id)}">حذف</button>
        </div>
      </div>
    `).join("");
  }

  // ---------------------------------------------------------
  // طلبات استبدال المكافآت
  // ---------------------------------------------------------

  function getRequestStatus(request) {
    return normalizeString(request.status || "pending").toLowerCase();
  }

  function isPendingRequest(request) {
    return [
      "pending",
      "waiting",
      "قيد الانتظار",
      "معلق"
    ].includes(getRequestStatus(request));
  }

  function getRequestStudentId(request) {
    return request.studentId || request.studentDocId || "";
  }

  function getRequestRewardName(request) {
    return request.rewardName || request.name || request.reward || "مكافأة";
  }

  function renderRewardRequests() {
    const container = $("rewardRequestsList");
    if (!container) return;

    const pending = requestsCache.filter(isPendingRequest);
    setText("pendingCount", pending.length);

    if (!requestsCache.length) {
      container.innerHTML = "<p>لا توجد طلبات استبدال حاليًا.</p>";
      return;
    }

    container.innerHTML = requestsCache.map((request) => {
      const status = getRequestStatus(request);
      const pendingRequest = isPendingRequest(request);
      const studentName =
        request.studentName || request.nameOfStudent || "طالب";
      const rewardName = getRequestRewardName(request);
      const price = toNumber(
        request.price ?? request.rewardPrice ?? request.pointsCost,
        0
      );

      return `
        <div class="reward-request-card">
          <div>
            <strong>${escapeHTML(studentName)}</strong>
            <p>المكافأة: ${escapeHTML(rewardName)}</p>
            <p>التكلفة: ${price} نقطة</p>
            <p>الحالة: ${escapeHTML(status)}</p>
            <p>التاريخ: ${escapeHTML(formatDate(request.createdAt))}</p>
          </div>

          ${pendingRequest ? `
            <div class="reward-request-actions">
              <button type="button" data-action="approve-request"
                data-id="${escapeHTML(request.id)}">قبول الطلب</button>
              <button type="button" data-action="reject-request"
                data-id="${escapeHTML(request.id)}">رفض الطلب</button>
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
  }

  async function updateRequestStatus(requestId, newStatus) {
    const request = requestsCache.find((item) => item.id === requestId);
    if (!request || !isPendingRequest(request)) return;

    try {
      await requestsCollection().doc(requestId).update({
        status: newStatus,
        reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      await refreshDashboardData();
    } catch (error) {
      console.error("خطأ تحديث حالة الطلب:", error);
      alert(getErrorMessage(error));
    }
  }

  async function approveRewardRequest(requestId) {
    const request = requestsCache.find((item) => item.id === requestId);
    if (!request || !isPendingRequest(request)) return;

    const studentId = getRequestStudentId(request);
    const cost = toNumber(
      request.price ?? request.rewardPrice ?? request.pointsCost,
      0
    );

    if (!studentId) {
      alert(
        "لا يمكن خصم النقاط تلقائيًا لأن الطلب لا يحتوي على معرّف مستند الطالب. تحققي من بنية بيانات الطلب."
      );
      return;
    }

    if (cost < 0) {
      alert("تكلفة المكافأة غير صحيحة.");
      return;
    }

    if (!confirm("هل تريدين قبول الطلب وخصم نقاط المكافأة؟")) return;

    try {
      const requestRef = requestsCollection().doc(requestId);
      const studentRef = studentsCollection().doc(studentId);

      await db.runTransaction(async (transaction) => {
        const [requestSnapshot, studentSnapshot] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(studentRef)
        ]);

        if (!requestSnapshot.exists) {
          throw new Error("طلب الاستبدال غير موجود.");
        }

        if (!studentSnapshot.exists) {
          throw new Error("لم يتم العثور على الطالب المرتبط بالطلب.");
        }

        const latestRequest = requestSnapshot.data() || {};

        if (!isPendingRequest(latestRequest)) {
          throw new Error("تمت معالجة هذا الطلب مسبقًا.");
        }

        const student = studentSnapshot.data() || {};
        const currentPoints = toNumber(student.points);

        if (currentPoints < cost) {
          throw new Error("نقاط الطالب غير كافية لقبول الطلب.");
        }

        transaction.update(studentRef, {
          points: currentPoints - cost,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(requestRef, {
          status: "approved",
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      await refreshDashboardData();
      alert("تم قبول الطلب وخصم النقاط.");
    } catch (error) {
      console.error("خطأ قبول الطلب:", error);
      alert(getErrorMessage(error));
    }
  }

  async function rejectRewardRequest(requestId) {
    if (!confirm("هل تريدين رفض طلب استبدال المكافأة؟")) return;

    await updateRequestStatus(requestId, "rejected");
  }

  // ---------------------------------------------------------
  // أحداث لوحة التحكم
  // ---------------------------------------------------------

  function bindDashboardEvents() {
    if (dashboardListenersBound) return;
    dashboardListenersBound = true;

    $("studentSaveButton")?.addEventListener("click", saveStudent);
    $("cancelStudentButton")?.addEventListener("click", cancelStudentEdit);

    $("rewardSaveButton")?.addEventListener("click", saveReward);
    $("cancelRewardButton")?.addEventListener("click", cancelRewardEdit);

    $("logoutButton")?.addEventListener("click", logoutTeacher);

    $("activeClassSelect")?.addEventListener("change", () => {
      activeClass = getSelectedClassFromForm();
      activeSection = "";
      populateSectionSelector();
      renderStudents();
      renderUnifiedStudents();
    });

    $("activeSectionSelect")?.addEventListener("change", () => {
      activeSection = getSelectedSectionFromForm();

      setText("selectedSection", activeSection || "جميع الشعب");

      renderStudents();
      renderUnifiedStudents();
    });

    $("studentsList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      if (action === "add-point") {
        await changeStudentPoints(id, 1);
      } else if (action === "remove-point") {
        await changeStudentPoints(id, -1);
      } else if (action === "edit-student") {
        editStudent(id);
      } else if (action === "delete-student") {
        await deleteStudent(id);
      }
    });

    $("rewardsManagerList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      if (action === "edit-reward") {
        editReward(id);
      } else if (action === "delete-reward") {
        await deleteReward(id);
      }
    });

    $("rewardRequestsList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const id = button.dataset.id;
      const action = button.dataset.action;

      if (action === "approve-request") {
        await approveRewardRequest(id);
      } else if (action === "reject-request") {
        await rejectRewardRequest(id);
      }
    });
  }

  // ---------------------------------------------------------
  // ربط نماذج تسجيل الدخول والتسجيل
  // ---------------------------------------------------------

  function bindAuthenticationEvents() {
    $("teacherLoginForm")?.addEventListener("submit", loginTeacher);
    $("teacherRegistrationForm")?.addEventListener("submit", registerTeacher);

    $("teacherLoginButton")?.addEventListener("click", (event) => {
      // إذا كان الزر من النوع submit، سيتولى حدث النموذج عملية الدخول.
      if ($("teacherLoginButton")?.type !== "submit") {
        loginTeacher(event);
      }
    });

    $("resetPasswordButton")?.addEventListener(
      "click",
      resetTeacherPassword
    );

    $("showRegisterButton")?.addEventListener(
      "click",
      showRegistrationView
    );

    // دعم عناصر HTML القديمة إن كانت موجودة.
    $("teacherCode")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        loginTeacher(event);
      }
    });
  }

  // ---------------------------------------------------------
  // مراقبة حالة تسجيل الدخول
  // ---------------------------------------------------------

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      currentTeacher = null;
      teacherProfile = null;
      lastInitializedUid = null;

      studentsCache = [];
      rewardsCache = [];
      requestsCache = [];

      showLoginView();
      return;
    }

    currentTeacher = user;

    // لا تُهيّأ اللوحة إذا كان التسجيل الجاري لم يحفظ ملف المعلم بعد.
    if (isRegistering) return;

    await initializeDashboard();
  });

  // ---------------------------------------------------------
  // بدء تشغيل الملف
  // ---------------------------------------------------------

  bindAuthenticationEvents();
  showLoginView();

})();
