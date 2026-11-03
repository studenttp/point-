
document.getElementById("toggleCode")?.addEventListener("click", () => {
  const input = document.getElementById("teacherCode");
  const button = document.getElementById("toggleCode");

  if (!input || !button) return;

  const showCode = input.type === "password";

  input.type = showCode ? "text" : "password";
  button.textContent = showCode ? "إخفاء الرمز" : "إظهار الرمز";
});
