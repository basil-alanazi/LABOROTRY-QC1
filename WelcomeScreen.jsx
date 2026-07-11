import React, { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

export default function WelcomeScreen({ name, onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1400);
    const doneTimer = setTimeout(onDone, 1800);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onDone]);

  return (
    <div
      onClick={onDone}
      style={{
        position: "fixed", inset: 0, zIndex: 200, background: "#0F7173",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif",
        opacity: fading ? 0 : 1, transition: "opacity 0.4s ease",
        cursor: "pointer",
      }}
    >
      <FlaskConical size={40} style={{ marginBottom: 18, opacity: 0.9 }} />
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Welcome, {name} 👋</div>
      <div style={{ fontSize: 14, opacity: 0.85, letterSpacing: 0.3 }}>Rabia Hospital Lab Family</div>
    </div>
  );
}
