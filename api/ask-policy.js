// Answers free-form questions using whatever PDFs are uploaded under the
// "Policy" category in Knowledge Base. Gemini reads PDFs natively (no
// separate text-extraction step) — the files just get downloaded here
// (service role, bypasses RLS — this runs with no user session), uploaded
// to Gemini's File API (handles files far larger than the ~20MB inline
// request limit — up to 2GB), then referenced in the question.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";

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
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: docs } = await supabase
    .from("knowledge_base")
    .select("title, content")
    .eq("category", "Policy")
    .eq("content_type", "file");

  if (!docs || docs.length === 0) {
    return res.status(200).json({ answer: "No policy documents are uploaded yet — add one under Knowledge Base → Policy first." });
  }

  const fileParts = [];
  const failures = [];
  for (const doc of docs) {
    try {
      const { data: blob, error } = await supabase.storage.from("attachments").download(doc.content);
      if (error || !blob) throw new Error(error?.message || "no data returned");
      const buf = Buffer.from(await blob.arrayBuffer());
      const file = await uploadToGeminiFiles(buf, doc.title || doc.content, apiKey);
      fileParts.push({ file_data: { mime_type: "application/pdf", file_uri: file.uri } });
    } catch (err) {
      failures.push(`${doc.title || doc.content}: ${err.message}`);
    }
  }

  if (fileParts.length === 0) {
    return res.status(200).json({ answer: `Couldn't load the policy documents: ${failures.join("; ") || "unknown reason"}` });
  }

  const prompt = `You are answering a question for hospital lab staff, based ONLY on the attached policy document(s). If the answer isn't in the documents, say so clearly instead of guessing. Keep the answer concise and practical.\n\nQuestion: ${question}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...fileParts] }] }),
    }
  );

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    return res.status(502).json({ error: `Gemini request failed: ${detail}` });
  }
  const data = await geminiRes.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "Couldn't get an answer — try rephrasing the question.";
  res.status(200).json({ answer });
}
