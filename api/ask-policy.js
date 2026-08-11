// Backs the Assistant's general chat fallback (SmartAssistant.jsx) — used
// whenever a question doesn't match one of its live-data patterns (on
// duty, equipment faults, last QC). Chats normally like a personal
// assistant, but also has direct access to whatever PDFs are uploaded
// under Knowledge Base → Policy (Gemini reads PDFs natively, no
// text-extraction step) and is told to prefer those for anything
// policy-related. Keeps the conversation so far in context, so a
// follow-up question doesn't lose the thread.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Google retires model names over time — if this ever 404s again, check
// https://ai.google.dev/gemini-api/docs/models for the current Flash-tier
// model id and swap it in here.
const GEMINI_MODEL = "gemini-3.6-flash";

const SYSTEM_INSTRUCTION = `Your name is Najd AI. You are a friendly, helpful personal assistant/secretary for the staff of Rabia Hospital Lab. Chat naturally and concisely, like a real assistant would. If asked your name, say Najd AI.

If policy documents are attached and the question is about lab policy, procedures, or "how do we do X", answer from those documents specifically and say so. If the documents don't cover it, say that plainly rather than guessing. For everything else (general questions, casual conversation), just answer normally from your own knowledge — but make clear when something is general knowledge rather than this lab's specific policy, so nobody mistakes it for an official answer.`;

// Attaching the policy PDF(s) makes Gemini read the whole document on
// every call, which adds real latency even for plain small talk — so
// only do it when the question actually looks policy-related.
const POLICY_HINT = /(policy|policies|procedure|protocol|guideline|sop\b|بوليس|سياس|إجراء|اجراء|بروتوكول|لائحة|دليل|كيف نسوي|كيف نشتغل|كيف نتعامل)/i;
function looksPolicyRelated(question) {
  return POLICY_HINT.test(question);
}

async function uploadToGeminiFiles(buf, displayName, apiKey) {
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buf.length),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) throw new Error(`Upload start failed: ${await start.text()}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Upload start didn't return an upload URL");

  const finish = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buf.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buf,
  });
  if (!finish.ok) throw new Error(`Upload finalize failed: ${await finish.text()}`);
  const { file } = await finish.json();
  return file; // { uri, mimeType, name, ... }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { question, history } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const fileParts = [];
  const failures = [];
  if (looksPolicyRelated(question)) {
    const { data: docs } = await supabase
      .from("knowledge_base")
      .select("id, title, content")
      .eq("category", "Policy")
      .eq("content_type", "file");

    const CACHE_MAX_AGE_MS = 44 * 60 * 60 * 1000; // Gemini keeps files ~48h — refresh a bit before that
    for (const doc of docs || []) {
      try {
        const { data: cached } = await supabase.from("gemini_file_cache").select("*").eq("knowledge_base_id", doc.id).maybeSingle();
        if (cached && Date.now() - new Date(cached.uploaded_at).getTime() < CACHE_MAX_AGE_MS) {
          fileParts.push({ file_data: { mime_type: "application/pdf", file_uri: cached.file_uri } });
          continue;
        }
        const { data: blob, error } = await supabase.storage.from("attachments").download(doc.content);
        if (error || !blob) throw new Error(error?.message || "no data returned");
        const buf = Buffer.from(await blob.arrayBuffer());
        const file = await uploadToGeminiFiles(buf, doc.title || doc.content, apiKey);
        await supabase.from("gemini_file_cache").upsert({ knowledge_base_id: doc.id, file_uri: file.uri, uploaded_at: new Date().toISOString() });
        fileParts.push({ file_data: { mime_type: "application/pdf", file_uri: file.uri } });
      } catch (err) {
        failures.push(`${doc.title || doc.content}: ${err.message}`);
      }
    }
  }

  const priorTurns = (Array.isArray(history) ? history : [])
    .filter((h) => h?.text)
    .map((h) => ({ role: h.role === "user" ? "user" : "model", parts: [{ text: h.text }] }));

  const contents = [
    ...priorTurns,
    { role: "user", parts: [{ text: question }, ...fileParts] },
  ];

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }, contents }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return res.status(502).json({ error: `Gemini request failed: ${detail}` });
  }
  const data = await geminiRes.json();
  let answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "Couldn't get an answer — try rephrasing the question.";
  if (failures.length > 0) answer += `\n\n(Couldn't load: ${failures.join("; ")})`;
  res.status(200).json({ answer });
}
