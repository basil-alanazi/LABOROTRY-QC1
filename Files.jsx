import React, { useState, useEffect } from "react";
import { Upload, Download, Trash2, File as FileIcon } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { width: "100%", border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

export default function Files({ role, username }) {
  const [files, setFiles] = useState(null);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function loadFiles() {
    const { data } = await supabase.from("files_library").select("*").eq("deleted", false).order("created_at", { ascending: false });
    setFiles(data || []);
  }

  useEffect(() => { loadFiles(); }, []);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("attachments").upload(path, file);
      if (upErr) throw upErr;
      await supabase.from("files_library").insert({ filename: file.name, storage_path: path, description, uploaded_by: username });
      setDescription("");
      loadFiles();
    } catch (err) {
      setError("Upload failed. Check your Supabase Storage setup.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function fileUrl(path) {
    const { data } = supabase.storage.from("attachments").getPublicUrl(path);
    return data.publicUrl;
  }

  async function deleteFile(f) {
    if (role !== "admin" && role !== "super") return;
    if (!confirm("Remove this file?")) return;
    await supabase.storage.from("attachments").remove([f.storage_path]);
    await supabase.from("files_library").update({ deleted: true }).eq("id", f.id);
    loadFiles();
  }

  if (files === null) return <div style={{ padding: 40, textAlign: "center", color: "#8A9694" }}>Loading…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Files</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Upload and keep any file — certificates, scanned sheets, photos, whatever you need on hand.</div>

      <div style={{ background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, padding: 14, marginBottom: 24 }}>
        <input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Upload size={14} /> {uploading ? "Uploading…" : "Choose file to upload"}
          <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
        </label>
        {error && <div style={{ color: "#C1432B", fontSize: 12.5, marginTop: 8 }}>{error}</div>}
      </div>

      {files.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#8A9694" }}>No files uploaded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 8, padding: "10px 14px" }}>
              <FileIcon size={16} color="#8A9694" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.filename}</div>
                <div style={{ fontSize: 11.5, color: "#8A9694" }}>{f.description ? `${f.description} · ` : ""}by {f.uploaded_by} · {new Date(f.created_at).toLocaleDateString()}</div>
              </div>
              <a href={fileUrl(f.storage_path)} target="_blank" rel="noreferrer" style={{ background: "none", border: "1px solid #C7D1CE", color: "#516361", borderRadius: 6, padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}><Download size={13} /> Open</a>
              {(role === "admin" || role === "super") && <button onClick={() => deleteFile(f)} style={{ background: "none", border: "none", color: "#C1432B" }}><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
