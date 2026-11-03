
/* =====================================================
   نجوم صَفّي — لوحة المعلمة
   Firebase project: read-d879d
   ===================================================== */

(() => {
  "use strict";

  if (typeof teacherApp === "undefined" ||
      typeof teacherAuth === "undefined" ||
      typeof teacherDB === "undefined") {
    console.error(
      "تعذر الاتصال بمشروع المعلمات. تحققي من teacher-firebase.js."
    );
    return;
  }

  const auth = teacherAuth;
  const db = teacherDB;
  const functions = teacherApp.functions("us-central1");

  const $ = (id) => document.getElementById(id);

  let currentTeacher = null;
  let teacherProfile = null;
  let selectedClassName = "";
  let selectedSectionName = "";
  let editingStudentId = null;
  let editingRewardId = null;
  let unsubscribeStudents = null;
  let unsubscribeRewards = null;
  let unsubscribeRequests = null;

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const showMessage = (id, message, isError = false) => {
    const element = $(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#c62828" : "#218838";
  };

  const clearMessage = (id) => {
    const element = $(id);
    if (element) element.textContent = "";
  };

  const timestamp = () =>
    firebase.firestore.FieldValue.serverTimestamp();

  const teacherCollection = (name) => {
    if (!currentTeacher) {
      throw new Error("يجب تسجيل الدخول أولًا.");
    }

    return db.collection("teachers")
      .doc(currentTeacher.uid)
      .collection(name);
  };

  const callFunction = async (name, data) => {
    const callable = functions.httpsCallable(name);
    const result = await callable(data);
    return result.data;
  };

  function setBusy(buttonId, busy, busyText = "جارٍ التنفيذ...") {
    const button = $(buttonId);
    if (!button) return;

    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText;
      button.disabled = true;
    } else {
      button.textContent =
        button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function stopListeners() {
    [unsubscribeStudents, unsubscribeRewards, unsubscribeRequests]
      .forEach((unsubscribe) => {
        if (typeof unsubscribe === "function") unsubscribe();
      });

    unsubscribeStudents = null;
    unsubscribeRewards = null;
    unsubscribeRequests = null;
  }

  function hideAllPanels() {
    if ($("loginBox")) $("loginBox").style.display = "none";
    if ($("teacherRegistrationBox")) {
      $("teacherRegistrationBox").style.display = "none";
    }
    if ($("dashboard")) $("dashboard").style.display = "none";
  }

  function showLogin() {
    hideAllPanels();

    if ($("loginBox")) $("loginBox").style.display = "block";

    if ($("teacherCode")) $("teacherCode").value = "";

    clearMessage("loginError");
  }

  function showRegistration() {
    hideAllPanels();

    if ($("teacherRegistrationBox")) {
      $("teacherRegistrationBox").style.display = "block";
    }

    clearMessage("registrationError");
  }

  function showDashboard() {
    hideAllPanels();

    if ($("dashboard")) $("dashboard").style.display = "block";
  }

  /* =====================================================
     التسجيل والدخول
     ===================================================== */

  async function loginTeacher() {
    const code = $("teacherCode")?.value.trim();

    clearMessage("loginError");

    if (!code) {
      showMessage("loginError", "أدخلي رمز الدخول.", true);
      return;
    }

    setBusy("teacherLoginButton", true, "جارٍ تسجيل الدخول...");

    try {
      // يجب أن تتحقق الدالة من الرمز على الخادم،
      // وألا تعيد الرمز السري أو بيانات معلمات أخريات.
      const result = await callFunction("loginTeacherWithCode", {
        code
      });

      const customToken = result?.token || result?.customToken;

      if (!customToken) {
        throw new Error("لم يُرجع الخادم رمز جلسة صالحًا.");
      }

      await auth.signInWithCustomToken(customToken);

      // ستتولى onAuthStateChanged تحميل بيانات المعلمة.
    } catch (error) {
      console.error("Login error:", error);

      showMessage(
        "loginError",
        error.code === "functions/not-found"
          ? "خدمة تسجيل الدخول غير منشورة بعد."
          : "تعذر تسجيل الدخول. تحققي من الرمز وحاولي مجددًا.",
        true
      );
    } finally {
      setBusy("teacherLoginButton", false);
    }
  }

  async function registerTeacher(event) {
    event?.preventDefault();

    clearMessage("registrationError");

    const name = $("registerTeacherName")?.value.trim();
    const school = $("registerSchoolName")?.value.trim();
    const subject = $("registerSubjectName")?.value.trim();
    const code = $("registerTeacherCode")?.value.trim();
    const confirmCode = $("confirmTeacherCode")?.value.trim();

    if (!name || !school || !subject || !code || !confirmCode) {
      showMessage(
        "registrationError",
        "يرجى تعبئة جميع الحقول المطلوبة.",
        true
      );
      return;
    }

    if (code.length < 8) {
      showMessage(
        "registrationError",
        "اجعلي رمز الدخول 8 أحرف أو أكثر.",
        true
      );
      return;
    }

    if (code !== confirmCode) {
      showMessage(
        "registrationError",
        "رمزا الدخول غير متطابقين.",
        true
      );
      return;
    }

    const rows = Array.from(
      document.querySelectorAll(".registration-class-row")
    );

    const classes = [];

    for (const row of rows) {
      const className = row.querySelector(".register-class-select")
        ?.value.trim();

      const sections = Array.from(
        row.querySelectorAll('input[type="checkbox"]:checked')
      ).map((checkbox) => checkbox.value);

      if (className && sections.length) {
        classes.push({
          className,
          sections
        });
      }
    }

    if (!classes.length) {
      showMessage(
        "registrationError",
        "اختاري صفًا واحدًا على الأقل وشعبة واحدة لكل صف.",
        true
      );
      return;
    }

    setBusy("registerTeacherButton", true, "جارٍ إنشاء الحساب...");

    try {
      const result = await callFunction("registerTeacher", {
        name,
        school,
        subject,
        code,
        classes
      });

      if (result?.success === false) {
        throw new Error("تعذر إنشاء الحساب.");
      }

      showMessage(
        "registrationError",
        "تم إنشاء الحساب. يمكنكِ الآن تسجيل الدخول بالرمز."
      );

      const form = $("teacherRegistrationForm");
      if (form) form.reset();

      setTimeout(showLogin, 1200);
    } catch (error) {
      console.error("Registration error:", error);

      const message =
        error.code === "functions/already-exists"
          ? "هذا الرمز مستخدم مسبقًا. اختاري رمزًا آخر."
          : error.message || "تعذر إنشاء الحساب. حاولي مجددًا.";

      showMessage("registrationError", message, true);
    } finally {
      setBusy("registerTeacherButton", false);
    }
  }

  /* =====================================================
     الصفوف والشعب
     ===================================================== */

  function getClassOptions() {
    const classes = teacherProfile?.classes || [];
    const map = new Map();

    classes.forEach((item) => {
      if (!item?.className) return;

      if (!map.has(item.className)) {
        map.set(item.className, new Set());
      }

      (item.sections || []).forEach((section) => {
        map.get(item.className).add(section);
      });
    });

    return Array.from(map.entries()).map(([className, sections]) => ({
      className,
      sections: Array.from(sections)
    }));
  }

  function ensureClassControls() {
    const dashboard = $("dashboard");
    if (!dashboard || $("teacherClassControls")) return;

    const container = document.createElement("div");
    container.id = "teacherClassControls";
    container.style.cssText =
      "display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0;";

    container.innerHTML = `
      <label>
        الصف
        <select id="activeClassSelect"></select>
      </label>
      <label>
        الشعبة
        <select id="activeSectionSelect"></select>
      </label>
    `;

    const anchor = $("selectedClass")?.parentElement ||
      $("teacherName")?.parentElement;

    if (anchor && anchor.parentElement === dashboard) {
      anchor.insertAdjacentElement("afterend", container);
    } else {
      dashboard.prepend(container);
    }

    $("activeClassSelect").addEventListener("change", () => {
      selectedClassName = $("activeClassSelect").value;
      populateSectionSelect();
      refreshClassLabel();
      watchStudents();
    });

    $("activeSectionSelect").addEventListener("change", () => {
      selectedSectionName = $("activeSectionSelect").value;
      refreshClassLabel();
      watchStudents();
    });
  }

  function populateClassSelect() {
    ensureClassControls();

    const select = $("activeClassSelect");
    if (!select) return;

    const classes = getClassOptions();

    select.innerHTML = classes.map((item) => `
      <option value="${escapeHtml(item.className)}">
        ${escapeHtml(item.className)}
      </option>
    `).join("");

    if (classes.length) {
      if (!classes.some((item) => item.className === selectedClassName)) {
        selectedClassName = classes[0].className;
      }

      select.value = selectedClassName;
    }

    populateSectionSelect();
  }

  function populateSectionSelect() {
    const select = $("activeSectionSelect");
    if (!select) return;

    const item = getClassOptions().find(
      (entry) => entry.className === selectedClassName
    );

    const sections = item?.sections || [];

    select.innerHTML = sections.map((section) => `
      <option value="${escapeHtml(section)}">
        ${escapeHtml(section)}
      </option>
    `).join("");

    if (sections.length) {
      if (!sections.includes(selectedSectionName)) {
        selectedSectionName = sections[0];
      }

      select.value = selectedSectionName;
    } else {
      selectedSectionName = "";
    }
  }

  function refreshClassLabel() {
    if ($("selectedClass")) {
      $("selectedClass").textContent = selectedClassName || "—";
    }

    if ($("selectedSection")) {
      $("selectedSection").textContent = selectedSectionName || "—";
    }

    if ($("className")) {
      $("className").value = selectedClassName || "";
    }
  }

  /* =====================================================
     ملف المعلمة والتهيئة
     ===================================================== */

  async function loadTeacherProfile() {
    const snapshot = await db.collection("teachers")
      .doc(currentTeacher.uid)
      .get();

    if (!snapshot.exists) {
      throw new Error("لم يُعثر على ملف المعلمة.");
    }

    teacherProfile = snapshot.data();

    if ($("teacherName")) {
      $("teacherName").textContent = teacherProfile.name || "";
    }

    if ($("schoolName")) {
      $("schoolName").textContent = teacherProfile.school || "";
    }

    if ($("subjectName")) {
      $("subjectName").value = teacherProfile.subject || "";
    }

    populateClassSelect();
    refreshClassLabel();
  }

  async function initializeDashboard() {
    showDashboard();

    try {
      await loadTeacherProfile();

      watchStudents();
      watchRewards();
      watchRewardRequests();
    } catch (error) {
      console.error("Dashboard initialization error:", error);

      alert("تعذر تحميل بيانات المعلمة. تحققي من اتصال Firebase وقواعد الأمان.");
    }
  }

  /* =====================================================
     الطلاب
     ===================================================== */

  function clearStudentForm() {
    editingStudentId = null;

    [
      "studentName",
      "studentCode",
      "studentPoints",
      "studentMessage"
    ].forEach((id) => {
      if ($(id)) $(id).value = "";
    });

    if ($("studentPoints")) $("studentPoints").value = 0;
    if ($("className")) $("className").value = selectedClassName || "";

    if ($("studentSaveButton")) {
      $("studentSaveButton").textContent = "إضافة الطالب";
    }

    clearMessage("studentStatus");
  }

  async function addStudent() {
    clearMessage("studentStatus");

    const name = $("studentName")?.value.trim();
    const code = $("studentCode")?.value.trim();
    const points = Number($("studentPoints")?.value || 0);
    const message = $("studentMessage")?.value.trim() || "";

    if (!name || !code) {
      showMessage("studentStatus", "أدخلي اسم الطالب ورمزه.", true);
      return;
    }

    if (!selectedClassName || !selectedSectionName) {
      showMessage("studentStatus", "اختاري الصف والشعبة.", true);
      return;
    }

    if (!Number.isFinite(points) || points < 0) {
      showMessage("studentStatus", "أدخلي عدد نقاط صحيحًا.", true);
      return;
    }

    setBusy("studentSaveButton", true);

    try {
      const collection = teacherCollection("students");

      const studentData = {
        name,
        code,
        points,
        message,
        className: selectedClassName,
        section: selectedSectionName,
        subject: teacherProfile?.subject || "",
        updatedAt: timestamp()
      };

      if (editingStudentId) {
        await collection.doc(editingStudentId).update(studentData);
        showMessage("studentStatus", "تم تحديث بيانات الطالب.");
      } else {
        studentData.createdAt = timestamp();
        await collection.add(studentData);
        showMessage("studentStatus", "تمت إضافة الطالب.");
      }

      clearStudentForm();
    } catch (error) {
      console.error("Save student error:", error);
      showMessage("studentStatus", "تعذر حفظ بيانات الطالب.", true);
    } finally {
      setBusy("studentSaveButton", false);
    }
  }

  function watchStudents() {
    if (unsubscribeStudents) unsubscribeStudents();

    const list = $("studentsList");
    if (!list) return;

    if (!selectedClassName || !selectedSectionName) {
      list.innerHTML = "<p>اختاري الصف والشعبة لعرض الطلاب.</p>";
      return;
    }

    unsubscribeStudents = teacherCollection("students")
      .where("className", "==", selectedClassName)
      .where("section", "==", selectedSectionName)
      .onSnapshot((snapshot) => {
        renderStudents(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        })));
      }, (error) => {
        console.error("Students listener error:", error);
        list.innerHTML = "<p>تعذر تحميل الطلاب.</p>";
      });
  }

  function renderStudents(students) {
    const list = $("studentsList");
    if (!list) return;

    if (!students.length) {
      list.innerHTML = "<p>لا يوجد طلاب في هذا الصف والشعبة بعد.</p>";
      return;
    }

    list.innerHTML = students.map((student) => `
      <div class="student-card" data-id="${escapeHtml(student.id)}">
        <h3>${escapeHtml(student.name || "")}</h3>
        <p>الرمز: ${escapeHtml(student.code || "")}</p>
        <p>النقاط: ${Number(student.points || 0)}</p>
        <p>${escapeHtml(student.message || "")}</p>
        <button type="button" data-action="edit-student"
          data-id="${escapeHtml(student.id)}">تعديل</button>
        <button type="button" data-action="delete-student"
          data-id="${escapeHtml(student.id)}">حذف</button>
      </div>
    `).join("");
  }

  async function editStudent(id) {
    try {
      const doc = await teacherCollection("students").doc(id).get();

      if (!doc.exists) {
        showMessage("studentStatus", "الطالب غير موجود.", true);
        return;
      }

      const student = doc.data();

      editingStudentId = id;

      if ($("studentName")) $("studentName").value = student.name || "";
      if ($("studentCode")) $("studentCode").value = student.code || "";
      if ($("studentPoints")) {
        $("studentPoints").value = Number(student.points || 0);
      }
      if ($("studentMessage")) {
        $("studentMessage").value = student.message || "";
      }

      if ($("studentSaveButton")) {
        $("studentSaveButton").textContent = "حفظ التعديلات";
      }

      clearMessage("studentStatus");
      $("studentName")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      console.error(error);
      showMessage("studentStatus", "تعذر تحميل بيانات الطالب.", true);
    }
  }

  async function deleteStudent(id) {
    if (!confirm("هل تريدين حذف هذا الطالب؟")) return;

    try {
      await teacherCollection("students").doc(id).delete();
      showMessage("studentStatus", "تم حذف الطالب.");
    } catch (error) {
      console.error(error);
      showMessage("studentStatus", "تعذر حذف الطالب.", true);
    }
  }

  function cancelStudentEdit() {
    clearStudentForm();
  }

  /* =====================================================
     المكافآت
     ===================================================== */

  function clearRewardForm() {
    editingRewardId = null;

    ["rewardName", "rewardPrice", "rewardIcon", "rewardDescription"]
      .forEach((id) => {
        if ($(id)) $(id).value = "";
      });

    if ($("rewardIcon")) $("rewardIcon").value = "🎁";
    if ($("rewardSaveButton")) {
      $("rewardSaveButton").textContent = "إضافة المكافأة";
    }

    clearMessage("rewardStatus");
  }

  async function saveReward() {
    clearMessage("rewardStatus");

    const name = $("rewardName")?.value.trim();
    const price = Number($("rewardPrice")?.value);
    const icon = $("rewardIcon")?.value.trim() || "🎁";
    const description = $("rewardDescription")?.value.trim() || "";

    if (!name || !Number.isFinite(price) || price <= 0) {
      showMessage(
        "rewardStatus",
        "أدخلي اسم المكافأة وسعرًا صحيحًا بالنقاط.",
        true
      );
      return;
    }

    setBusy("rewardSaveButton", true);

    try {
      const data = {
        name,
        price,
        icon,
        description,
        updatedAt: timestamp()
      };

      const collection = teacherCollection("rewards");

      if (editingRewardId) {
        await collection.doc(editingRewardId).update(data);
        showMessage("rewardStatus", "تم تحديث المكافأة.");
      } else {
        data.createdAt = timestamp();
        data.active = true;
        await collection.add(data);
        showMessage("rewardStatus", "تمت إضافة المكافأة.");
      }

      clearRewardForm();
    } catch (error) {
      console.error("Save reward error:", error);
      showMessage("rewardStatus", "تعذر حفظ المكافأة.", true);
    } finally {
      setBusy("rewardSaveButton", false);
    }
  }

  function watchRewards() {
    if (unsubscribeRewards) unsubscribeRewards();

    const list = $("rewardsManagerList");
    if (!list) return;

    unsubscribeRewards = teacherCollection("rewards")
      .onSnapshot((snapshot) => {
        renderRewards(snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        })));
      }, (error) => {
        console.error("Rewards listener error:", error);
        list.innerHTML = "<p>تعذر تحميل المكافآت.</p>";
      });
  }

  function renderRewards(rewards) {
    const list = $("rewardsManagerList");
    if (!list) return;

    if (!rewards.length) {
      list.innerHTML = "<p>لم تتم إضافة مكافآت بعد.</p>";
      return;
    }

    list.innerHTML = rewards.map((reward) => `
      <div class="reward-card" data-id="${escapeHtml(reward.id)}">
        <h3>${escapeHtml(reward.icon || "🎁")} ${escapeHtml(reward.name || "")}</h3>
        <p>السعر: ${Number(reward.price || 0)} نقطة</p>
        <p>${escapeHtml(reward.description || "")}</p>
        <button type="button" data-action="edit-reward"
          data-id="${escapeHtml(reward.id)}">تعديل</button>
        <button type="button" data-action="delete-reward"
          data-id="${escapeHtml(reward.id)}">حذف</button>
      </div>
    `).join("");
  }

  async function editReward(id) {
    try {
      const doc = await teacherCollection("rewards").doc(id).get();

      if (!doc.exists) {
        showMessage("rewardStatus", "المكافأة غير موجودة.", true);
        return;
      }

      const reward = doc.data();
      editingRewardId = id;

      if ($("rewardName")) $("rewardName").value = reward.name || "";
      if ($("rewardPrice")) $("rewardPrice").value = reward.price || 0;
      if ($("rewardIcon")) $("rewardIcon").value = reward.icon || "🎁";
      if ($("rewardDescription")) {
        $("rewardDescription").value = reward.description || "";
      }

      if ($("rewardSaveButton")) {
        $("rewardSaveButton").textContent = "حفظ التعديلات";
      }
    } catch (error) {
      console.error(error);
      showMessage("rewardStatus", "تعذر تحميل المكافأة.", true);
    }
  }

  async function deleteReward(id) {
    if (!confirm("هل تريدين حذف هذه المكافأة؟")) return;

    try {
      await teacherCollection("rewards").doc(id).delete();
      showMessage("rewardStatus", "تم حذف المكافأة.");
    } catch (error) {
      console.error(error);
      showMessage("rewardStatus", "تعذر حذف المكافأة.", true);
    }
  }

  function cancelRewardEdit() {
    clearRewardForm();
  }

  /* =====================================================
     طلبات استبدال المكافآت
     ===================================================== */

  function watchRewardRequests() {
    if (unsubscribeRequests) unsubscribeRequests();

    const list = $("rewardRequestsList");
    if (!list) return;

    unsubscribeRequests = teacherCollection("rewardRequests")
      .onSnapshot((snapshot) => {
        const requests = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));

        renderRewardRequests(requests);
      }, (error) => {
        console.error("Requests listener error:", error);
        list.innerHTML = "<p>تعذر تحميل طلبات الاستبدال.</p>";
      });
  }

  function renderRewardRequests(requests) {
    const list = $("rewardRequestsList");
    if (!list) return;

    const pending = requests.filter((request) =>
      ["pending", "قيد الانتظار"].includes(request.status || "pending")
    );

    if ($("pendingCount")) {
      $("pendingCount").textContent = String(pending.length);
    }

    if (!requests.length) {
      list.innerHTML = "<p>لا توجد طلبات استبدال حتى الآن.</p>";
      return;
    }

    list.innerHTML = requests.map((request) => `
      <div class="request-card" data-id="${escapeHtml(request.id)}">
        <h3>${escapeHtml(request.studentName || request.name || "طالب")}</h3>
        <p>المكافأة: ${escapeHtml(request.rewardName || "—")}</p>
        <p>الحالة: ${escapeHtml(request.status || "قيد الانتظار")}</p>
        ${
          ["pending", "قيد الانتظار"].includes(
            request.status || "pending"
          )
            ? `
              <button type="button" data-action="approve-request"
                data-id="${escapeHtml(request.id)}">قبول</button>
              <button type="button" data-action="reject-request"
                data-id="${escapeHtml(request.id)}">رفض</button>
            `
            : ""
        }
      </div>
    `).join("");
  }

  async function updateRequestStatus(id, status) {
    const message = status === "approved"
      ? "هل تريدين قبول طلب الاستبدال؟"
      : "هل تريدين رفض طلب الاستبدال؟";

    if (!confirm(message)) return;

    try {
      await teacherCollection("rewardRequests").doc(id).update({
        status,
        reviewedAt: timestamp()
      });
    } catch (error) {
      console.error(error);
      alert("تعذر تحديث الطلب. تحققي من قواعد الأمان.");
    }
  }

  /* =====================================================
     أحداث الواجهة
     ===================================================== */

  $("teacherLoginButton")?.addEventListener("click", loginTeacher);

  $("teacherCode")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginTeacher();
  });

  $("showRegisterButton")?.addEventListener("click", showRegistration);

  $("teacherRegistrationForm")?.addEventListener(
    "submit",
    registerTeacher
  );

  $("studentSaveButton")?.addEventListener("click", addStudent);

  $("cancelStudentButton")?.addEventListener(
    "click",
    cancelStudentEdit
  );

  $("rewardSaveButton")?.addEventListener("click", saveReward);

  $("cancelRewardButton")?.addEventListener(
    "click",
    cancelRewardEdit
  );

  $("addRegistrationClassButton")?.addEventListener("click", () => {
    const container = $("registrationClasses");
    const firstRow = container?.querySelector(".registration-class-row");

    if (!container || !firstRow) return;

    const clone = firstRow.cloneNode(true);

    clone.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });

    const select = clone.querySelector(".register-class-select");
    if (select) select.selectedIndex = 0;

    container.appendChild(clone);
  });

  $("registrationClasses")?.addEventListener("click", (event) => {
    const removeButton = event.target.closest(
      "[data-remove-class], .remove-registration-class"
    );

    if (!removeButton) return;

    const rows = document.querySelectorAll(".registration-class-row");

    if (rows.length > 1) {
      removeButton.closest(".registration-class-row")?.remove();
    }
  });

  $("studentsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "edit-student") editStudent(id);
    if (action === "delete-student") deleteStudent(id);
  });

  $("rewardsManagerList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "edit-reward") editReward(id);
    if (action === "delete-reward") deleteReward(id);
  });

  $("rewardRequestsList")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "approve-request") {
      updateRequestStatus(id, "approved");
    }

    if (action === "reject-request") {
      updateRequestStatus(id, "rejected");
    }
  });

  $("logoutButton")?.addEventListener("click", async () => {
    stopListeners();
    currentTeacher = null;
    teacherProfile = null;
    selectedClassName = "";
    selectedSectionName = "";

    try {
      await auth.signOut();
      showLogin();
    } catch (error) {
      console.error("Logout error:", error);
      alert("تعذر تسجيل الخروج.");
    }
  });

  /* =====================================================
     استعادة جلسة المعلمة
     ===================================================== */

  auth.onAuthStateChanged(async (user) => {
    stopListeners();

    currentTeacher = user || null;
    teacherProfile = null;

    if (!user) {
      showLogin();
      return;
    }

    await initializeDashboard();
  });

  // إتاحة الدوال عند الحاجة من عناصر HTML القديمة.
  window.showTeacherRegistration = showRegistration;
  window.registerTeacher = registerTeacher;
  window.addStudent = addStudent;
  window.saveReward = saveReward;
  window.cancelStudentEdit = cancelStudentEdit;
  window.cancelRewardEdit = cancelRewardEdit;

})();
