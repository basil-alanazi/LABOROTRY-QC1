// Answers free-form questions using whatever PDFs are uploaded under the
// "Policy" category in Knowledge Base. Gemini reads PDFs natively (no
// separate text-extraction step) — the files just get downloaded here
// (service role, bypasses RLS — this runs with no user session) and sent
// straight to the model alongside the question.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_INLINE_BYTES = 15 * 1024 * 1024; // stay under Gemini's ~20MB inline request limit

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Missing question" });
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: "Missing Supabase env vars" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

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
  let totalBytes = 0;
  for (const doc of docs) {
    const { data: blob, error } = await supabase.storage.from("attachments").download(doc.content);
    if (error || !blob) continue;
    const buf = Buffer.from(await blob.arrayBuffer());
    if (totalBytes + buf.length > MAX_INLINE_BYTES) continue; // skip if it would blow the request size budget
    totalBytes += buf.length;
    fileParts.push({ inline_data: { mime_type: "application/pdf", data: buf.toString("base64") } });
  }

  if (fileParts.length === 0) {
    return res.status(200).json({ answer: "Couldn't load the policy documents — try again in a moment." });
  }

  const prompt = `You are answering a question for hospital lab staff, based ONLY on the attached policy document(s). If the answer isn't in the documents, say so clearly instead of guessing. Keep the answer concise and practical.\n\nQuestion: ${question}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
