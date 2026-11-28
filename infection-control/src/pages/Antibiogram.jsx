import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { fetchAllRows } from "../lib/fetchAll";
import LabReportImport from "./antibiogram/LabReportImport";
import AntibiogramReport from "./antibiogram/AntibiogramReport";

// The antibiogram module (public/antibiogram/: table, filters, isolate
// entry, CLSI M39 rules, print/export) runs in an iframe. Its isolates live
// in the antibiogram_isolates table so every IC account sees the same data:
// the page sends them in on load and saves whatever the module changes.
export default function Antibiogram() {
  const { session } = useAuth();
  const { t, lang } = useLanguage();
  const frameRef = useRef(null);
  const savedRef = useRef(new Map()); // id -> JSON string as last saved
  const readyRef = useRef(false);
  const queueRef = useRef(Promise.resolve());
  const [status, setStatus] = useState({ type: "", text: "" });
  const [view, setView] = useState("module"); // "module" | "report"

  async function loadIsolates() {
    const { data, error } = await fetchAllRows((from, to) => supabase.from("antibiogram_isolates").select("*").order("collected_at").range(from, to));
    if (error) {
      setStatus({ type: "error", text: "Could not load isolates: " + error.message });
      return [];
    }
    const list = (data ?? []).map((r) => ({ ...(r.data || {}), id: r.id }));
    savedRef.current = new Map(list.map((x) => [x.id, JSON.stringify(x)]));
    return list;
  }

  async function sendToFrame() {
    const list = await loadIsolates();
    readyRef.current = true;
    frameRef.current?.contentWindow?.postMessage({ type: "antibiogram:set", isolates: list }, window.location.origin);
  }

  // Save only what changed: new/edited isolates are upserted, removed ones deleted.
  function persist(isolates) {
    queueRef.current = queueRef.current.then(async () => {
      const now = new Map(isolates.map((x) => [String(x.id), x]));
      const upserts = [];
      for (const [id, x] of now) {
        const json = JSON.stringify({ ...x, id });
        if (savedRef.current.get(id) !== json) upserts.push({ id, x, json });
      }
      const removed = [...savedRef.current.keys()].filter((id) => !now.has(id));
      if (!upserts.length && !removed.length) return;
      setStatus({ type: "", text: t("Saving...") });
      try {
        for (const { id, x, json } of upserts) {
          const { error } = await supabase.from("antibiogram_isolates").upsert(
            {
              id,
              data: x,
              collected_at: x.collectedAt || null,
              organism: x.organism || "",
              updated_by: session?.username,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          );
          if (error) throw error;
          savedRef.current.set(id, json);
        }
        if (removed.length) {
          const { error } = await supabase.from("antibiogram_isolates").delete().in("id", removed);
          if (error) throw error;
          removed.forEach((id) => savedRef.current.delete(id));
        }
        setStatus({ type: "ok", text: t("Saved") });
      } catch (err) {
        setStatus({ type: "error", text: "Could not save: " + err.message });
      }
    });
  }

  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      if (e.data?.type === "antibiogram:changed" && readyRef.current && Array.isArray(e.data.isolates)) persist(e.data.isolates);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-800">{t("Antibiogram")}</h1>
          <p className="text-sm text-slate-500">{t("Cumulative antibiogram (CLSI M39) from the hospital's culture isolates.")}</p>
        </div>
        <div className="flex items-center gap-3">
          {status.text && (
            <span className={`text-xs ${status.type === "error" ? "text-red-600" : status.type === "ok" ? "text-emerald-700" : "text-slate-400"}`}>{status.text}</span>
          )}
          <LabReportImport frameRef={frameRef} />
        </div>
      </div>
      <div className="tab-bar flex w-fit rounded-lg border border-slate-200 p-0.5 text-sm">
        {[
          { key: "module", label: "Antibiogram" },
          { key: "report", label: "Report" },
        ].map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} className={`rounded-md px-4 py-1.5 font-medium ${view === v.key ? "bg-teal-600 text-white" : "text-slate-500"}`}>
            {t(v.label)}
          </button>
        ))}
      </div>
      {view === "report" && <AntibiogramReport frameRef={frameRef} />}
      <iframe
        key={lang}
        ref={frameRef}
        src={`/antibiogram/index.html?lang=${lang}`}
        title="Antibiogram"
        onLoad={sendToFrame}
        className={`h-[calc(100vh-11rem)] min-h-[600px] w-full rounded-2xl border border-slate-200 bg-white ${view === "report" ? "hidden" : ""}`}
      />
    </div>
  );
}
