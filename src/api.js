// الاتصال بواجهة البيانات على Cloudflare (functions/api)

// رقم هالجهاز في الإشعارات، عشان ما يوصله إشعار عن شي سجّله هو
function deviceId() {
  try { return JSON.parse(localStorage.getItem("wad_device"))?.id; } catch { return undefined; }
}

async function call(path, method = "GET", body) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  const device = deviceId();
  if (device) headers["x-device"] = String(device);
  const res = await fetch(`/api/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

const post = (path) => (body) => call(path, "POST", body);
const remove = (path) => (id) => call(`${path}/${id}`, "DELETE");

export const api = {
  all: () => call("all"),
  addReading: post("readings"),
  deleteReading: remove("readings"),
  addDose: (slot, units = null, at = null) => call("doses", "POST", { slot, units, at }),
  updateDose: (id, d) => call(`doses/${id}`, "PUT", d),
  deleteDose: remove("doses"),
  addBp: post("bp"),
  deleteBp: remove("bp"),
  addMedication: post("medications"),
  updateMedication: (id, m) => call(`medications/${id}`, "PUT", m),
  addMedDose: post("med-doses"),
  deleteMedDose: remove("med-doses"),
  addAppointment: post("appointments"),
  deleteAppointment: remove("appointments"),
  addNote: post("notes"),
  deleteNote: remove("notes"),
  addLab: post("labs"),
  updateLab: (id, l) => call(`labs/${id}`, "PUT", l),
  deleteLab: remove("labs"),
  addMeal: post("meals"),
  deleteMeal: remove("meals"),
  pushKey: () => call("push/key"),
  pushSubscribe: (b) => call("push/subscribe", "POST", b),
  pushUnsubscribe: (id) => call("push/unsubscribe", "POST", { id }),
  pushDevices: () => call("push/devices"),
  pushTest: (id) => call("push/test", "POST", { id }),
  saveSettings: (s) => call("settings", "PUT", s),
};
