import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Paperclip, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth.jsx";
import { downloadExcel } from "../../lib/exportExcel";
import { downloadPdf } from "../../lib/exportPdf";
import { fetchAllRows } from "../../lib/fetchAll";

const TRACKER_ATTACHMENTS_BUCKET = "tracker-attachments";

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(TRACKER_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// Every date field here stays a plain editable input even after an
// auto-fill (e.g. policy expiry = issue date + 3 years) — this only flags
// it visually, it never locks anything.
function dueBadge(dateStr) {
  if (!dateStr) return null;
  const today = todayStr();
  if (dateStr < today) return { label: "Expired", cls: "bg-red-50 text-red-700" };
  const daysLeft = Math.round((new Date(dateStr) - new Date(today)) / 86400000);
  if (daysLeft <= 30) return { label: "Expiring Soon", cls: "bg-amber-50 text-amber-700" };
  return null;
}

const TABS = [
  { key: "license", label: "Baladiya License" },
  { key: "policy", label: "Policy" },
  { key: "culture", label: "Culture" },
  { key: "agreement", label: "Agreement" },
];

const emptyLicenseForm = { name: "", employee_no: "", file_no: "", department: "" };
const emptyPolicyForm = { policy_name: "", policy_no: "" };
const emptyCultureForm = { item: "" };
const emptyAgreementForm = { entity: "" };

export default function Trackers() {
  const { session, config } = useAuth();
  const [tab, setTab] = useState("license");
  const [message, setMessage] = useState(null);

  const [licenses, setLicenses] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [cultures, setCultures] = useState([]);
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [licenseForm, setLicenseForm] = useState(emptyLicenseForm);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [showCultureForm, setShowCultureForm] = useState(false);
  const [cultureForm, setCultureForm] = useState(emptyCultureForm);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [agreementForm, setAgreementForm] = useState(emptyAgreementForm);

  const departments = config?.employee_departments ?? [];
  const cultureItems = config?.culture_tracker_items ?? [];
  const agreementEntities = config?.agreement_tracker_entities ?? [];

  async function loadAll() {
    setLoading(true);
    const [{ data: lic }, { data: pol }, { data: cul }, { data: agr }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("baladiya_licenses").select("*").eq("deleted", false).order("name").range(from, to)),
      fetchAllRows((from, to) => supabase.from("policy_tracker").select("*").eq("deleted", false).order("policy_name").range(from, to)),
      fetchAllRows((from, to) => supabase.from("culture_tracker").select("*").eq("deleted", false).order("created_at", { ascending: false }).range(from, to)),
      fetchAllRows((from, to) => supabase.from("agreement_tracker").select("*").eq("deleted", false).order("created_at", { ascending: false }).range(from, to)),
    ]);
    setLicenses(lic ?? []);
    setPolicies(pol ?? []);
    setCultures(cul ?? []);
    setAgreements(agr ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function flash(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  async function uploadFile(bucketDir, file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${bucketDir || "tracker"}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(TRACKER_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  // --- Baladiya License ---
  async function addLicense(e) {
    e.preventDefault();
    const name = licenseForm.name.trim();
    if (!name) return flash({ type: "error", text: "Name is required" });
    const { error } = await supabase.from("baladiya_licenses").insert({
      name,
      employee_no: licenseForm.employee_no.trim(),
      file_no: licenseForm.file_no.trim(),
      department: licenseForm.department,
    });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setLicenseForm(emptyLicenseForm);
    setShowLicenseForm(false);
    loadAll();
  }
  function updateLicenseField(id, patch) {
    setLicenses((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function saveLicense(r) {
    await supabase
      .from("baladiya_licenses")
      .update({
        name: r.name,
        employee_no: r.employee_no,
        file_no: r.file_no,
        department: r.department,
        issue_date: r.issue_date || null,
        expiry_date: r.expiry_date || null,
      })
      .eq("id", r.id);
  }
  function onLicenseIssueDateChange(r, value) {
    updateLicenseField(r.id, { issue_date: value });
  }
  async function removeLicense(r) {
    if (!confirm(`Remove "${r.name}" from the license tracker?`)) return;
    await supabase.from("baladiya_licenses").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
    loadAll();
  }
  async function uploadLicenseAttachment(r, file) {
    try {
      const { path, name } = await uploadFile(r.name, file);
      await supabase.from("baladiya_licenses").update({ attachment_path: path, attachment_name: name }).eq("id", r.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  // --- Policy Tracker ---
  async function addPolicy(e) {
    e.preventDefault();
    const name = policyForm.policy_name.trim();
    if (!name) return flash({ type: "error", text: "Policy name is required" });
    const { error } = await supabase.from("policy_tracker").insert({ policy_name: name, policy_no: policyForm.policy_no.trim() });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setPolicyForm(emptyPolicyForm);
    setShowPolicyForm(false);
    loadAll();
  }
  function updatePolicyField(id, patch) {
    setPolicies((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function savePolicy(r) {
    await supabase
      .from("policy_tracker")
      .update({
        policy_name: r.policy_name,
        policy_no: r.policy_no,
        issue_date: r.issue_date || null,
        revision_date: r.revision_date || null,
        expiry_date: r.expiry_date || null,
        renewed: r.renewed,
      })
      .eq("id", r.id);
  }
  function onPolicyIssueDateChange(r, value) {
    updatePolicyField(r.id, { issue_date: value, expiry_date: value ? addYears(value, 3) : "" });
  }
  async function togglePolicyRenewed(r) {
    const next = { ...r, renewed: !r.renewed };
    updatePolicyField(r.id, { renewed: next.renewed });
    await supabase.from("policy_tracker").update({ renewed: next.renewed }).eq("id", r.id);
  }
  async function removePolicy(r) {
    if (!confirm(`Remove policy "${r.policy_name}"?`)) return;
    await supabase.from("policy_tracker").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
    loadAll();
  }
  async function uploadPolicyAttachment(r, file) {
    try {
      const { path, name } = await uploadFile(r.policy_name, file);
      await supabase.from("policy_tracker").update({ attachment_path: path, attachment_name: name }).eq("id", r.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  // --- Culture Tracker ---
  async function addCulture(e) {
    e.preventDefault();
    if (!cultureForm.item) return flash({ type: "error", text: "Item is required" });
    const { error } = await supabase.from("culture_tracker").insert({ item: cultureForm.item });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setCultureForm(emptyCultureForm);
    setShowCultureForm(false);
    loadAll();
  }
  function updateCultureField(id, patch) {
    setCultures((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function saveCulture(r) {
    await supabase.from("culture_tracker").update({ item: r.item, sent_on: r.sent_on || null, next_due: r.next_due || null }).eq("id", r.id);
  }
  async function removeCulture(r) {
    if (!confirm(`Remove this "${r.item}" entry?`)) return;
    await supabase.from("culture_tracker").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
    loadAll();
  }
  async function uploadCultureAttachment(r, file) {
    try {
      const { path, name } = await uploadFile(r.item, file);
      await supabase.from("culture_tracker").update({ attachment_path: path, attachment_name: name }).eq("id", r.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  // --- Agreement Tracker ---
  async function addAgreement(e) {
    e.preventDefault();
    if (!agreementForm.entity) return flash({ type: "error", text: "Entity is required" });
    const { error } = await supabase.from("agreement_tracker").insert({ entity: agreementForm.entity });
    if (error) return flash({ type: "error", text: "Could not add: " + error.message });
    setAgreementForm(emptyAgreementForm);
    setShowAgreementForm(false);
    loadAll();
  }
  function updateAgreementField(id, patch) {
    setAgreements((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function saveAgreement(r) {
    await supabase.from("agreement_tracker").update({ entity: r.entity, renewed_on: r.renewed_on || null, next_due: r.next_due || null }).eq("id", r.id);
  }
  async function removeAgreement(r) {
    if (!confirm(`Remove this "${r.entity}" entry?`)) return;
    await supabase.from("agreement_tracker").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", r.id);
    loadAll();
  }
  async function uploadAgreementAttachment(r, file) {
    try {
      const { path, name } = await uploadFile(r.entity, file);
      await supabase.from("agreement_tracker").update({ attachment_path: path, attachment_name: name }).eq("id", r.id);
      loadAll();
    } catch (err) {
      flash({ type: "error", text: "Could not upload: " + err.message });
    }
  }

  const overdueCount = useMemo(() => {
    const badges = [
      ...licenses.map((r) => dueBadge(r.expiry_date)),
      ...policies.map((r) => dueBadge(r.expiry_date)),
      ...cultures.map((r) => dueBadge(r.next_due)),
      ...agreements.map((r) => dueBadge(r.next_due)),
    ];
    return badges.filter((b) => b?.label === "Expired").length;
  }, [licenses, policies, cultures, agreements]);

  function exportExcel() {
    downloadExcel(`infection-control-trackers-${todayStr()}`, [
      {
        name: "Baladiya License",
        headers: ["Name", "Emp ID", "File No", "Department", "Issue Date", "Expiry Date"],
        rows: licenses.map((r) => [r.name, r.employee_no, r.file_no, r.department, r.issue_date || "", r.expiry_date || ""]),
      },
      {
        name: "Policy",
        headers: ["Policy Name", "Policy No", "Issue Date", "Revision Date", "Expiry Date", "Renewed"],
        rows: policies.map((r) => [r.policy_name, r.policy_no, r.issue_date || "", r.revision_date || "", r.expiry_date || "", r.renewed ? "Yes" : ""]),
      },
      { name: "Culture", headers: ["Item", "Sent On", "Next Due"], rows: cultures.map((r) => [r.item, r.sent_on || "", r.next_due || ""]) },
      { name: "Agreement", headers: ["Entity", "Renewed On", "Next Due"], rows: agreements.map((r) => [r.entity, r.renewed_on || "", r.next_due || ""]) },
    ]);
  }

  function exportPdf() {
    downloadPdf(`infection-control-trackers-${todayStr()}`, "Infection Control — Trackers", [
      {
        title: "Baladiya License",
        headers: ["Name", "Emp ID", "File No", "Department", "Issue Date", "Expiry Date"],
        rows: licenses.map((r) => [r.name, r.employee_no, r.file_no, r.department, r.issue_date || "", r.expiry_date || ""]),
      },
      {
        title: "Policy",
        headers: ["Policy Name", "Policy No", "Issue Date", "Revision Date", "Expiry Date", "Renewed"],
        rows: policies.map((r) => [r.policy_name, r.policy_no, r.issue_date || "", r.revision_date || "", r.expiry_date || "", r.renewed ? "Yes" : ""]),
      },
      { title: "Culture", headers: ["Item", "Sent On", "Next Due"], rows: cultures.map((r) => [r.item, r.sent_on || "", r.next_due || ""]) },
      { title: "Agreement", headers: ["Entity", "Renewed On", "Next Due"], rows: agreements.map((r) => [r.entity, r.renewed_on || "", r.next_due || ""]) },
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Trackers</h1>
          <p className="text-sm text-slate-500">Baladiya license, policy renewals, culture submissions, and vendor agreements.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button onClick={exportPdf} className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {overdueCount > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {overdueCount} item{overdueCount > 1 ? "s" : ""} expired across the trackers
        </div>
      )}

      {message && <p className={`rounded-lg px-3 py-2 text-sm ${message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message.text}</p>}

      <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-md px-3 py-1 font-medium ${tab === t.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "license" && (
        <div className="flex flex-col gap-4">
          <div>
            <button
              onClick={() => setShowLicenseForm((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Employee
            </button>
          </div>
          {showLicenseForm && (
            <form onSubmit={addLicense} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-5 sm:items-center">
              <input className="input" placeholder="Name" value={licenseForm.name} onChange={(e) => setLicenseForm({ ...licenseForm, name: e.target.value })} required />
              <input className="input" placeholder="Employee #" value={licenseForm.employee_no} onChange={(e) => setLicenseForm({ ...licenseForm, employee_no: e.target.value })} />
              <input className="input" placeholder="File #" value={licenseForm.file_no} onChange={(e) => setLicenseForm({ ...licenseForm, file_no: e.target.value })} />
              <select className="input" value={licenseForm.department} onChange={(e) => setLicenseForm({ ...licenseForm, department: e.target.value })}>
                <option value="">Department</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                Save
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Emp ID</th>
                  <th className="px-3 py-2 font-medium">File No</th>
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium">Issue Date</th>
                  <th className="px-3 py-2 font-medium">Expiry Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Attachment</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((r) => {
                  const badge = dueBadge(r.expiry_date);
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <input className="input-cell" value={r.name} onChange={(e) => updateLicenseField(r.id, { name: e.target.value })} onBlur={() => saveLicense(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input className="input-cell w-20" value={r.employee_no} onChange={(e) => updateLicenseField(r.id, { employee_no: e.target.value })} onBlur={() => saveLicense(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input className="input-cell w-20" value={r.file_no} onChange={(e) => updateLicenseField(r.id, { file_no: e.target.value })} onBlur={() => saveLicense(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <select className="input-cell" value={r.department} onChange={(e) => updateLicenseField(r.id, { department: e.target.value })} onBlur={() => saveLicense(r)}>
                          <option value="">—</option>
                          {departments.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.issue_date || ""} onChange={(e) => onLicenseIssueDateChange(r, e.target.value)} onBlur={() => saveLicense(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.expiry_date || ""} onChange={(e) => updateLicenseField(r.id, { expiry_date: e.target.value })} onBlur={() => saveLicense(r)} />
                      </td>
                      <td className="px-3 py-1.5">{badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>}</td>
                      <td className="px-3 py-1.5">
                        <AttachmentSlot path={r.attachment_path} name={r.attachment_name} onUpload={(f) => uploadLicenseAttachment(r, f)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeLicense(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && licenses.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No employees in the license tracker yet.</p>}
          </div>
        </div>
      )}

      {tab === "policy" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">Expiry date auto-fills to 3 years after the issue date when you set/change it — you can still edit it manually anytime.</p>
          <div>
            <button
              onClick={() => setShowPolicyForm((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Policy
            </button>
          </div>
          {showPolicyForm && (
            <form onSubmit={addPolicy} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-3 sm:items-center">
              <input className="input" placeholder="Policy Name" value={policyForm.policy_name} onChange={(e) => setPolicyForm({ ...policyForm, policy_name: e.target.value })} required />
              <input className="input" placeholder="Policy No" value={policyForm.policy_no} onChange={(e) => setPolicyForm({ ...policyForm, policy_no: e.target.value })} />
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                Save
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Policy Name</th>
                  <th className="px-3 py-2 font-medium">Policy No</th>
                  <th className="px-3 py-2 font-medium">Issue Date</th>
                  <th className="px-3 py-2 font-medium">Revision Date</th>
                  <th className="px-3 py-2 font-medium">Expiry Date</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Renewed</th>
                  <th className="px-3 py-2 font-medium">Attachment</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {policies.map((r) => {
                  const badge = dueBadge(r.expiry_date);
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <input className="input-cell" value={r.policy_name} onChange={(e) => updatePolicyField(r.id, { policy_name: e.target.value })} onBlur={() => savePolicy(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input className="input-cell w-24" value={r.policy_no} onChange={(e) => updatePolicyField(r.id, { policy_no: e.target.value })} onBlur={() => savePolicy(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.issue_date || ""} onChange={(e) => onPolicyIssueDateChange(r, e.target.value)} onBlur={() => savePolicy(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.revision_date || ""} onChange={(e) => updatePolicyField(r.id, { revision_date: e.target.value })} onBlur={() => savePolicy(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.expiry_date || ""} onChange={(e) => updatePolicyField(r.id, { expiry_date: e.target.value })} onBlur={() => savePolicy(r)} />
                      </td>
                      <td className="px-3 py-1.5">{badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>}</td>
                      <td className="px-3 py-1.5 text-center">
                        <input type="checkbox" checked={!!r.renewed} onChange={() => togglePolicyRenewed(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <AttachmentSlot path={r.attachment_path} name={r.attachment_name} onUpload={(f) => uploadPolicyAttachment(r, f)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removePolicy(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && policies.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No policies tracked yet.</p>}
          </div>
        </div>
      )}

      {tab === "culture" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">
            Manage the list of items (e.g. "Dental 1", "Hospital 6 Month CS") from Settings → "Culture Tracker Items".
          </p>
          <div>
            <button
              onClick={() => setShowCultureForm((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Entry
            </button>
          </div>
          {showCultureForm && (
            <form onSubmit={addCulture} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-3 sm:items-center">
              <select className="input" value={cultureForm.item} onChange={(e) => setCultureForm({ ...cultureForm, item: e.target.value })} required>
                <option value="">Select item</option>
                {cultureItems.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                Save
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Sent On</th>
                  <th className="px-3 py-2 font-medium">Next Due</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Attachment</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cultures.map((r) => {
                  const badge = dueBadge(r.next_due);
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <select className="input-cell" value={r.item} onChange={(e) => updateCultureField(r.id, { item: e.target.value })} onBlur={() => saveCulture(r)}>
                          {cultureItems.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.sent_on || ""} onChange={(e) => updateCultureField(r.id, { sent_on: e.target.value })} onBlur={() => saveCulture(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.next_due || ""} onChange={(e) => updateCultureField(r.id, { next_due: e.target.value })} onBlur={() => saveCulture(r)} />
                      </td>
                      <td className="px-3 py-1.5">{badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>}</td>
                      <td className="px-3 py-1.5">
                        <AttachmentSlot path={r.attachment_path} name={r.attachment_name} onUpload={(f) => uploadCultureAttachment(r, f)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeCulture(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && cultures.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No culture entries yet.</p>}
          </div>
        </div>
      )}

      {tab === "agreement" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">Manage the list of vendors/entities from Settings → "Agreement Tracker Entities".</p>
          <div>
            <button
              onClick={() => setShowAgreementForm((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Entry
            </button>
          </div>
          {showAgreementForm && (
            <form onSubmit={addAgreement} className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 sm:grid-cols-3 sm:items-center">
              <select className="input" value={agreementForm.entity} onChange={(e) => setAgreementForm({ ...agreementForm, entity: e.target.value })} required>
                <option value="">Select entity</option>
                {agreementEntities.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
                <Plus className="h-4 w-4" />
                Save
              </button>
            </form>
          )}
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Renewed On</th>
                  <th className="px-3 py-2 font-medium">Next Due</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Attachment</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((r) => {
                  const badge = dueBadge(r.next_due);
                  return (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <select className="input-cell" value={r.entity} onChange={(e) => updateAgreementField(r.id, { entity: e.target.value })} onBlur={() => saveAgreement(r)}>
                          {agreementEntities.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.renewed_on || ""} onChange={(e) => updateAgreementField(r.id, { renewed_on: e.target.value })} onBlur={() => saveAgreement(r)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="date" className="input-cell w-32" value={r.next_due || ""} onChange={(e) => updateAgreementField(r.id, { next_due: e.target.value })} onBlur={() => saveAgreement(r)} />
                      </td>
                      <td className="px-3 py-1.5">{badge && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>}</td>
                      <td className="px-3 py-1.5">
                        <AttachmentSlot path={r.attachment_path} name={r.attachment_name} onUpload={(f) => uploadAgreementAttachment(r, f)} />
                      </td>
                      <td className="px-3 py-1.5">
                        <button onClick={() => removeAgreement(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && agreements.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No agreements tracked yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentSlot({ path, name, onUpload }) {
  return path ? (
    <a href={attachmentUrl(path)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
      <Paperclip className="h-3.5 w-3.5" />
      {name || "View"}
    </a>
  ) : (
    <label className="flex cursor-pointer items-center gap-1 text-xs font-medium text-red-600 hover:underline">
      <Upload className="h-3.5 w-3.5" />
      Upload
      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
    </label>
  );
}
