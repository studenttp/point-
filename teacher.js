"use strict";

(() => {
  // منع تحميل الكود مرتين
  if (window.__najoomTeacherJSLoaded) return;
  window.__najoomTeacherJSLoaded = true;

  const auth = window.teacherAuth;
  const db = window.teacherDB;

  if (!auth || !db) {
    console.error(
      "تعذر تهيئة Firebase الخاص بالمعلمات. راجعي teacher-firebase.js وترتيب ملفات script."
    );
    return;
  }

  const $ = (id) => document.getElementById(id);

  let currentTeacher = null;
  let teacherProfile = null;

  let activeClass = "";
  let activeSection = "";

  let studentsCache = [];
  let rewardsCache = [];
  let requestsCache = [];

  let editingStudentId = null;
  let editingRewardId = null;
  let busy = false;
  let dashboardInitializedFor = null;

  const sectionsFallback = ["1", "2", "3", "4"];

  // --------------------------------------------------
  // رسائل وعناصر الواجهة
  // --------------------------------------------------

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value ?? "";
  }

  function setStatus(id, message, type = "") {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
  }

  function showElement(id, visible, display = "") {
    const element = $(id);
    if (!element) return;

    element.style.display = visible ? (display || "") : "none";
  }

  function showLoginView() {
    showElement("loginBox", true, "block");
    showElement("teacherRegistrationBox", false);
    showElement("dashboard", false);
  }

  function showRegistrationView() {
    showElement("loginBox", false);
    showElement("teacherRegistrationBox", true, "block");
    showElement("dashboard", false);
    setStatus("registrationError", "");
  }

  function showDashboardView() {
    showElement("loginBox", false);
    showElement("teacherRegistrationBox", false);
    showElement("dashboard", true);
  }

  function getErrorMessage(error) {
    const code = error?.code || "";

    const messages = {
      "auth/email-already-in-use":
        "هذا البريد الإلكتروني مسجل مسبقًا. حاولي تسجيل الدخول.",
      "auth/invalid-email":
        "البريد الإلكتروني غير صحيح.",
      "auth/weak-password":
        "كلمة المرور ضعيفة. استخدمي 8 أحرف على الأقل.",
      "auth/invalid-credential":
        "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "auth/user-not-found":
        "لا يوجد حساب بهذا البريد الإلكتروني.",
      "auth/wrong-password":
        "كلمة المرور غير صحيحة.",
      "auth/too-many-requests":
        "تمت محاولات كثيرة. حاولي مرة أخرى لاحقًا.",
      "auth/network-request-failed":
        "تعذر الاتصال بالإنترنت. تحققي من اتصالك.",
      "permission-denied":
        "لا توجد صلاحية للوصول إلى البيانات. راجعي قواعد Firestore في مشروع المعلمات.",
      "firestore/permission-denied":
        "لا توجد صلاحية للوصول إلى البيانات. راجعي قواعد Firestore في مشروع المعلمات."
    };

    return messages[code] ||
      error?.message ||
      "حدث خطأ غير متوقع. حاولي مرة أخرى.";
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

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeString(value) {
    return String(value ?? "").trim();
  }

  function formatDate(value) {
    if (!value) return "—";

    let date;

    if (typeof value.toDate === "function") {
      date = value.toDate();
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("ar-OM");
  }

  function normalizeSection(value) {
    const digits = {
      "٠": "0",
      "١": "1",
      "٢": "2",
      "٣": "3",
      "٤": "4",
      "٥": "5",
      "٦": "6",
      "٧": "7",
      "٨": "8",
      "٩": "9"
    };

    return String(value ?? "").replace(/[٠-٩]/g, (digit) => digits[digit]);
  }

  function displaySection(value) {
    const digits = {
      "0": "٠",
      "1": "١",
      "2": "٢",
      "3": "٣",
      "4": "٤",
      "5": "٥",
      "6": "٦",
      "7": "٧",
      "8": "٨",
      "9": "٩"
    };

    return String(value ?? "").replace(/[0-9]/g, (digit) => digits[digit]);
  }

  function sortArabic(values) {
    return [...values].sort((a, b) =>
      String(a).localeCompare(String(b), "ar")
    );
  }

  // --------------------------------------------------
  // مسارات البيانات: كل معلمة داخل حسابها فقط
  // --------------------------------------------------

  function teacherDoc() {
    if (!currentTeacher) {
      throw new Error("لا يوجد حساب معلمة مسجل الدخول.");
    }

    return db.collection("teachers").doc(currentTeacher.uid);
  }

  function studentsCollection() {
    return teacherDoc().collection("students");
  }

  function rewardsCollection() {
    return teacherDoc().collection("rewards");
  }

  function requestsCollection() {
    return teacherDoc().collection("rewardRequests");
  }

  function getTeacherClasses() {
    const classes = Array.isArray(teacherProfile?.classes)
      ? teacherProfile.classes
      : [];

    return classes
      .filter((item) => item && typeof item === "object" && item.name)
      .map((item) => ({
        name: String(item.name),
        sections: Array.isArray(item.sections)
          ? [...new Set(item.sections.map(normalizeSection))]
          : []
      }));
  }

  function findClass(className) {
    return getTeacherClasses().find((item) => item.name === className);
  }

  function getSectionsForClass(className) {
    const classInfo = findClass(className);
    const sections = classInfo?.sections?.length
      ? classInfo.sections
      : sectionsFallback;

    return [...sections].sort((a, b) =>
      Number(a) - Number(b)
    );
  }

  function getVisibleStudents() {
    return studentsCache.filter((student) =>
      student.className === activeClass &&
      normalizeSection(student.section) === activeSection
    );
  }

  function getVisibleRewards() {
    return rewardsCache.filter((reward) =>
      reward.className === activeClass &&
      normalizeSection(reward.section) === activeSection
    );
  }

  function getVisibleRequests() {
    return requestsCache.filter((request) =>
      request.className === activeClass &&
      normalizeSection(request.section) === activeSection
    );
  }

  // --------------------------------------------------
  // الصف والشعبة
  // --------------------------------------------------

  function populateClassSelector() {
    const select = $("activeClassSelect");
    if (!select) return;

    const classes = getTeacherClasses();

    select.innerHTML = "";

    if (!classes.length) {
      select.innerHTML = '<option value="">لا توجد صفوف مسجلة</option>';
      activeClass = "";
      activeSection = "";
      populateSectionSelector();
      updateSelectedClassInfo();
      return;
    }

    classes.forEach((classInfo) => {
      const option = document.createElement("option");
      option.value = classInfo.name;
      option.textContent = classInfo.name;
      select.appendChild(option);
    });

    if (!classes.some((item) => item.name === activeClass)) {
      activeClass = classes[0].name;
    }

    select.value = activeClass;
    populateSectionSelector();
    updateSelectedClassInfo();
  }

  function populateSectionSelector() {
    const select = $("activeSectionSelect");
    if (!select) return;

    const sections = getSectionsForClass(activeClass);
    select.innerHTML = "";

    sections.forEach((section) => {
      const option = document.createElement("option");
      option.value = normalizeSection(section);
      option.textContent = displaySection(section);
      select.appendChild(option);
    });

    if (!sections.some((section) =>
      normalizeSection(section) === activeSection
    )) {
      activeSection = normalizeSection(sections[0] ?? "");
    }

    select.value = activeSection;
    updateSelectedClassInfo();
  }

  function updateSelectedClassInfo() {
    setText("selectedClass", activeClass || "—");
    setText("selectedSection", activeSection
      ? displaySection(activeSection)
      : "—");

    const classNameInput = $("className");
    if (classNameInput) classNameInput.value = activeClass;

    setText("subjectName", teacherProfile?.subject || "");

    const subjectInput = $("subjectName");
    if (subjectInput) subjectInput.value = teacherProfile?.subject || "";
  }

  // --------------------------------------------------
  // تسجيل المعلمة وإنشاء الحساب
  // --------------------------------------------------

  function readRegistrationClasses() {
    const rows = document.querySelectorAll(".registration-class-row");
    const classes = [];
    const usedClassNames = new Set();

    for (const row of rows) {
      const className = normalizeString(
        row.querySelector(".register-class-select")?.value
      );

      const sections = [...row.querySelectorAll(
        'input[type="checkbox"]:checked'
      )].map((checkbox) => normalizeSection(checkbox.value));

      if (!className) {
        throw new Error("اختاري الصف في كل صف من نموذج التسجيل.");
      }

      if (!sections.length) {
        throw new Error(
          `اختاري شعبة واحدة على الأقل للصف: ${className}.`
        );
      }

      if (usedClassNames.has(className)) {
        throw new Error(`لقد أضفتِ الصف نفسه أكثر من مرة: ${className}.`);
      }

      usedClassNames.add(className);

      classes.push({
        name: className,
        sections: [...new Set(sections)]
      });
    }

    if (!classes.length) {
      throw new Error("أضيفي صفًا واحدًا على الأقل.");
    }

    return classes;
  }

  async function registerTeacher(event) {
    event.preventDefault();

    if (busy) return;

    const name = normalizeString($("registerTeacherName")?.value);
    const school = normalizeString($("registerSchoolName")?.value);
    const subject = normalizeString($("registerSubjectName")?.value);
    const email = normalizeString($("registerTeacherEmail")?.value);
    const password = $("registerTeacherPassword")?.value || "";
    const confirmPassword = $("confirmTeacherPassword")?.value || "";

    setStatus("registrationError", "");

    if (!name || !school || !subject || !email) {
      setStatus("registrationError", "أكملي جميع البيانات المطلوبة.");
      return;
    }

    if (password.length < 8) {
      setStatus("registrationError", "كلمة المرور يجب أن تتكون من 8 أحرف على الأقل.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("registrationError", "كلمتا المرور غير متطابقتين.");
      return;
    }

    let classes;

    try {
      classes = readRegistrationClasses();
    } catch (error) {
      setStatus("registrationError", error.message);
      return;
    }

    busy = true;
    const button = $("registerTeacherButton");
    if (button) button.disabled = true;

    let createdUser = null;

    try {
      const credential = await auth.createUserWithEmailAndPassword(
        email,
        password
      );

      createdUser = credential.user;

      await createdUser.updateProfile({ displayName: name });

      const profile = {
        uid: createdUser.uid,
        name,
        school,
        subject,
        email: createdUser.email || email,
        classes,
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("teachers")
        .doc(createdUser.uid)
        .set(profile);

      teacherProfile = profile;
      currentTeacher = createdUser;

      setStatus("registrationError", "تم إنشاء الحساب بنجاح.", "success");

      await initializeDashboard(createdUser);
    } catch (error) {
      console.error("Teacher registration error:", error);

      if (createdUser) {
        setStatus(
          "registrationError",
          "تم إنشاء حساب الدخول، لكن تعذر حفظ ملف المعلمة. لا تعيدي التسجيل مباشرة؛ تحققي من قواعد Firestore في مشروع read-d879d. يمكنك تسجيل الدخول بعد إصلاح الصلاحيات."
        );
      } else {
        setStatus("registrationError", getErrorMessage(error));
      }
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  async function loginTeacher(event) {
    event.preventDefault();

    if (busy) return;

    const email = normalizeString($("teacherEmail")?.value);
    const password = $("teacherPassword")?.value || "";

    if (!email || !password) {
      setStatus("loginError", "أدخلي البريد الإلكتروني وكلمة المرور.");
      return;
    }

    busy = true;
    setStatus("loginError", "");

    const button = $("teacherLoginButton");
    if (button) button.disabled = true;

    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error("Teacher login error:", error);
      setStatus("loginError", getErrorMessage(error));
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  async function resetTeacherPassword() {
    const email = normalizeString($("teacherEmail")?.value);

    if (!email) {
      setStatus(
        "loginError",
        "أدخلي بريدك الإلكتروني أولًا، ثم اضغطي «نسيت كلمة المرور؟»."
      );
      return;
    }

    try {
      await auth.sendPasswordResetEmail(email);
      setStatus(
        "loginError",
        "إذا كان البريد مسجلًا، فستصلك رسالة لإعادة تعيين كلمة المرور.",
        "success"
      );
    } catch (error) {
      console.error("Password reset error:", error);
      setStatus("loginError", getErrorMessage(error));
    }
  }

  async function logoutTeacher() {
    try {
      await auth.signOut();
    } catch (error) {
      console.error("Logout error:", error);
      alert(getErrorMessage(error));
    }
  }

  // --------------------------------------------------
  // تحميل لوحة التحكم
  // --------------------------------------------------

  async function loadTeacherProfile(user) {
    const snapshot = await db.collection("teachers").doc(user.uid).get();

    if (!snapshot.exists) {
      throw new Error(
        "حساب الدخول موجود، لكن ملف المعلمة غير موجود في قاعدة البيانات. راجعي تسجيل الحساب وقواعد Firestore."
      );
    }

    const data = snapshot.data() || {};

    return {
      ...data,
      uid: user.uid,
      name: data.name || user.displayName || "المعلمة",
      school: data.school || "",
      subject: data.subject || "",
      classes: Array.isArray(data.classes) ? data.classes : []
    };
  }

  async function initializeDashboard(user) {
    if (!user) return;

    if (dashboardInitializedFor === user.uid && teacherProfile) {
      showDashboardView();
      return;
    }

    try {
      currentTeacher = user;
      teacherProfile = await loadTeacherProfile(user);

      setText("teacherName", teacherProfile.name);
      setText("schoolName", teacherProfile.school);

      activeClass = "";
      activeSection = "";

      populateClassSelector();
      showDashboardView();

      dashboardInitializedFor = user.uid;

      await refreshDashboardData();
    } catch (error) {
      console.error("Dashboard initialization error:", error);

      showDashboardView();
      setStatus("studentStatus", getErrorMessage(error));

      if (!teacherProfile) {
        setText("teacherName", user.displayName || "المعلمة");
      }
    }
  }

  // --------------------------------------------------
  // تحميل بيانات المعلمة
  // --------------------------------------------------

  async function refreshDashboardData() {
    if (!currentTeacher || !teacherProfile) return;

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
      renderRewards();
      renderRequests();

      setStatus("studentStatus", "");
      setStatus("rewardStatus", "");
    } catch (error) {
      console.error("Dashboard data loading error:", error);
      setStatus("studentStatus", getErrorMessage(error));
    }
  }

  // --------------------------------------------------
  // الطلاب
  // --------------------------------------------------

  function resetStudentForm() {
    editingStudentId = null;

    if ($("studentName")) $("studentName").value = "";
    if ($("studentCode")) $("studentCode").value = "";
    if ($("studentPoints")) $("studentPoints").value = "0";
    if ($("studentMessage")) $("studentMessage").value = "";

    setText("studentSaveButton", "➕ إضافة الطالب");
    showElement("cancelStudentButton", false);
  }

  function renderStudents() {
    const container = $("studentsList");
    if (!container) return;

    const students = getVisibleStudents();

    if (!activeClass || !activeSection) {
      container.textContent = "اختاري الصف والشعبة لعرض الطلاب.";
      return;
    }

    if (!students.length) {
      container.textContent = "لا يوجد طلاب في هذا الصف والشعبة حتى الآن.";
      return;
    }

    container.innerHTML = students.map((student) => `
      <div class="student-card" data-student-id="${escapeHTML(student.id)}">
        <h3>${escapeHTML(student.name || "طالب دون اسم")}</h3>
        <p>الرمز: ${escapeHTML(student.code || "—")}</p>
        <p>النقاط: <strong>${toNumber(student.points)}</strong></p>
        <p>التعليق: ${escapeHTML(student.message || "—")}</p>
        <p>الصف: ${escapeHTML(student.className || "")}</p>
        <p>الشعبة: ${escapeHTML(displaySection(student.section || ""))}</p>

        <div class="student-actions">
          <button type="button" data-action="edit-student"
            data-id="${escapeHTML(student.id)}">✏️ تعديل</button>

          <button type="button" data-action="add-point"
            data-id="${escapeHTML(student.id)}">➕ نقطة</button>

          <button type="button" data-action="subtract-point"
            data-id="${escapeHTML(student.id)}">➖ نقطة</button>

          <button type="button" data-action="delete-student"
            data-id="${escapeHTML(student.id)}">🗑️ حذف</button>
        </div>
      </div>
    `).join("");
  }

  async function saveStudent() {
    if (!currentTeacher || !activeClass || !activeSection) {
      setStatus("studentStatus", "اختاري الصف والشعبة أولًا.");
      return;
    }

    const name = normalizeString($("studentName")?.value);
    const code = normalizeString($("studentCode")?.value);
    const points = toNumber($("studentPoints")?.value, NaN);
    const message = normalizeString($("studentMessage")?.value);

    if (!name || !code) {
      setStatus("studentStatus", "أدخلي اسم الطالب ورمزه.");
      return;
    }

    if (!Number.isFinite(points) || points < 0) {
      setStatus("studentStatus", "أدخلي عدد نقاط صحيحًا لا يقل عن صفر.");
      return;
    }

    if (!Number.isInteger(points)) {
      setStatus("studentStatus", "النقاط يجب أن تكون عددًا صحيحًا.");
      return;
    }

    const duplicate = studentsCache.find((student) =>
      student.code === code &&
      student.className === activeClass &&
      normalizeSection(student.section) === activeSection &&
      student.id !== editingStudentId
    );

    if (duplicate) {
      setStatus("studentStatus", "هذا الرمز مستخدم بالفعل في الصف والشعبة المختارين.");
      return;
    }

    const data = {
      name,
      code,
      points,
      message,
      className: activeClass,
      section: activeSection,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (editingStudentId) {
        await studentsCollection().doc(editingStudentId).update(data);
        setStatus("studentStatus", "تم تحديث بيانات الطالب.", "success");
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await studentsCollection().add(data);
        setStatus("studentStatus", "تمت إضافة الطالب بنجاح.", "success");
      }

      resetStudentForm();
      await refreshDashboardData();
    } catch (error) {
      console.error("Save student error:", error);
      setStatus("studentStatus", getErrorMessage(error));
    }
  }

  function editStudent(studentId) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    if (student.className !== activeClass ||
        normalizeSection(student.section) !== activeSection) {
      setStatus("studentStatus", "لا يمكن تعديل طالب من صف أو شعبة أخرى.");
      return;
    }

    editingStudentId = studentId;

    $("studentName").value = student.name || "";
    $("studentCode").value = student.code || "";
    $("studentPoints").value = String(toNumber(student.points));
    $("studentMessage").value = student.message || "";

    setText("studentSaveButton", "💾 حفظ التعديلات");
    showElement("cancelStudentButton", true, "inline-block");

    $("studentName")?.focus();
  }

  async function changeStudentPoints(studentId, delta) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    if (student.className !== activeClass ||
        normalizeSection(student.section) !== activeSection) {
      setStatus("studentStatus", "الطالب لا ينتمي إلى الصف والشعبة المختارين.");
      return;
    }

    const currentPoints = toNumber(student.points);

    if (delta < 0 && currentPoints + delta < 0) {
      setStatus("studentStatus", "لا يمكن أن تصبح النقاط أقل من صفر.");
      return;
    }

    try {
      await studentsCollection().doc(studentId).update({
        points: currentPoints + delta,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      setStatus("studentStatus", "تم تحديث نقاط الطالب.", "success");
      await refreshDashboardData();
    } catch (error) {
      console.error("Change points error:", error);
      setStatus("studentStatus", getErrorMessage(error));
    }
  }

  async function deleteStudent(studentId) {
    const student = studentsCache.find((item) => item.id === studentId);
    if (!student) return;

    if (student.className !== activeClass ||
        normalizeSection(student.section) !== activeSection) {
      setStatus("studentStatus", "الطالب لا ينتمي إلى الصف والشعبة المختارين.");
      return;
    }

    if (!confirm(`هل تريدين حذف الطالب «${student.name || ""}»؟`)) return;

    try {
      await studentsCollection().doc(studentId).delete();

      setStatus(
        "studentStatus",
        "تم حذف سجل الطالب. راجعي الطلبات السابقة إذا كانت مرتبطة به.",
        "success"
      );

      if (editingStudentId === studentId) resetStudentForm();

      await refreshDashboardData();
    } catch (error) {
      console.error("Delete student error:", error);
      setStatus("studentStatus", getErrorMessage(error));
    }
  }

  // --------------------------------------------------
  // المكافآت
  // --------------------------------------------------

  function resetRewardForm() {
    editingRewardId = null;

    if ($("rewardName")) $("rewardName").value = "";
    if ($("rewardPrice")) $("rewardPrice").value = "";
    if ($("rewardIcon")) $("rewardIcon").value = "🎁";
    if ($("rewardDescription")) $("rewardDescription").value = "";

    setText("rewardSaveButton", "➕ إضافة المكافأة");
    showElement("cancelRewardButton", false);
  }

  function renderRewards() {
    const container = $("rewardsManagerList");
    if (!container) return;

    const rewards = getVisibleRewards();

    if (!rewards.length) {
      container.textContent = "لا توجد مكافآت في هذا الصف والشعبة حتى الآن.";
      return;
    }

    container.innerHTML = rewards.map((reward) => `
      <div class="reward-card" data-reward-id="${escapeHTML(reward.id)}">
        <h3>${escapeHTML(reward.icon || "🎁")} ${escapeHTML(reward.name || "مكافأة")}</h3>
        <p>النقاط المطلوبة: <strong>${toNumber(reward.price)}</strong></p>
        <p>${escapeHTML(reward.description || "لا يوجد وصف.")}</p>

        <div class="reward-actions">
          <button type="button" data-action="edit-reward"
            data-id="${escapeHTML(reward.id)}">✏️ تعديل</button>

          <button type="button" data-action="delete-reward"
            data-id="${escapeHTML(reward.id)}">🗑️ حذف</button>
        </div>
      </div>
    `).join("");
  }

  async function saveReward() {
    if (!currentTeacher || !activeClass || !activeSection) {
      setStatus("rewardStatus", "اختاري الصف والشعبة أولًا.");
      return;
    }

    const name = normalizeString($("rewardName")?.value);
    const price = toNumber($("rewardPrice")?.value, NaN);
    const icon = normalizeString($("rewardIcon")?.value) || "🎁";
    const description = normalizeString($("rewardDescription")?.value);

    if (!name) {
      setStatus("rewardStatus", "أدخلي اسم المكافأة.");
      return;
    }

    if (!Number.isInteger(price) || price < 1) {
      setStatus("rewardStatus", "أدخلي عدد نقاط صحيحًا أكبر من صفر.");
      return;
    }

    const data = {
      name,
      price,
      icon,
      description,
      className: activeClass,
      section: activeSection,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (editingRewardId) {
        await rewardsCollection().doc(editingRewardId).update(data);
        setStatus("rewardStatus", "تم تحديث المكافأة.", "success");
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await rewardsCollection().add(data);
        setStatus("rewardStatus", "تمت إضافة المكافأة بنجاح.", "success");
      }

      resetRewardForm();
      await refreshDashboardData();
    } catch (error) {
      console.error("Save reward error:", error);
      setStatus("rewardStatus", getErrorMessage(error));
    }
  }

  function editReward(rewardId) {
    const reward = rewardsCache.find((item) => item.id === rewardId);
    if (!reward) return;

    if (reward.className !== activeClass ||
        normalizeSection(reward.section) !== activeSection) {
      setStatus("rewardStatus", "لا يمكن تعديل مكافأة من صف أو شعبة أخرى.");
      return;
    }

    editingRewardId = rewardId;

    $("rewardName").value = reward.name || "";
    $("rewardPrice").value = String(toNumber(reward.price));
    $("rewardIcon").value = reward.icon || "🎁";
    $("rewardDescription").value = reward.description || "";

    setText("rewardSaveButton", "💾 حفظ التعديلات");
    showElement("cancelRewardButton", true, "inline-block");

    $("rewardName")?.focus();
  }

  async function deleteReward(rewardId) {
    const reward = rewardsCache.find((item) => item.id === rewardId);
    if (!reward) return;

    if (reward.className !== activeClass ||
        normalizeSection(reward.section) !== activeSection) {
      setStatus("rewardStatus", "المكافأة لا تنتمي إلى الصف والشعبة المختارين.");
      return;
    }

    if (!confirm(`هل تريدين حذف المكافأة «${reward.name || ""}»؟`)) return;

    try {
      await rewardsCollection().doc(rewardId).delete();

      setStatus("rewardStatus", "تم حذف المكافأة.", "success");

      if (editingRewardId === rewardId) resetRewardForm();

      await refreshDashboardData();
    } catch (error) {
      console.error("Delete reward error:", error);
      setStatus("rewardStatus", getErrorMessage(error));
    }
  }

  // --------------------------------------------------
  // طلبات استبدال المكافآت
  // --------------------------------------------------

  function renderRequests() {
    const container = $("rewardRequestsList");
    if (!container) return;

    const requests = getVisibleRequests();

    const pending = requests.filter((request) =>
      (request.status || "pending") === "pending"
    );

    setText("pendingCount", String(pending.length));

    if (!requests.length) {
      container.textContent = "لا توجد طلبات في هذا الصف والشعبة.";
      return;
    }

    container.innerHTML = requests.map((request) => {
      const status = request.status || "pending";

      const statusLabels = {
        pending: "قيد الانتظار",
        approved: "تمت الموافقة",
        rejected: "مرفوض"
      };

      const buttons = status === "pending" ? `
        <div class="request-actions">
          <button type="button" data-action="approve-request"
            data-id="${escapeHTML(request.id)}">✅ موافقة</button>

          <button type="button" data-action="reject-request"
            data-id="${escapeHTML(request.id)}">❌ رفض</button>
        </div>
      ` : "";

      return `
        <div class="request-card" data-request-id="${escapeHTML(request.id)}">
          <h3>${escapeHTML(request.rewardName || request.rewardTitle || "طلب مكافأة")}</h3>
          <p>الطالب: ${escapeHTML(request.studentName || "—")}</p>
          <p>رمز الطالب: ${escapeHTML(request.studentCode || "—")}</p>
          <p>النقاط المطلوبة: ${toNumber(request.rewardPrice ?? request.price)}</p>
          <p>تاريخ الطلب: ${escapeHTML(formatDate(request.createdAt))}</p>
          <p>الحالة: <strong>${escapeHTML(statusLabels[status] || status)}</strong></p>
          ${buttons}
        </div>
      `;
    }).join("");
  }

  async function updateRequestStatus(requestId, newStatus) {
    const request = requestsCache.find((item) => item.id === requestId);
    if (!request) return;

    if (request.className !== activeClass ||
        normalizeSection(request.section) !== activeSection) {
      setStatus("studentStatus", "الطلب لا ينتمي إلى الصف والشعبة المختارين.");
      return;
    }

    if ((request.status || "pending") !== "pending") {
      setStatus("studentStatus", "تمت معالجة هذا الطلب مسبقًا.");
      return;
    }

    if (newStatus === "rejected") {
      try {
        await requestsCollection().doc(requestId).update({
          status: "rejected",
          reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        setStatus("studentStatus", "تم رفض طلب المكافأة.", "success");
        await refreshDashboardData();
      } catch (error) {
        console.error("Reject request error:", error);
        setStatus("studentStatus", getErrorMessage(error));
      }

      return;
    }

    // الموافقة تخصم النقاط داخل معاملة واحدة لمنع الخصم المكرر.
    const studentId = request.studentId;
    const cost = toNumber(request.rewardPrice ?? request.price, NaN);

    if (!studentId || !Number.isInteger(cost) || cost < 0) {
      setStatus(
        "studentStatus",
        "لا يمكن إتمام الطلب: بيانات الطالب أو تكلفة المكافأة غير مكتملة."
      );
      return;
    }

    try {
      const requestRef = requestsCollection().doc(requestId);
      const studentRef = studentsCollection().doc(studentId);

      await db.runTransaction(async (transaction) => {
        const requestSnapshot = await transaction.get(requestRef);
        const studentSnapshot = await transaction.get(studentRef);

        if (!requestSnapshot.exists) {
          throw new Error("الطلب غير موجود.");
        }

        if (!studentSnapshot.exists) {
          throw new Error("لم يتم العثور على سجل الطالب.");
        }

        const requestData = requestSnapshot.data();

        if ((requestData.status || "pending") !== "pending") {
          throw new Error("تمت معالجة هذا الطلب مسبقًا.");
        }

        const studentData = studentSnapshot.data();

        if (
          studentData.className !== activeClass ||
          normalizeSection(studentData.section) !== activeSection
        ) {
          throw new Error("الطالب لا ينتمي إلى الصف والشعبة المختارين.");
        }

        const currentPoints = toNumber(studentData.points);

        if (currentPoints < cost) {
          throw new Error("نقاط الطالب غير كافية لإتمام عملية الاستبدال.");
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

      setStatus("studentStatus", "تمت الموافقة على الطلب وخصم النقاط.", "success");
      await refreshDashboardData();
    } catch (error) {
      console.error("Approve request error:", error);
      setStatus("studentStatus", getErrorMessage(error));
    }
  }

  // --------------------------------------------------
  // ربط الأحداث
  // --------------------------------------------------

  function bindRegistrationClassEvents() {
    const addButton = $("addRegistrationClassButton");
    const container = $("registrationClasses");

    addButton?.addEventListener("click", () => {
      const firstRow = container?.querySelector(".registration-class-row");
      if (!container || !firstRow) return;

      const clone = firstRow.cloneNode(true);

      const select = clone.querySelector(".register-class-select");
      if (select) select.selectedIndex = 0;

      clone.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = false;
      });

      container.appendChild(clone);
    });

    container?.addEventListener("click", (event) => {
      const button = event.target.closest(".remove-class-button");
      if (!button) return;

      const rows = container.querySelectorAll(".registration-class-row");

      if (rows.length <= 1) {
        alert("يجب الإبقاء على صف واحد على الأقل.");
        return;
      }

      button.closest(".registration-class-row")?.remove();
    });

    $("teacherRegistrationForm")?.addEventListener("submit", (event) => {
      const rows = document.querySelectorAll(".registration-class-row");

      for (const row of rows) {
        const classSelect = row.querySelector(".register-class-select");
        const checkedSections = row.querySelectorAll(
          'input[type="checkbox"]:checked'
        );

        if (!classSelect?.value || checkedSections.length === 0) {
          event.preventDefault();
          setStatus(
            "registrationError",
            "اختاري الصف وشعبة واحدة على الأقل لكل صف."
          );
          return;
        }
      }
    });
  }

  function bindDashboardEvents() {
    $("activeClassSelect")?.addEventListener("change", async (event) => {
      activeClass = event.target.value || "";
      activeSection = "";

      populateSectionSelector();
      updateSelectedClassInfo();

      resetStudentForm();
      resetRewardForm();

      renderStudents();
      renderRewards();
      renderRequests();

      setStatus("studentStatus", "");
      setStatus("rewardStatus", "");
    });

    $("activeSectionSelect")?.addEventListener("change", (event) => {
      activeSection = normalizeSection(event.target.value || "");
      updateSelectedClassInfo();

      resetStudentForm();
      resetRewardForm();

      renderStudents();
      renderRewards();
      renderRequests();

      setStatus("studentStatus", "");
      setStatus("rewardStatus", "");
    });

    $("studentSaveButton")?.addEventListener("click", saveStudent);
    $("cancelStudentButton")?.addEventListener("click", resetStudentForm);

    $("rewardSaveButton")?.addEventListener("click", saveReward);
    $("cancelRewardButton")?.addEventListener("click", resetRewardForm);

    $("logoutButton")?.addEventListener("click", logoutTeacher);

    $("studentsList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const { action, id } = button.dataset;
      if (!id) return;

      if (action === "edit-student") editStudent(id);
      if (action === "add-point") await changeStudentPoints(id, 1);
      if (action === "subtract-point") await changeStudentPoints(id, -1);
      if (action === "delete-student") await deleteStudent(id);
    });

    $("rewardsManagerList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const { action, id } = button.dataset;
      if (!id) return;

      if (action === "edit-reward") editReward(id);
      if (action === "delete-reward") await deleteReward(id);
    });

    $("rewardRequestsList")?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;

      const { action, id } = button.dataset;
      if (!id) return;

      if (action === "approve-request") {
        await updateRequestStatus(id, "approved");
      }

      if (action === "reject-request") {
        await updateRequestStatus(id, "rejected");
      }
    });
  }

  function bindAuthenticationEvents() {
    $("teacherLoginForm")?.addEventListener("submit", loginTeacher);
    $("teacherRegistrationForm")?.addEventListener("submit", registerTeacher);

    $("resetPasswordButton")?.addEventListener(
      "click",
      resetTeacherPassword
    );

    $("showRegisterButton")?.addEventListener(
      "click",
      showRegistrationView
    );

    $("backToLoginButton")?.addEventListener("click", () => {
      setStatus("registrationError", "");
      showLoginView();
    });

    bindRegistrationClassEvents();
    bindDashboardEvents();
  }

  // --------------------------------------------------
  // مراقبة حالة تسجيل الدخول
  // --------------------------------------------------

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      currentTeacher = null;
      teacherProfile = null;
      dashboardInitializedFor = null;

      activeClass = "";
      activeSection = "";

      studentsCache = [];
      rewardsCache = [];
      requestsCache = [];

      editingStudentId = null;
      editingRewardId = null;

      showLoginView();
      return;
    }

    currentTeacher = user;

    // يمنع إعادة تحميل لوحة التحكم عدة مرات للحساب نفسه.
    if (dashboardInitializedFor === user.uid && teacherProfile) {
      showDashboardView();
      return;
    }

    await initializeDashboard(user);
  });

  // --------------------------------------------------
  // بدء التشغيل
  // --------------------------------------------------

  bindAuthenticationEvents();

  // تُظهر شاشة الدخول مبدئيًا إلى أن يتحقق Firebase من الجلسة.
  showLoginView();

})();