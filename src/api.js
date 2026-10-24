// الاتصال بواجهة البيانات على Cloudflare (functions/api)

// رقم هالجهاز في الإشعارات، عشان ما يوصله إشعار عن شي سجّله هو
function deviceId() {
  try { return JSON.parse(localStorage.getItem("wad_device"))?.id; } catch { return undefined; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function call(path, method = "GET", body) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  const device = deviceId();
  if (device) headers["x-device"] = String(device);
  const res = await fetch(`/api/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("auth/login")) onUnauthorized();
  // الطلبات الطويلة ترجع 200 دايمًا، والخطأ يكون داخل الرد
  if (!res.ok || data.error) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

// المريض الحالي: كل بيانات القياسات والأدوية تروح له
let patientId = null;
export const setPatient = (id) => { patientId = id; };
const pp = (path) => `p/${patientId}/${path}`;
const post = (path) => (body) => call(pp(path), "POST", body);
const remove = (path) => (id) => call(pp(`${path}/${id}`), "DELETE");

// لما الاتصال ينقطع والذكاء الاصطناعي للحين يشتغل: نتابع لين تنحفظ النتيجة
export async function waitForNew(key, before, { tries = 12, every = 10000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, every));
    const d = await call(pp("all")).catch(() => null);
    if (d?.[key] && d[key].created_at !== before) return d[key];
  }
  return null;
}
export const isNetworkError = (e) => /load failed|failed to fetch|networkerror|network connection/i.test(e?.message || "");

export const api = {
  // الحساب
  login: (username, password) => call("auth/login", "POST", { username, password }),
  logout: () => call("auth/logout", "POST", {}),
  me: () => call("auth/me"),
  changePassword: (old, next) => call("auth/password", "POST", { old, new: next }),
  members: () => call("family/members"),
  addMember: (m) => call("family/members", "POST", m),
  removeMember: (id) => call(`family/members/${id}`, "DELETE"),
  adminFamilies: () => call("admin/families"),
  adminAddFamily: (f) => call("admin/families", "POST", f),
  addPatient: (p) => call("patients", "POST", p),
  updatePatient: (id, p) => call(`patients/${id}`, "PUT", p),
  archivePatient: (id) => call(`patients/${id}`, "DELETE"),

  // بيانات المريض الحالي
  all: () => call(pp("all")),
  addReading: post("readings"),
  deleteReading: remove("readings"),
  addDose: (slot, units = null, at = null) => call(pp("doses"), "POST", { slot, units, at }),
  updateDose: (id, d) => call(pp(`doses/${id}`), "PUT", d),
  deleteDose: remove("doses"),
  addBp: post("bp"),
  deleteBp: remove("bp"),
  addMedication: post("medications"),
  updateMedication: (id, m) => call(pp(`medications/${id}`), "PUT", m),
  addMedDose: post("med-doses"),
  deleteMedDose: remove("med-doses"),
  addAppointment: post("appointments"),
  deleteAppointment: remove("appointments"),
  addNote: post("notes"),
  deleteNote: remove("notes"),
  addLab: post("labs"),
  updateLab: (id, l) => call(pp(`labs/${id}`), "PUT", l),
  deleteLab: remove("labs"),
  addMeal: post("meals"),
  analyzeMeal: (photo, slot) => call(pp("meals/analyze"), "POST", { photo, slot }),
  mealPhotoUrl: (id) => `/api/${pp(`meals/${id}/photo`)}`,
  dietImageUrl: (day, meal, v) => `/api/${pp("diet/image")}?day=${encodeURIComponent(day)}&meal=${meal}&v=${encodeURIComponent(v || "")}`,
  scanMedicine: (photo) => call("ai/med-scan", "POST", { photo }),
  generateAdvice: () => call(pp("advice/generate"), "POST", {}),
  deleteMeal: remove("meals"),
  savePlan: (s) => call(pp("plan"), "PUT", s),
  saveSettings: (s) => call(pp("plan"), "PUT", s),
  generateDiet: () => call(pp("diet/generate"), "POST", {}),

  // الإشعارات
  pushKey: () => call("push/key"),
  pushSubscribe: (b) => call("push/subscribe", "POST", b),
  pushUnsubscribe: (id) => call("push/unsubscribe", "POST", { id }),
  pushDevices: () => call("push/devices"),
  pushTest: (id) => call("push/test", "POST", { id }),
};
