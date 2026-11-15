import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bold, FileText, Italic, List, ListOrdered, Plus, Printer, Table2, Trash2, Underline, Undo2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";

export default function Notes() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef(null);

  async function loadNotes() {
    setLoading(true);
    const { data } = await supabase.from("notes").select("*").eq("deleted", false).order("updated_at", { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadNotes();
  }, []);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) || null, [notes, activeId]);

  // Only reset the editor's DOM content when switching notes — never on
  // every keystroke-triggered state update, or the cursor position and
  // in-progress typing would get wiped out from under the user.
  useEffect(() => {
    if (!activeNote) {
      setTitle("");
      if (editorRef.current) editorRef.current.innerHTML = "";
      return;
    }
    setTitle(activeNote.title || "");
    if (editorRef.current) editorRef.current.innerHTML = activeNote.content || "";
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function createNote() {
    const { data, error } = await supabase
      .from("notes")
      .insert({ title: t("Untitled Note"), content: "", created_by: session?.username })
      .select()
      .single();
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    setNotes((prev) => [row, ...prev]);
    setActiveId(row.id);
  }

  async function saveActive(patch) {
    if (!activeNote) return;
    setSaving(true);
    const updated_at = new Date().toISOString();
    const payload = { ...patch, updated_at };
    await supabase.from("notes").update(payload).eq("id", activeNote.id);
    setNotes((prev) => prev.map((n) => (n.id === activeNote.id ? { ...n, ...payload } : n)).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
    setSaving(false);
  }

  function scheduleSave() {
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current && editorRef.current) {
        saveActive({ content: editorRef.current.innerHTML, title });
        dirtyRef.current = false;
      }
    }, 800);
  }

  function handleTitleChange(e) {
    setTitle(e.target.value);
    scheduleSave();
  }

  async function removeNote(note) {
    if (!window.confirm(t("Delete this note?"))) return;
    await supabase.from("notes").update({ deleted: true, deleted_by: session?.username, deleted_at: new Date().toISOString() }).eq("id", note.id);
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    if (activeId === note.id) setActiveId(null);
  }

  function exec(command) {
    editorRef.current?.focus();
    document.execCommand(command, false, null);
    scheduleSave();
  }

  function insertTable() {
    const rowsStr = window.prompt(t("Number of rows"), "3");
    if (!rowsStr) return;
    const colsStr = window.prompt(t("Number of columns"), "3");
    if (!colsStr) return;
    const rows = Math.max(1, parseInt(rowsStr, 10) || 1);
    const cols = Math.max(1, parseInt(colsStr, 10) || 1);
    let html = '<table style="border-collapse:collapse;width:100%;margin:8px 0;">';
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid #cbd5e1;padding:6px 8px;min-width:60px;">&nbsp;</td>';
      }
      html += "</tr>";
    }
    html += "</table><p><br></p>";
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <h1 className="text-xl font-bold text-slate-800">{t("Notes")}</h1>
        <p className="text-sm text-slate-500">{t("Write notes, add tables, and print them like a document.")}</p>
      </div>

      <div className="flex h-[75vh] min-h-[480px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:h-auto print:overflow-visible print:border-0 print:shadow-none">
        <div className={`w-full flex-col border-r border-slate-200 sm:flex sm:w-64 sm:shrink-0 print:hidden ${activeId ? "hidden sm:flex" : "flex"}`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-700">{t("Notes")}</span>
            <button onClick={createNote} className="flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700">
              <Plus className="h-3.5 w-3.5" />
              {t("New")}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {notes.length === 0 && !loading && <p className="p-4 text-center text-sm text-slate-400">{t('No notes yet — tap "New" to start.')}</p>}
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() => setActiveId(n.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${activeId === n.id ? "bg-teal-50" : ""}`}
              >
                <span className="truncate text-sm font-medium text-slate-800">{n.title || t("Untitled Note")}</span>
                <span className="text-xs text-slate-400">{new Date(n.updated_at || n.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex-1 flex-col ${activeId ? "flex" : "hidden sm:flex"}`}>
          {!activeNote ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-300 print:hidden">
              <FileText className="h-10 w-10" />
              <p className="text-sm text-slate-400">{t("Select a note or create a new one.")}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 py-2 print:hidden">
                <button type="button" onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 sm:hidden">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <ToolbarButton onClick={() => exec("bold")} title={t("Bold")}>
                  <Bold className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => exec("italic")} title={t("Italic")}>
                  <Italic className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => exec("underline")} title={t("Underline")}>
                  <Underline className="h-4 w-4" />
                </ToolbarButton>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <ToolbarButton onClick={() => exec("insertUnorderedList")} title={t("Bullet list")}>
                  <List className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => exec("insertOrderedList")} title={t("Numbered list")}>
                  <ListOrdered className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={insertTable} title={t("Insert table")}>
                  <Table2 className="h-4 w-4" />
                </ToolbarButton>
                <div className="mx-1 h-5 w-px bg-slate-200" />
                <ToolbarButton onClick={() => exec("undo")} title={t("Undo")}>
                  <Undo2 className="h-4 w-4" />
                </ToolbarButton>
                <div className="flex-1" />
                <span className="text-[11px] text-slate-400">{saving ? t("Saving...") : t("Saved")}</span>
                <button onClick={() => removeNote(activeNote)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title={t("Delete")}>
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5" />
                  {t("Print")}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4 print:overflow-visible" id="note-print-area">
                <input
                  className="mb-3 w-full border-none text-xl font-bold text-slate-800 outline-none print:text-2xl"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder={t("Untitled Note")}
                />
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={scheduleSave}
                  className="note-editor min-h-[50vh] text-sm leading-relaxed text-slate-800 outline-none"
                  dir="auto"
                />
              </div>
            </>
          )}
        </div>
      </div>
      {loading && <p className="text-center text-xs text-slate-400">{t("Loading...")}</p>}

      <style>{`
        .note-editor p { margin: 0 0 8px; }
        .note-editor ul { list-style: disc; padding-inline-start: 24px; margin: 0 0 8px; }
        .note-editor ol { list-style: decimal; padding-inline-start: 24px; margin: 0 0 8px; }
        .note-editor td { vertical-align: top; }
        @media print {
          body * { visibility: hidden; }
          #note-print-area, #note-print-area * { visibility: visible; }
          #note-print-area { position: fixed; inset: 0; margin: 0; padding: 24px; }
        }
      `}</style>
    </div>
  );
}

function ToolbarButton({ onClick, title, children }) {
  return (
    <button type="button" onClick={onClick} title={title} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100">
      {children}
    </button>
  );
}
