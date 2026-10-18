// الاتصال بواجهة البيانات على Cloudflare (functions/api)

async function call(path, method = "GET", body) {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
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
  addDose: (slot) => call("doses", "POST", { slot }),
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
  saveSettings: (s) => call("settings", "PUT", s),
};
