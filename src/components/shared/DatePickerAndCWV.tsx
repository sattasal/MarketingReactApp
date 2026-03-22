import React from "react";

// ─── DATE RANGE PICKER ────────────────────────────────────────────────────────

interface DateRange {
  label: string;
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS: DateRange[] = [
  { label: "7 giorni",    startDate: "7daysAgo",   endDate: "today" },
  { label: "28 giorni",   startDate: "28daysAgo",  endDate: "today" },
  { label: "3 mesi",      startDate: "90daysAgo",  endDate: "today" },
  { label: "6 mesi",      startDate: "180daysAgo", endDate: "today" },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
      {PRESETS.map(p => {
        const active = value.label === p.label;
        return (
          <button
            key={p.label}
            onClick={() => onChange(p)}
            className="btn"
            style={{
              padding: "6px 14px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              background: active ? "#fff" : "transparent",
              color: active ? "#1e293b" : "#64748b",
              boxShadow: active ? "0 1px 4px rgba(0,0,0,.1)" : "none",
              transition: "all .15s ease",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── CWV SCORE ────────────────────────────────────────────────────────────────

interface CWVMetric { value?: number; displayValue?: string; score?: number }
interface CWVData {
  score?: number;
  strategy?: string;
  url?: string;
  lcp?: CWVMetric;
  fid?: CWVMetric;
  cls?: CWVMetric;
  fcp?: CWVMetric;
  tbt?: CWVMetric;
}

interface CWVScoreProps {
  data?: CWVData | null;
  loading?: boolean;
}

const THRESHOLDS: Record<string, { good: number; poor: number; label: string; name: string }> = {
  lcp: { good: 2500,  poor: 4000,  label: "LCP",  name: "Largest Contentful Paint" },
  fid: { good: 100,   poor: 300,   label: "FID",  name: "First Input Delay" },
  cls: { good: 0.1,   poor: 0.25,  label: "CLS",  name: "Cumulative Layout Shift" },
  fcp: { good: 1800,  poor: 3000,  label: "FCP",  name: "First Contentful Paint" },
  tbt: { good: 200,   poor: 600,   label: "TBT",  name: "Total Blocking Time" },
};

function getRating(key: string, value?: number): "good" | "needs-improvement" | "poor" | "unknown" {
  if (value === undefined || value === null) return "unknown";
  const t = THRESHOLDS[key];
  if (!t) return "unknown";
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

const RATING_STYLE = {
  good:                { color: "#16a34a", bg: "linear-gradient(135deg, #f0fdf4, #dcfce7)", border: "#bbf7d0", label: "Buono" },
  "needs-improvement": { color: "#d97706", bg: "linear-gradient(135deg, #fffbeb, #fef3c7)", border: "#fde68a", label: "Da migliorare" },
  poor:                { color: "#e11d48", bg: "linear-gradient(135deg, #fff1f2, #ffe4e6)", border: "#fecdd3", label: "Scarso" },
  unknown:             { color: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", label: "N/D" },
};

function ScoreCircle({ score }: { score?: number }) {
  const s = score ?? 0;
  const radius = 32;
  const circ   = 2 * Math.PI * radius;
  const prog   = (s / 100) * circ;
  const color  = s >= 90 ? "#16a34a" : s >= 50 ? "#d97706" : "#e11d48";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={40} cy={40} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={6} />
        <circle cx={40} cy={40} r={radius} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${prog} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <text x={40} y={45} textAnchor="middle" fill="#0f172a" fontSize={18} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
          {score ?? "—"}
        </text>
      </svg>
      <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".4px" }}>
        Performance
      </span>
    </div>
  );
}

export function CWVScore({ data, loading }: CWVScoreProps) {
  if (loading) {
    return (
      <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
        <div style={{ background: "#e2e8f0", borderRadius: 6, height: 14, width: 180, marginBottom: 16 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          {[...Array(5)].map((_, i) => <div key={i} style={{ background: "#f1f5f9", borderRadius: 10, height: 100 }} />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const metrics: Array<keyof typeof THRESHOLDS> = ["lcp", "fcp", "cls", "fid", "tbt"];

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Core Web Vitals</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#94a3b8" }}>
            {data.strategy === "mobile" ? "📱 Mobile" : "🖥️ Desktop"} · {data.url}
          </p>
        </div>
        <ScoreCircle score={data.score} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
        {metrics.map(key => {
          const metric = (data as any)[key] as CWVMetric | undefined;
          const rating = getRating(key, metric?.value);
          const style  = RATING_STYLE[rating];
          const thresh = THRESHOLDS[key];

          return (
            <div key={key} style={{ background: style.bg, border: `1px solid ${style.border}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>{thresh.label}</span>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: style.color }} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
                {metric?.displayValue || "—"}
              </div>
              <div style={{ fontSize: 11, color: style.color, fontWeight: 600, marginTop: 4 }}>{style.label}</div>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3, lineHeight: 1.3 }}>{thresh.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
