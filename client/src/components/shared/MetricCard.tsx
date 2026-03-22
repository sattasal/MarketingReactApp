import React from "react";

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  change?: number | null;
  icon?: string;
  color?: "blue" | "green" | "amber" | "rose" | "purple" | "slate";
  loading?: boolean;
  suffix?: string;
  subtitle?: string;
}

// Palette colori light — uno per tipo di metrica
const colorMap = {
  blue:   { bg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", accent: "#2563eb", light: "#bfdbfe" },
  green:  { bg: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)", accent: "#16a34a", light: "#bbf7d0" },
  amber:  { bg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)", accent: "#d97706", light: "#fde68a" },
  rose:   { bg: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)", accent: "#e11d48", light: "#fecdd3" },
  purple: { bg: "linear-gradient(135deg, #faf5ff 0%, #ede9fe 100%)", accent: "#7c3aed", light: "#ddd6fe" },
  slate:  { bg: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)", accent: "#475569", light: "#cbd5e1" },
};

function formatValue(value: string | number | null | undefined, suffix: string): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n as number)) return String(value);
  let formatted: string;
  if (n >= 1_000_000)    formatted = (n / 1_000_000).toFixed(1) + "M";
  else if (n >= 10_000)  formatted = (n / 1_000).toFixed(1) + "k";
  else if (n >= 1_000)   formatted = n.toLocaleString("it-IT");
  else if (!Number.isInteger(n)) formatted = (n as number).toFixed(2);
  else formatted = String(n);
  return formatted + suffix;
}

export function MetricCard({ label, value, change, icon, color = "slate", loading = false, suffix = "", subtitle }: MetricCardProps) {
  const c = colorMap[color];

  if (loading) {
    return (
      <div style={{ background: "#f8fafc", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", minHeight: 110 }}>
        <div style={{ background: "#e2e8f0", borderRadius: 6, height: 12, width: 80, marginBottom: 12 }} />
        <div style={{ background: "#e2e8f0", borderRadius: 6, height: 28, width: 100 }} />
      </div>
    );
  }

  const isPositive = (change ?? 0) > 0;
  const isNeutral  = change === null || change === undefined || change === 0;
  const changeColor = isNeutral ? "#94a3b8" : isPositive ? "#16a34a" : "#e11d48";
  const changeIcon  = isNeutral ? "" : isPositive ? "↑" : "↓";

  return (
    <div style={{ background: c.bg, borderRadius: 14, padding: "20px 24px", boxShadow: "0 4px 16px rgba(0,0,0,.08)", border: `1px solid ${c.light}`, transition: "transform .15s ease, box-shadow .15s ease", cursor: "default" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,.12)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,.08)"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".4px" }}>
          {label}
        </span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>

      {/* Valore principale */}
      <div style={{ fontSize: 28, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.5px", lineHeight: 1.1 }}>
        {formatValue(value, suffix)}
      </div>

      {subtitle && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{subtitle}</div>
      )}

      {/* Variazione % */}
      {!isNeutral && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 12, fontWeight: 600 }}>
          <span style={{ color: changeColor }}>{changeIcon} {Math.abs(change!)}%</span>
          <span style={{ color: "#94a3b8", fontWeight: 400 }}>vs periodo prec.</span>
        </div>
      )}
    </div>
  );
}
