import React, { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { supabase } from "./supabaseClient";

const inputStyle = { border: "1px solid #C7D1CE", borderRadius: 7, padding: "9px 11px", fontSize: 14, boxSizing: "border-box" };

export default function InternalChat({ username, config, staffAccounts, portalAccounts }) {
  const [contact, setContact] = useState("");
  const [messages, setMessages] = useState([]);
  const [body, setBody] = useState("");
  const [unreadByContact, setUnreadByContact] = useState({});
  const bottomRef = useRef(null);

  const contacts = [
    config.admin_username, config.admin2_username, config.super_username, config.lab_username,
    ...(staffAccounts || []).map((s) => s.username),
    ...(portalAccounts || []).map((s) => s.username),
  ].filter((c, i, arr) => c && c !== username && arr.indexOf(c) === i);

  async function loadUnread() {
    const { data } = await supabase.from("chat_messages").select("from_username").eq("to_username", username).eq("is_read", false);
    const counts = {};
    (data || []).forEach((m) => { counts[m.from_username] = (counts[m.from_username] || 0) + 1; });
    setUnreadByContact(counts);
  }

  async function loadThread(withUser) {
    const { data } = await supabase
      .from("chat_messages").select("*")
      .or(`and(from_username.eq.${username},to_username.eq.${withUser}),and(from_username.eq.${withUser},to_username.eq.${username})`)
      .order("created_at", { ascending: true });
    setMessages(data || []);
    await supabase.from("chat_messages").update({ is_read: true }).eq("to_username", username).eq("from_username", withUser).eq("is_read", false);
    loadUnread();
  }

  useEffect(() => { loadUnread(); const t = setInterval(() => { loadUnread(); if (contact) loadThread(contact); }, 15000); return () => clearInterval(t); }, [contact]);
  useEffect(() => { if (contact) loadThread(contact); }, [contact]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!body.trim() || !contact) return;
    await supabase.from("chat_messages").insert({ from_username: username, to_username: contact, body: body.trim() });
    setBody("");
    loadThread(contact);
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Chat</h2>
      <div style={{ fontSize: 13, color: "#7B8E8A", marginBottom: 20 }}>Message anyone with a login on this system.</div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ width: 180, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, overflow: "hidden" }}>
          {contacts.map((c) => (
            <button key={c} onClick={() => setContact(c)} style={{ width: "100%", textAlign: "left", background: contact === c ? "#F0F3F2" : "none", border: "none", padding: "10px 12px", fontSize: 13, borderBottom: "1px solid #EEF2F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {c}
              {unreadByContact[c] > 0 && <span style={{ background: "#C1432B", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>{unreadByContact[c]}</span>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 260, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, display: "flex", flexDirection: "column", height: 420 }}>
          {!contact ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A9694", fontSize: 13 }}>Pick someone to message.</div>
          ) : (
            <>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #EEF2F0", fontWeight: 700, fontSize: 13.5 }}>{contact}</div>
              <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.from_username === username ? "flex-end" : "flex-start", maxWidth: "75%" }}>
                    <div style={{ background: m.from_username === username ? "#0F7173" : "#F0F3F2", color: m.from_username === username ? "#fff" : "#1B2B2E", padding: "7px 11px", borderRadius: 10, fontSize: 13 }}>{m.body}</div>
                    <div style={{ fontSize: 9.5, color: "#8A9694", marginTop: 2, textAlign: m.from_username === username ? "right" : "left" }}>{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #EEF2F0" }}>
                <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Type a message…" style={{ ...inputStyle, flex: 1 }} />
                <button onClick={send} style={{ background: "#0F7173", color: "#fff", border: "none", borderRadius: 7, padding: "0 14px" }}><Send size={15} /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
