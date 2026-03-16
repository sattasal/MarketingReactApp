import React from "react";

export function PageShell({ children, toast }: { children: React.ReactNode; toast: string | null }) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "linear-gradient(145deg, #f8f9fb 0%, #eef1f5 100%)", minHeight: "100vh", color: "#1e293b", padding: "24px 16px 60px" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 999, boxShadow: "0 8px 30px rgba(0,0,0,.15)", animation: "fadeIn .2s ease" }}>
          {toast}
        </div>
      )}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}