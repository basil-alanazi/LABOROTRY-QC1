import React, { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { supabase } from "./supabaseClient";

export default function NotificationBell({ username, pendingCount, onNavigate, dark }) {
  const [open, setOpen] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  async function loadUnread() {
    const { data } = await supabase.from("chat_messages").select("from_username").eq("to_username", username).eq("is_read", false);
    setUnreadChat((data || []).length);
  }
  useEffect(() => {
    loadUnread();
    const interval = setInterval(loadUnread, 15000);
    return () => clearInterval(interval);
  }, [username]);

  const total = (pendingCount || 0) + unreadChat;

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ background: "none", border: "none", color: dark ? "#F0F3F2" : "#8FA39E", position: "relative" }}>
        <Bell size={20} />
        {total > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, background: "#C1432B", color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, background: "#fff", border: "1px solid #E1E8E5", borderRadius: 10, width: 240, boxShadow: "0 8px 24px rgba(15,25,26,0.15)", zIndex: 61, overflow: "hidden" }}>
            {total === 0 ? (
              <div style={{ padding: 16, fontSize: 12.5, color: "#8A9694", textAlign: "center" }}>You're all caught up.</div>
            ) : (
              <>
                {pendingCount > 0 && (
                  <button onClick={() => { onNavigate("qc"); setOpen(false); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", borderBottom: "1px solid #EEF2F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1B2B2E" }}>QC Approvals pending</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#FBF3DF", color: "#B8860B", padding: "2px 8px", borderRadius: 10 }}>{pendingCount}</span>
                  </button>
                )}
                {unreadChat > 0 && (
                  <button onClick={() => { onNavigate("chat"); setOpen(false); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1B2B2E" }}>Unread messages</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: "#E7F0FB", color: "#3E6ACF", padding: "2px 8px", borderRadius: 10 }}>{unreadChat}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
