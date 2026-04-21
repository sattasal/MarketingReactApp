import React, { useState } from "react";
import { PageType } from "../../lib/types";
import { verifyPin } from "../../lib/utils";

export const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#1e293b", background: "#f8fafc", transition: "all .15s ease", boxSizing: "border-box" };

export function NavBar({ current, onNavigate, unlocked, setUnlocked }: { current: PageType; onNavigate: (p: PageType) => void; unlocked: boolean; setUnlocked: (v: boolean) => void }) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  const [pinChecking, setPinChecking] = useState(false);

  const tabs: { key: PageType; label: string; icon: string }[] = [
    { key: "marketing",      label: "Costi Marketing",   icon: "📊" },
    { key: "collettive",     label: "Collettive",        icon: "🤝" },
    { key: "piani-extra",    label: "Piani Extra",       icon: "📌" },
    { key: "ooh",            label: "Campagne OOH",      icon: "🏙" },
    { key: "timeline",       label: "Timeline",          icon: "📅" },
    { key: "creativita",     label: "Creatività",        icon: "🖼" },
    { key: "lead-contratti", label: "Lead ↔ Contratti",  icon: "🔗" },
    { key: "budget",         label: "Budget",            icon: "💰" },
    { key: "reach",          label: "Reach",             icon: "📡" },
    { key: "dashboard",      label: "Dashboard",         icon: "🌐" },
    { key: "syncro", 		 label: "Syncro", 			 icon: "🔀" },

  ];

  const handlePinSubmit = async () => {
    setPinChecking(true);
    const ok = await verifyPin(pinValue);
    setPinChecking(false);
    if (ok) { setUnlocked(true); setPinOpen(false); setPinValue(""); setPinError(false); }
    else { setPinError(true); }
  };

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
      {tabs.map(t => (
        <button key={t.key} className="nav-link" onClick={() => t.key !== current && onNavigate(t.key)}
          style={{ background: current === t.key ? "#1e293b" : "#f1f5f9", color: current === t.key ? "#fff" : "#475569" }}>
          {t.icon} {t.label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", position: "relative" }}>
        {unlocked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ background: "#dcfce7", color: "#16a34a", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
              🔓 Modifica attiva
            </span>
            <button className="btn" onClick={() => setUnlocked(false)} title="Esci dalla modalità modifica" style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => { setPinOpen(!pinOpen); setPinValue(""); setPinError(false); }} title="Sblocca modifiche" style={{ background: "#f1f5f9", color: "#94a3b8", padding: "8px 14px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            🔒 Sola lettura
          </button>
        )}
        {pinOpen && !unlocked && (
          <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,.15)", border: "1px solid #e8ecf1", zIndex: 100, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Inserisci PIN per modificare</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="password" inputMode="numeric" maxLength={7} value={pinValue} onChange={e => { setPinValue(e.target.value.replace(/\D/g, "").slice(0, 7)); setPinError(false); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
                placeholder="0000000" autoFocus
                style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", letterSpacing: 4, borderColor: pinError ? "#ef4444" : "#e2e8f0" }} />
              <button className="btn" onClick={handlePinSubmit} disabled={pinChecking} style={{ background: "#1e293b", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>{pinChecking ? "…" : "→"}</button>
            </div>
            {pinError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>PIN errato</div>}
          </div>
        )}
      </div>
    </div>
  );
}
