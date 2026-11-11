import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, MessageSquare, Paperclip, Plus, Send, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth.jsx";
import { useLanguage } from "../lib/i18n.jsx";
import { fetchAllRows } from "../lib/fetchAll";

const MESSAGE_ATTACHMENTS_BUCKET = "message-attachments";
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"];

function isImageAttachment(name) {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function attachmentUrl(path) {
  if (!path) return null;
  return supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).getPublicUrl(path).data.publicUrl;
}

function messagePreview(m) {
  if (m.body) return m.body;
  const count = m.attachments?.length ?? 0;
  if (count === 0) return "";
  const allImages = m.attachments.every((a) => isImageAttachment(a.name));
  return count === 1 ? (allImages ? "📎 Photo" : `📎 ${m.attachments[0].name}`) : `📎 ${count} attachments`;
}

function timeLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function Messages() {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activeUsername, setActiveUsername] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftFiles, setDraftFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  async function loadUsers() {
    const { data } = await supabase.from("users").select("*").order("display_name");
    setUsers((data ?? []).filter((u) => u.username !== session.username));
  }

  async function loadMessages() {
    const [{ data: sent }, { data: received }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from("messages").select("*").eq("sender_username", session.username).range(from, to)),
      fetchAllRows((from, to) => supabase.from("messages").select("*").eq("recipient_username", session.username).range(from, to)),
    ]);
    const merged = [...(sent ?? []), ...(received ?? [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    setMessages(merged);
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadUsers(), loadMessages()]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live delivery — any insert/read-receipt on the messages table refreshes
  // this page's data (offline preview has no realtime backend to talk to).
  useEffect(() => {
    if (supabase.isMock) return;
    const channel = supabase
      .channel("messages-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => loadMessages())
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usersByUsername = useMemo(() => Object.fromEntries(users.map((u) => [u.username, u])), [users]);
  const activeRecipients = useMemo(() => users.filter((u) => u.active), [users]);

  const conversations = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const other = m.sender_username === session.username ? m.recipient_username : m.sender_username;
      let entry = map.get(other);
      if (!entry) {
        entry = { username: other, lastMessage: m, unread: 0 };
        map.set(other, entry);
      } else if (new Date(m.created_at) > new Date(entry.lastMessage.created_at)) {
        entry.lastMessage = m;
      }
      if (m.recipient_username === session.username && !m.read_at) entry.unread += 1;
    }
    return Array.from(map.values()).sort((a, b) => new Date(b.lastMessage.created_at) - new Date(a.lastMessage.created_at));
  }, [messages, session.username]);

  const threadMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          (m.sender_username === activeUsername && m.recipient_username === session.username) ||
          (m.sender_username === session.username && m.recipient_username === activeUsername)
      ),
    [messages, activeUsername, session.username]
  );

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threadMessages.length, activeUsername]);

  async function openConversation(username) {
    setActiveUsername(username);
    setShowNewMessage(false);
    const hasUnread = messages.some((m) => m.sender_username === username && m.recipient_username === session.username && !m.read_at);
    if (hasUnread) {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("sender_username", username)
        .eq("recipient_username", session.username)
        .is("read_at", null);
      loadMessages();
    }
  }

  async function uploadAttachment(file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${session.username}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(MESSAGE_ATTACHMENTS_BUCKET).upload(path, file);
    if (error) throw error;
    return { path, name: file.name };
  }

  async function sendMessage(e) {
    e.preventDefault();
    const body = draft.trim();
    if ((!body && draftFiles.length === 0) || !activeUsername) return;
    setSending(true);
    let attachments = [];
    try {
      attachments = await Promise.all(draftFiles.map(uploadAttachment));
    } catch (err) {
      alert("Could not upload attachment: " + err.message);
      setSending(false);
      return;
    }
    setDraft("");
    setDraftFiles([]);
    setSending(false);
    await supabase.from("messages").insert({ sender_username: session.username, recipient_username: activeUsername, body, attachments });
    loadMessages();
  }

  const activeUser = activeUsername ? usersByUsername[activeUsername] : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">{t("Messages")}</h1>
        <p className="text-sm text-slate-500">{t("Send a message to any staff account.")}</p>
      </div>

      <div className="flex h-[70vh] min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`w-full flex-col border-r border-slate-200 sm:flex sm:w-72 sm:shrink-0 ${activeUsername ? "hidden sm:flex" : "flex"}`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <span className="text-sm font-semibold text-slate-700">{t("Conversations")}</span>
            <button
              onClick={() => setShowNewMessage((v) => !v)}
              className="flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("New")}
            </button>
          </div>

          {showNewMessage && (
            <div className="max-h-56 overflow-y-auto border-b border-slate-100 bg-slate-50 p-2">
              {activeRecipients.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">{t("No other accounts yet.")}</p>}
              {activeRecipients.map((u) => (
                <button key={u.username} onClick={() => openConversation(u.username)} className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white">
                  <span className="font-medium text-slate-700">{u.display_name || u.username}</span>
                  <span className="text-xs text-slate-400">{u.department || u.role}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && !showNewMessage && <p className="p-4 text-center text-sm text-slate-400">{t('No messages yet — tap "New" to message someone.')}</p>}
            {conversations.map((c) => {
              const u = usersByUsername[c.username];
              const mine = c.lastMessage.sender_username === session.username;
              return (
                <button
                  key={c.username}
                  onClick={() => openConversation(c.username)}
                  className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-slate-50 ${activeUsername === c.username ? "bg-teal-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{u?.display_name || c.username}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{timeLabel(c.lastMessage.created_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {mine ? t("You: ") : ""}
                      {messagePreview(c.lastMessage)}
                    </span>
                    {c.unread > 0 && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">{c.unread}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`flex-1 flex-col ${activeUsername ? "flex" : "hidden sm:flex"}`}>
          {!activeUsername ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-slate-300">
              <MessageSquare className="h-10 w-10" />
              <p className="text-sm text-slate-400">{t("Select a conversation or start a new one.")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                <button onClick={() => setActiveUsername(null)} className="text-slate-400 hover:text-slate-600 sm:hidden">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{activeUser?.display_name || activeUsername}</p>
                  <p className="text-xs text-slate-400">{activeUser?.department || activeUser?.role || ""}</p>
                </div>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                {threadMessages.map((m) => {
                  const mine = m.sender_username === session.username;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-sm bg-teal-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-800"}`}>
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                        {(m.attachments ?? []).length > 0 && (
                          <div className={`flex flex-col gap-1.5 ${m.body ? "mt-2" : ""}`}>
                            {m.attachments.map((a, i) =>
                              isImageAttachment(a.name) ? (
                                <a key={i} href={attachmentUrl(a.path)} target="_blank" rel="noreferrer">
                                  <img src={attachmentUrl(a.path)} alt={a.name} className="max-h-48 max-w-full rounded-lg object-cover" />
                                </a>
                              ) : (
                                <a
                                  key={i}
                                  href={attachmentUrl(a.path)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium hover:underline ${
                                    mine ? "bg-teal-700" : "bg-white"
                                  }`}
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{a.name}</span>
                                </a>
                              )
                            )}
                          </div>
                        )}
                        <p className={`mt-1 text-[10px] ${mine ? "text-teal-100" : "text-slate-400"}`}>{timeLabel(m.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
                {threadMessages.length === 0 && <p className="pt-6 text-center text-sm text-slate-400">{t("No messages yet — say hello.")}</p>}
              </div>
              <form onSubmit={sendMessage} className="flex flex-col gap-2 border-t border-slate-100 p-3">
                {draftFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draftFiles.map((f, i) => (
                      <span key={i} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {f.name}
                        <button type="button" onClick={() => setDraftFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="flex shrink-0 cursor-pointer items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <Paperclip className="h-4 w-4" />
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => setDraftFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                    />
                  </label>
                  <input className="input flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Type a message...")} />
                  <button
                    type="submit"
                    disabled={sending || (!draft.trim() && draftFiles.length === 0)}
                    className="flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
      {loading && <p className="text-center text-xs text-slate-400">{t("Loading...")}</p>}
    </div>
  );
}
