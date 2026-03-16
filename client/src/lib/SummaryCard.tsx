import { formatEur } from "../../lib/utils";

export function SummaryCard({ label, value, icon, gradient, textColor, subColor, detail }: any) {
  return (
    <div style={{ background: gradient, borderRadius: 14, padding: "20px 24px", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: subColor, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>
        {formatEur(value)}
      </div>
      {detail && <div style={{ fontSize: 11, color: subColor, marginTop: 6 }}>{detail}</div>}
    </div>
  );
}