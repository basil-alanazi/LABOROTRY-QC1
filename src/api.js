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

export const api = {
  all: () => call("all"),
  addReading: (r) => call("readings", "POST", r),
  deleteReading: (id) => call(`readings/${id}`, "DELETE"),
  addDose: (slot) => call("doses", "POST", { slot }),
  deleteDose: (id) => call(`doses/${id}`, "DELETE"),
  addBp: (r) => call("bp", "POST", r),
  deleteBp: (id) => call(`bp/${id}`, "DELETE"),
  saveSettings: (s) => call("settings", "PUT", s),
};
