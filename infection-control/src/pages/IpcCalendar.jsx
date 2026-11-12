import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, Lock, Paperclip, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";

const IPC_CALENDAR_BUCKET = "ipc-calendar-attachments";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(IPC_CALENDAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export default function IpcCalendar() {
  const { session, isAdmin } = useAuth();
  const { t } = useLanguage();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState(today);
  const [label, setLabel] = useState("");
  const [needsFile, setNeedsFile] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  async function loadAll() {
    setLoading(true);
    const { data } = await supabase
      .from("ipc_calendar_tasks")
      .select("*")
      .order("created_at", { ascending: true });
    setTasks(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // The calendar is IC/Owner-only by default — a non-admin account (Ward
  // Staff, a doctor account, etc.) only sees tasks explicitly marked
  // public. Personal tasks only show to the account that created them —
  // everyone else, including admins, never sees another person's private
  // reminders.
  const visibleTasks = useMemo(
    () => tasks.filter((t) => (isAdmin || t.is_public) && (!t.is_private || t.created_by === session?.username)),
    [tasks, session?.username, isAdmin]
  );

  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of visibleTasks) {
      (map[t.task_date] ??= []).push(t);
    }
    return map;
  }, [visibleTasks]);

  const selectedKey = dateKey(selected);
  const selectedTasks = tasksByDate[selectedKey] ?? [];

  function gotoPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }
  function gotoNextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  function selectDay(d) {
    setSelected(d);
    if (d.getMonth() !== viewMonth || d.getFullYear() !== viewYear) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const gridStart = new Date(viewYear, viewMonth, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewYear, viewMonth]);

  async function addTask(e) {
    e.preventDefault();
    const text = label.trim();
    if (!text) return;
    const { error } = await supabase.from("ipc_calendar_tasks").insert({
      task_date: selectedKey,
      label: text,
      needs_file: needsFile,
      is_private: isPrivate,
      is_public: isAdmin ? isPublic : false,
      created_by: session?.username,
    });
    if (!error) {
      setLabel("");
      setNeedsFile(false);
      setIsPrivate(false);
      setIsPublic(false);
      loadAll();
    }
  }

  async function toggleDone(t) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await supabase.from("ipc_calendar_tasks").update({ done: !t.done }).eq("id", t.id);
  }

  async function removeTask(t) {
    if (!confirm(`Delete "${t.label}"?`)) return;
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("ipc_calendar_tasks").delete().eq("id", t.id);
  }

  async function attachFiles(t, files) {
    let uploaded;
    try {
      uploaded = await Promise.all(
        files.map(async (file) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${t.id}/${Date.now()}-${safeName}`;
          const { error } = await supabase.storage.from(IPC_CALENDAR_BUCKET).upload(path, file);
          if (error) throw error;
          return { path, name: file.name };
        })
      );
    } catch (err) {
      alert("Could not upload: " + err.message);
      return;
    }
    const patch = { attachments: [...(t.attachments ?? []), ...uploaded] };
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    await supabase.from("ipc_calendar_tasks").update(patch).eq("id", t.id);
  }

  function formatSelectedLabel(d) {
    return d.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("IPC Calendar")}</h1>
        <p className="text-sm text-slate-500">
          {t('Visible to Infection Control & Owner only, unless marked Public. Mark anything personal as "just for me".')}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-[1.4] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={gotoPrevMonth} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-slate-800">
              {t(MONTH_NAMES[viewMonth])} {viewYear}
            </span>
            <button onClick={gotoNextMonth} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1.5">{t(w)}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((d, i) => {
              const key = dateKey(d);
              const dayTasks = tasksByDate[key] ?? [];
              const isToday = key === dateKey(today);
              const isSelected = key === selectedKey;
              const isOtherMonth = d.getMonth() !== viewMonth;
              const hasFileNeeded = dayTasks.some((t) => t.needs_file && (t.attachments ?? []).length === 0);
              return (
                <button
                  key={i}
                  onClick={() => selectDay(d)}
                  className={`flex aspect-square flex-col items-center rounded-lg border pt-1 text-xs ${
                    isSelected
                      ? "border-teal-600 bg-teal-600 text-white"
                      : isToday
                      ? "border-teal-500 text-teal-700 hover:bg-teal-50"
                      : "border-transparent text-slate-700 hover:bg-teal-50"
                  }`}
                >
                  <span className={`font-semibold ${isOtherMonth && !isSelected ? "text-slate-300" : ""}`}>{d.getDate()}</span>
                  {dayTasks.length > 0 && (
                    <span className="mt-1 flex gap-0.5">
                      {dayTasks.slice(0, 4).map((t) => (
                        <span
                          key={t.id}
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? "bg-white" : t.needs_file && (t.attachments ?? []).length === 0 ? "bg-amber-500" : "bg-teal-500"
                          }`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> {t("Has task")}</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {t("Needs file")}</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{formatSelectedLabel(selected)}</h2>
            {selectedKey === dateKey(today) && <p className="text-xs text-slate-400">{t("Today")}</p>}
          </div>

          <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
            {loading && <p className="p-4 text-center text-sm text-slate-400">{t("Loading...")}</p>}
            {!loading && selectedTasks.length === 0 && (
              <p className="rounded-lg p-6 text-center text-sm text-slate-400">{t("No tasks for this day yet — add one below.")}</p>
            )}
            {selectedTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
                <input type="checkbox" checked={!!task.done} onChange={() => toggleDone(task)} className="mt-0.5 accent-teal-600" />
                <div className="min-w-0 flex-1">
                  <p className={task.done ? "break-words text-slate-400 line-through" : "break-words text-slate-700"}>{task.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {task.is_private && (
                      <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        <Lock className="h-2.5 w-2.5" />
                        {t("Just for me")}
                      </span>
                    )}
                    {task.is_public && (
                      <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
                        <Globe className="h-2.5 w-2.5" />
                        {t("Public")}
                      </span>
                    )}
                    {task.needs_file && (
                      <>
                        {(task.attachments ?? []).length === 0 && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            {t("📎 Needs file")}
                          </span>
                        )}
                        {(task.attachments ?? []).map((a, i) => (
                          <a
                            key={i}
                            href={attachmentUrl(a.path)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 hover:underline"
                          >
                            <Paperclip className="h-2.5 w-2.5" />
                            {a.name}
                          </a>
                        ))}
                        <label className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:border-teal-500 hover:text-teal-700">
                          <Upload className="h-2.5 w-2.5" />
                          {t("Attach")}
                          <input
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              if (files.length > 0) attachFiles(task, files);
                            }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => removeTask(task)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={addTask} className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <input
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("Add a new task for this day...")}
              maxLength={200}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={needsFile} onChange={(e) => setNeedsFile(e.target.checked)} className="accent-amber-600" />
                {t("📎 Needs file upload")}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-slate-600" />
                <Lock className="h-3 w-3" />
                {t("Just for me")}
              </label>
              {isAdmin && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-teal-600" />
                  <Globe className="h-3 w-3" />
                  {t("Public (everyone can see)")}
                </label>
              )}
              <button type="submit" className="ml-auto rounded-lg bg-teal-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-teal-700">
                {t("+ Add")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
