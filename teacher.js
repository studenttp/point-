
/* =========================================================
   نجوم صفي - teacher.js
   Firebase Compat SDK
   المسارات:
   teachers/{teacherId}/students
   teachers/{teacherId}/rewards
   teachers/{teacherId}/rewardRequests
   studentCodeIndex/{code}
   ========================================================= */

const db = firebase.firestore();
const auth = firebase.auth();

let currentTeacher = null;
let studentsCache = [];
let rewardsCache = [];
let requestsCache = [];
let editingStudentId = null;

/* -------------------- المسارات -------------------- */

function teacherDoc() {
  if (!currentTeacher) {
    throw new Error("يجب تسجيل الدخول أولاً.");
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

function studentCodeIndexCollection() {
  return db.collection("studentCodeIndex");
}

/* -------------------- أدوات مساعدة -------------------- */

function getElement(...ids) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

function getValue(...ids) {
  const element = getElement(...ids);
  return element ? element.value.trim() : "";
}

function setValue(value, ...ids) {
  const element = getElement(...ids);
  if (element) element.value = value ?? "";
}

function showMessage(message, type = "info") {
  const element = getElement(
    "message",
    "statusMessage",
    "teacherMessage",
    "alertMessage"
  );

  if (element) {
    element.textContent = message;
    element.dataset.type = type;
    element.style.display = "block";
  } else {
    alert(message);
  }
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function timestampNow() {
  return firebase.firestore.FieldValue.serverTimestamp();
}

function getErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "لا توجد صلاحية لتنفيذ العملية. تحققي من قواعد Firestore.";
  }

  if (error?.code === "auth/email-already-in-use") {
    return "البريد الإلكتروني مستخدم مسبقًا.";
  }

  if (error?.code === "auth/invalid-credential") {
    return "بيانات تسجيل الدخول غير صحيحة.";
  }

  return error?.message || "حدث خطأ غير متوقع.";
}

function requireTeacher() {
  if (!currentTeacher) {
    throw new Error("انتهت الجلسة أو لم يتم تسجيل الدخول.");
  }
}

/* -------------------- تسجيل الدخول -------------------- */

auth.onAuthStateChanged(async user => {
  currentTeacher = user || null;

  const loginPanel = getElement("loginPanel", "loginSection", "loginBox");
  const dashboard = getElement(
    "teacherDashboard",
    "dashboard",
    "controlPanel"
  );

  if (user) {
    if (loginPanel) loginPanel.style.display = "none";
    if (dashboard) dashboard.style.display = "block";

    await loadStudents();
    await loadRewards();
    await loadRewardRequests();
  } else {
    if (loginPanel) loginPanel.style.display = "block";
    if (dashboard) dashboard.style.display = "none";
  }
});

async function teacherLogin() {
  const email = getValue("teacherEmail", "loginEmail", "email");
  const password = getValue("teacherPassword", "loginPassword", "password");

  if (!email || !password) {
    showMessage("أدخلي البريد الإلكتروني وكلمة المرور.", "error");
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    showMessage("تم تسجيل الدخول بنجاح.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

async function teacherRegister() {
  const email = getValue("teacherEmail", "registerEmail", "email");
  const password = getValue(
    "teacherPassword",
    "registerPassword",
    "password"
  );
  const teacherName = getValue(
    "teacherName",
    "registerName",
    "name"
  );
  const schoolName = getValue("schoolName", "registerSchool");

  if (!email || !password) {
    showMessage("أدخلي البريد الإلكتروني وكلمة المرور.", "error");
    return;
  }

  if (password.length < 6) {
    showMessage("يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.", "error");
    return;
  }

  try {
    const credential = await auth.createUserWithEmailAndPassword(
      email,
      password
    );

    await db.collection("teachers").doc(credential.user.uid).set({
      teacherId: credential.user.uid,
      name: teacherName,
      email,
      schoolName,
      createdAt: timestampNow()
    });

    currentTeacher = credential.user;
    showMessage("تم إنشاء حساب المعلمة بنجاح.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

async function teacherLogout() {
  try {
    await auth.signOut();
    currentTeacher = null;
    studentsCache = [];
    rewardsCache = [];
    requestsCache = [];
    showMessage("تم تسجيل الخروج.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

/* -------------------- الطلاب والطالبات -------------------- */

async function loadStudents() {
  try {
    requireTeacher();

    const snapshot = await studentsCollection()
      .orderBy("name")
      .get();

    studentsCache = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderStudents();
    return studentsCache;
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
    return [];
  }
}

function renderStudents() {
  const container = getElement(
    "studentsList",
    "studentsContainer",
    "studentsTableBody",
    "studentsTable"
  );

  if (!container) return;

  if (!studentsCache.length) {
    container.innerHTML = "<p>لا توجد طالبات مسجلات حتى الآن.</p>";
    return;
  }

  container.innerHTML = studentsCache.map(student => `
    <div class="student-card" data-student-id="${escapeHTML(student.id)}">
      <strong>${escapeHTML(student.name)}</strong>
      <div>الرمز: ${escapeHTML(student.code)}</div>
      <div>الصف: ${escapeHTML(student.className || "")}</div>
      <div>الشعبة: ${escapeHTML(student.section || "")}</div>
      <div>النقاط: ${Number(student.points) || 0}</div>
      <div>${escapeHTML(student.message || "")}</div>

      <button type="button"
        onclick="editStudent('${escapeHTML(student.id)}')">
        تعديل
      </button>

      <button type="button"
        onclick="deleteStudent('${escapeHTML(student.id)}')">
        حذف
      </button>
    </div>
  `).join("");
}

function getStudentFormData() {
  const name = getValue("studentName", "name");
  const code = getValue("studentCode", "code");
  const className = getValue("studentClass", "className", "grade");
  const section = getValue("studentSection", "section");
  const pointsValue = getValue("studentPoints", "points");
  const message = getValue("studentMessage", "message");

  if (!name || !code) {
    throw new Error("أدخلي اسم الطالبة ورمزها.");
  }

  if (code.includes("/")) {
    throw new Error("لا يمكن أن يحتوي الرمز على علامة /.");
  }

  if (code.length > 100) {
    throw new Error("الرمز طويل جدًا.");
  }

  const points = pointsValue === ""
    ? 0
    : Number(pointsValue);

  if (!Number.isFinite(points) || points < 0) {
    throw new Error("أدخلي عدد نقاط صحيحًا.");
  }

  return {
    name,
    code,
    className,
    section,
    points,
    message
  };
}

/*
  إضافة طالبة أو تعديلها.
  تتم قراءة فهرس الرمز وبيانات الطالبة داخل معاملة واحدة،
  ثم حفظ السجل والفهرس معًا لمنع تكرار الرمز.
*/
async function saveStudent() {
  try {
    requireTeacher();

    const data = getStudentFormData();
    const teacherId = currentTeacher.uid;

    const studentRef = editingStudentId
      ? studentsCollection().doc(editingStudentId)
      : studentsCollection().doc();

    const newIndexRef = studentCodeIndexCollection().doc(data.code);

    await db.runTransaction(async transaction => {
      // يجب إجراء جميع القراءات قبل أي كتابة.
      const studentSnapshot = editingStudentId
        ? await transaction.get(studentRef)
        : null;

      if (editingStudentId && !studentSnapshot.exists) {
        throw new Error("الطالبة المطلوب تعديلها غير موجودة.");
      }

      const newIndexSnapshot = await transaction.get(newIndexRef);

      let oldCode = null;
      let oldIndexRef = null;
      let oldIndexSnapshot = null;

      if (studentSnapshot && studentSnapshot.exists) {
        oldCode = studentSnapshot.data().code;

        if (oldCode && oldCode !== data.code) {
          oldIndexRef = studentCodeIndexCollection().doc(oldCode);
          oldIndexSnapshot = await transaction.get(oldIndexRef);
        }
      }

      if (newIndexSnapshot.exists) {
        const indexData = newIndexSnapshot.data();

        const belongsToThisStudent =
          indexData.teacherId === teacherId &&
          indexData.studentId === studentRef.id;

        if (!belongsToThisStudent) {
          throw new Error(
            "هذا الرمز مستخدم بالفعل لطالبة أخرى. اختاري رمزًا مختلفًا."
          );
        }
      }

      const existingData = studentSnapshot?.exists
        ? studentSnapshot.data()
        : {};

      const studentData = {
        ...data,
        teacherId,
        updatedAt: timestampNow(),
        createdAt: existingData.createdAt || timestampNow()
      };

      transaction.set(studentRef, studentData, { merge: true });

      transaction.set(newIndexRef, {
        code: data.code,
        teacherId,
        studentId: studentRef.id,
        className: data.className,
        section: data.section,
        updatedAt: timestampNow(),
        createdAt: newIndexSnapshot.exists
          ? (newIndexSnapshot.data().createdAt || timestampNow())
          : timestampNow()
      }, { merge: true });

      // حذف الفهرس القديم عند تغيير الرمز،
      // بشرط أن يكون مملوكًا للطالبة نفسها.
      if (
        oldIndexRef &&
        oldIndexSnapshot &&
        oldIndexSnapshot.exists
      ) {
        const oldIndexData = oldIndexSnapshot.data();

        if (
          oldIndexData.teacherId === teacherId &&
          oldIndexData.studentId === studentRef.id
        ) {
          transaction.delete(oldIndexRef);
        }
      }
    });

    editingStudentId = null;

    const form = getElement("studentForm");
    if (form) form.reset();

    await loadStudents();

    showMessage(
      "تم حفظ بيانات الطالبة ورمزها بنجاح.",
      "success"
    );
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

function editStudent(studentId) {
  const student = studentsCache.find(item => item.id === studentId);

  if (!student) {
    showMessage("لم يتم العثور على الطالبة.", "error");
    return;
  }

  editingStudentId = studentId;

  setValue(student.name, "studentName", "name");
  setValue(student.code, "studentCode", "code");
  setValue(student.className, "studentClass", "className", "grade");
  setValue(student.section, "studentSection", "section");
  setValue(student.points, "studentPoints", "points");
  setValue(student.message, "studentMessage", "message");

  const submitButton = getElement("saveStudentButton", "studentSubmit");
  if (submitButton) submitButton.textContent = "حفظ التعديلات";

  const form = getElement("studentForm");
  if (form) {
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function cancelStudentEdit() {
  editingStudentId = null;

  const form = getElement("studentForm");
  if (form) form.reset();

  const submitButton = getElement("saveStudentButton", "studentSubmit");
  if (submitButton) submitButton.textContent = "إضافة الطالبة";
}

async function deleteStudent(studentId) {
  if (!confirm("هل تريدين حذف هذه الطالبة؟")) return;

  try {
    requireTeacher();

    const studentRef = studentsCollection().doc(studentId);

    await db.runTransaction(async transaction => {
      const studentSnapshot = await transaction.get(studentRef);

      if (!studentSnapshot.exists) {
        throw new Error("الطالبة غير موجودة.");
      }

      const studentData = studentSnapshot.data();
      const code = studentData.code;

      let indexRef = null;
      let indexSnapshot = null;

      if (code) {
        indexRef = studentCodeIndexCollection().doc(code);
        indexSnapshot = await transaction.get(indexRef);
      }

      if (
        indexRef &&
        indexSnapshot &&
        indexSnapshot.exists
      ) {
        const indexData = indexSnapshot.data();

        if (
          indexData.teacherId === currentTeacher.uid &&
          indexData.studentId === studentId
        ) {
          transaction.delete(indexRef);
        }
      }

      transaction.delete(studentRef);
    });

    if (editingStudentId === studentId) {
      cancelStudentEdit();
    }

    await loadStudents();
    showMessage("تم حذف الطالبة.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

/* -------------------- إدارة المكافآت -------------------- */

async function loadRewards() {
  try {
    requireTeacher();

    const snapshot = await rewardsCollection().get();

    rewardsCache = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderRewards();
    return rewardsCache;
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
    return [];
  }
}

function renderRewards() {
  const container = getElement(
    "rewardsList",
    "rewardsContainer",
    "rewardsTableBody"
  );

  if (!container) return;

  if (!rewardsCache.length) {
    container.innerHTML = "<p>لا توجد مكافآت مضافة.</p>";
    return;
  }

  container.innerHTML = rewardsCache.map(reward => `
    <div class="reward-card">
      <span>${escapeHTML(reward.icon || "🎁")}</span>
      <strong>${escapeHTML(reward.name || "")}</strong>
      <div>النقاط المطلوبة: ${Number(reward.price) || 0}</div>
      <div>${escapeHTML(reward.description || "")}</div>
      <button type="button"
        onclick="deleteReward('${escapeHTML(reward.id)}')">
        حذف المكافأة
      </button>
    </div>
  `).join("");
}

async function saveReward() {
  try {
    requireTeacher();

    const name = getValue("rewardName", "newRewardName");
    const priceValue = getValue("rewardPrice", "newRewardPrice");
    const icon = getValue("rewardIcon", "newRewardIcon") || "🎁";
    const description = getValue(
      "rewardDescription",
      "newRewardDescription"
    );

    const price = Number(priceValue);

    if (!name) {
      throw new Error("أدخلي اسم المكافأة.");
    }

    if (
      priceValue === "" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new Error("أدخلي عدد نقاط صحيحًا للمكافأة.");
    }

    await rewardsCollection().add({
      name,
      price,
      icon,
      description,
      active: true,
      teacherId: currentTeacher.uid,
      createdAt: timestampNow(),
      updatedAt: timestampNow()
    });

    const form = getElement("rewardForm");
    if (form) form.reset();

    await loadRewards();
    showMessage("تمت إضافة المكافأة.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

async function deleteReward(rewardId) {
  if (!confirm("هل تريدين حذف هذه المكافأة؟")) return;

  try {
    requireTeacher();

    await rewardsCollection().doc(rewardId).delete();

    await loadRewards();
    showMessage("تم حذف المكافأة.", "success");
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

/* -------------------- طلبات استبدال المكافآت -------------------- */

async function loadRewardRequests() {
  try {
    requireTeacher();

    const snapshot = await requestsCollection().get();

    requestsCache = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderRewardRequests();
    return requestsCache;
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
    return [];
  }
}

function renderRewardRequests() {
  const container = getElement(
    "requestsList",
    "rewardRequestsList",
    "requestsContainer",
    "requestsTableBody"
  );

  if (!container) return;

  if (!requestsCache.length) {
    container.innerHTML = "<p>لا توجد طلبات استبدال.</p>";
    return;
  }

  container.innerHTML = requestsCache.map(request => `
    <div class="request-card">
      <strong>${escapeHTML(request.studentName || "طالبة")}</strong>
      <div>المكافأة: ${escapeHTML(request.rewardName || "")}</div>
      <div>النقاط: ${Number(request.price) || 0}</div>
      <div>الحالة: ${escapeHTML(request.status || "pending")}</div>

      ${
        request.status === "pending"
          ? `
            <button type="button"
              onclick="processRewardRequest('${escapeHTML(request.id)}','approved')">
              قبول الطلب
            </button>
            <button type="button"
              onclick="processRewardRequest('${escapeHTML(request.id)}','rejected')">
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
    showMessage("حالة الطلب غير صحيحة.", "error");
    return;
  }

  try {
    requireTeacher();

    const requestRef = requestsCollection().doc(requestId);

    await db.runTransaction(async transaction => {
      const requestSnapshot = await transaction.get(requestRef);

      if (!requestSnapshot.exists) {
        throw new Error("طلب الاستبدال غير موجود.");
      }

      const requestData = requestSnapshot.data();

      if (requestData.status !== "pending") {
        throw new Error("تمت معالجة هذا الطلب مسبقًا.");
      }

      let studentRef = null;
      let studentSnapshot = null;
      let pointsAfter = null;

      if (newStatus === "approved") {
        if (!requestData.studentId) {
          throw new Error("الطلب لا يحتوي على معرّف الطالبة.");
        }

        studentRef = studentsCollection().doc(requestData.studentId);
        studentSnapshot = await transaction.get(studentRef);

        if (!studentSnapshot.exists) {
          throw new Error("تعذر العثور على الطالبة.");
        }

        const studentData = studentSnapshot.data();
        const currentPoints = Number(studentData.points) || 0;
        const price = Number(requestData.price);

        if (!Number.isFinite(price) || price <= 0) {
          throw new Error("قيمة نقاط المكافأة غير صحيحة.");
        }

        if (currentPoints < price) {
          throw new Error("نقاط الطالبة غير كافية لقبول الطلب.");
        }

        pointsAfter = currentPoints - price;

        transaction.update(studentRef, {
          points: pointsAfter,
          updatedAt: timestampNow()
        });
      }

      transaction.update(requestRef, {
        status: newStatus,
        processedAt: timestampNow(),
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
      "success"
    );
  } catch (error) {
    showMessage(getErrorMessage(error), "error");
  }
}

/* -------------------- ربط الأزرار -------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const loginButton = getElement("loginButton", "teacherLoginButton");
  const registerButton = getElement(
    "registerButton",
    "teacherRegisterButton"
  );
  const logoutButton = getElement("logoutButton", "teacherLogoutButton");
  const studentForm = getElement("studentForm");
  const rewardForm = getElement("rewardForm");

  if (loginButton) {
    loginButton.addEventListener("click", event => {
      event.preventDefault();
      teacherLogin();
    });
  }

  if (registerButton) {
    registerButton.addEventListener("click", event => {
      event.preventDefault();
      teacherRegister();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", event => {
      event.preventDefault();
      teacherLogout();
    });
  }

  if (studentForm) {
    studentForm.addEventListener("submit", event => {
      event.preventDefault();
      saveStudent();
    });
  }

  if (rewardForm) {
    rewardForm.addEventListener("submit", event => {
      event.preventDefault();
      saveReward();
    });
  }

  const cancelButton = getElement("cancelStudentEdit");
  if (cancelButton) {
    cancelButton.addEventListener("click", cancelStudentEdit);
  }
});

/* -------------------- إتاحة الدوال لملف HTML -------------------- */

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
