import React, { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from "recharts";

interface LineConfig {
  key: string;
  label: string;
  color: string;
  format?: (v: number) => string;
}

interface TrendChartProps {
  data: any[];
  lines: LineConfig[];
  title?: string;
  loading?: boolean;
  height?: number;
  formatY?: (v: number) => string;
}

// Converte "20240115" o "2024-01-15" → "15 gen"
function fmtDate(d: string): string {
  if (!d) return "";
  const s = d.replace(/-/g, "");
  if (s.length === 8) {
    const dt = new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
    return dt.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  }
  return d;
}

function CustomTooltip({ active, payload, label, lines }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", minWidth: 160 }}>
      <p style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontWeight: 600 }}>{fmtDate(label)}</p>
      {payload.map((entry: any, i: number) => {
        const def = lines?.find((l: LineConfig) => l.key === entry.dataKey);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color }} />
              <span style={{ fontSize: 12, color: "#475569" }}>{def?.label || entry.dataKey}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
              {def?.format ? def.format(entry.value) : entry.value?.toLocaleString("it-IT")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TrendChart({ data = [], lines = [], title, loading = false, height = 280, formatY }: TrendChartProps) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
        {title && <div style={{ background: "#e2e8f0", borderRadius: 6, height: 14, width: 160, marginBottom: 16 }} />}
        <div style={{ background: "#f1f5f9", borderRadius: 8, height }} />
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
      {/* Header */}
      {(title || lines.length > 1) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          {title && <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h3>}
          {/* Legenda cliccabile */}
          {lines.length > 1 && (
            <div style={{ display: "flex", gap: 16 }}>
              {lines.map(l => (
                <button
                  key={l.key}
                  onClick={() => setHidden(h => ({ ...h, [l.key]: !h[l.key] }))}
                  className="btn"
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "none", padding: 0, opacity: hidden[l.key] ? .35 : 1, transition: "opacity .15s" }}
                >
                  <div style={{ width: 24, height: 2.5, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 12, color: "#475569" }}>{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {data.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height, color: "#94a3b8", fontSize: 13 }}>
          Nessun dato disponibile
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
              axisLine={false} tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatY ?? (v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v))}
              tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
              axisLine={false} tickLine={false} width={42}
            />
            <Tooltip content={<CustomTooltip lines={lines} />} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} />
            {lines.map(l => !hidden[l.key] && (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: l.color, stroke: "#fff", strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
