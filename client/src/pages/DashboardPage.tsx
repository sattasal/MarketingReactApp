/**
 * PAGINA: Dashboard Unica
 * Combina Search Console + Google Analytics 4 + Salesforce in una sola vista.
 * 
 * Layout:
 *  - KPI row (6 card)
 *  - Trend charts (GSC click/impressioni | GA4 sessioni/utenti)
 *  - Canali GA4 | Top query GSC
 *  - Top pagine GA4
 *  - Pipeline Salesforce
 *  - Core Web Vitals
 */

import React, { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { NavBar }             from "../components/shared/NavBar";
import { PageShell }          from "../components/shared/PageShell";
import { MetricCard }         from "../components/shared/MetricCard";
import { TrendChart }         from "../components/shared/TrendChart";
import { DataTable, ColDef }  from "../components/shared/DataTable";
import { DateRangePicker, CWVScore } from "../components/shared/DatePickerAndCWV";
import { useApiData }         from "../hooks/useApiData";
import { PageProps }          from "../lib/types";

// ─── FETCH HELPER ─────────────────────────────────────────────────────────────
async function apiFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── COLORI CANALI ────────────────────────────────────────────────────────────
const CHANNEL_COLORS: Record<string, string> = {
  "Organic Search":  "#3b82f6",
  "Direct":          "#8b5cf6",
  "Organic Social":  "#ec4899",
  "Paid Search":     "#f59e0b",
  "Email":           "#10b981",
  "Referral":        "#0ea5e9",
  "Paid Social":     "#f97316",
  "Organic Video":   "#14b8a6",
  "Unassigned":      "#94a3b8",
};

// ─── COLORI STAGE PIPELINE ────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  "Prospecting":          "#94a3b8",
  "Qualification":        "#3b82f6",
  "Needs Analysis":       "#8b5cf6",
  "Proposal/Price Quote": "#0ea5e9",
  "Negotiation/Review":   "#14b8a6",
  "Closed Won":           "#16a34a",
  "Closed Lost":          "#e11d48",
};

// ─── COLONNE TABELLE ──────────────────────────────────────────────────────────
const PAGE_COLS: ColDef[] = [
  { key: "path",           label: "Pagina" },
  { key: "sessions",       label: "Sessioni",   align: "right", bar: true },
  { key: "users",          label: "Utenti",     align: "right" },
  { key: "engagementRate", label: "Engagement", align: "right",
    format: (v: number) => {
      const color = v >= 60 ? "#16a34a" : v >= 30 ? "#d97706" : "#e11d48";
      return <span style={{ color, fontWeight: 600 }}>{v}%</span>;
    }},
];

const QUERY_COLS: ColDef[] = [
  { key: "query",       label: "Query" },
  { key: "clicks",      label: "Click",      align: "right", bar: true },
  { key: "impressions", label: "Impressioni", align: "right" },
  { key: "position",    label: "Pos.",        align: "right",
    format: (v: number) => {
      const color = v <= 3 ? "#16a34a" : v <= 10 ? "#d97706" : "#e11d48";
      return <span style={{ color, fontWeight: 600 }}>{v}</span>;
    }},
];

// ─── TOOLTIP CANALI ───────────────────────────────────────────────────────────
function ChannelTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{d.channel}</p>
      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
        <div>Sessioni: <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>{d.sessions?.toLocaleString("it-IT")}</span></div>
        <div>Utenti: <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>{d.users?.toLocaleString("it-IT")}</span></div>
      </div>
    </div>
  );
}

// ─── TOOLTIP PIPELINE ─────────────────────────────────────────────────────────
function PipelineTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{d.stage}</p>
      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
        <div>Deal: <span style={{ fontWeight: 700, color: "#0f172a" }}>{d.deals}</span></div>
        <div>Valore: <span style={{ fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
          € {(d.totalAmount || 0).toLocaleString("it-IT", { minimumFractionDigits: 0 })}
        </span></div>
      </div>
    </div>
  );
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function formatEurCompact(v: number): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `€ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `€ ${(v / 1_000).toFixed(0)}k`;
  return `€ ${v.toLocaleString("it-IT")}`;
}

// ─── SEZIONE WRAPPER ──────────────────────────────────────────────────────────
function Section({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {accent && <div style={{ width: 3, height: 16, borderRadius: 2, background: accent }} />}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────
export default function DashboardPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [period, setPeriod] = useState({ label: "28 giorni", startDate: "28daysAgo", endDate: "today" });
  const [cwvStrategy, setCwvStrategy] = useState<"mobile" | "desktop">("mobile");

  // ── Fetch tutti i dati in parallelo ──────────────────────────────────────
  const p = { startDate: period.startDate, endDate: period.endDate };

  const { data: gscOverview,  loading: loadGscOv   } = useApiData(() => apiFetch("/api/search-console/overview",  p), [period.startDate]);
  const { data: gscQueries,   loading: loadGscQ    } = useApiData(() => apiFetch("/api/search-console/queries",   { ...p, rowLimit: "15" }), [period.startDate]);
  const { data: ga4Summary,   loading: loadGa4Sum  } = useApiData(() => apiFetch("/api/analytics/summary", p), [period.startDate]);
  const { data: ga4Overview,  loading: loadGa4Ov   } = useApiData(() => apiFetch("/api/analytics/overview",  p), [period.startDate]);
  const { data: ga4Channels,  loading: loadGa4Ch   } = useApiData(() => apiFetch("/api/analytics/channels",  p), [period.startDate]);
  const { data: ga4Pages,     loading: loadGa4Pg   } = useApiData(() => apiFetch("/api/analytics/pages",     { ...p, limit: "15" }), [period.startDate]);
  const { data: sfSummary,    loading: loadSfSum   } = useApiData(() => apiFetch("/api/salesforce/summary"), []);
  const { data: sfPipeline,   loading: loadSfPipe  } = useApiData(() => apiFetch("/api/salesforce/pipeline-summary"), []);
  const { data: cwv,          loading: loadCwv     } = useApiData(() => apiFetch("/api/search-console/cwv", { strategy: cwvStrategy }), [cwvStrategy]);

  // ── Estrai i valori ───────────────────────────────────────────────────────
  const gscTotals   = (gscOverview  as any)?.totals   || {};
  const ga4Current  = (ga4Summary   as any)?.current  || {};
  const ga4Changes  = (ga4Summary   as any)?.changes   || {};
  const sfKpi       = (sfSummary    as any)?.data      || {};
  const ga4Daily    = (ga4Overview  as any)?.daily     || [];
  const gscDaily    = (gscOverview  as any)?.daily     || [];
  const chData      = (ga4Channels  as any)?.data      || [];
  const pgData      = (ga4Pages     as any)?.data      || [];
  const qData       = (gscQueries   as any)?.data      || [];
  const pipeData    = (sfPipeline   as any)?.stages    || [];
  const totalPipe   = (sfPipeline   as any)?.totalPipeline || 0;

  return (
    <PageShell toast={null}>
      <NavBar current="dashboard" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📊 Dashboard</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Search Console · Analytics · Salesforce
          </p>
        </div>
        <DateRangePicker value={period} onChange={setPeriod} />
      </div>

      {/* ── KPI ROW ───────────────────────────────────────────────────────── */}
      {/* 6 card: 3 GSC/GA4 + 3 Salesforce */}
      <div style={{ marginBottom: 28 }}>
        {/* Etichetta GSC + GA4 */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "#16a34a" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".4px" }}>Search Console + Analytics</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          <MetricCard label="Click organici"  value={gscTotals.clicks}      icon="🖱️" color="green"  loading={loadGscOv} />
          <MetricCard label="Impressioni"      value={gscTotals.impressions}  icon="👁️" color="blue"   loading={loadGscOv} />
          <MetricCard label="CTR medio"        value={gscTotals.avgCtr ? +((gscTotals.avgCtr as number) * 100).toFixed(2) : null} suffix="%" icon="📊" color="amber" loading={loadGscOv} />
          <MetricCard label="Sessioni"         value={ga4Current.sessions}    icon="📡" color="blue"   loading={loadGa4Sum} change={ga4Changes.sessions} />
          <MetricCard label="Utenti"           value={ga4Current.users}       icon="👥" color="purple" loading={loadGa4Sum} change={ga4Changes.users} />
          <MetricCard label="Nuovi utenti"     value={ga4Current.newUsers}    icon="✨" color="green"  loading={loadGa4Sum} change={ga4Changes.newUsers} />
        </div>

        {/* Etichetta Salesforce */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "#0ea5e9" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9", textTransform: "uppercase", letterSpacing: ".4px" }}>Salesforce CRM</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          <MetricCard label="Lead questo mese"  value={sfKpi.leadsThisMonth}    icon="🆕" color="blue"   loading={loadSfSum} />
          <MetricCard label="Lead totali"        value={sfKpi.leadsTotal}         icon="👤" color="purple" loading={loadSfSum} />
          <MetricCard label="Opport. aperte"     value={sfKpi.openOpportunities}  icon="📂" color="amber"  loading={loadSfSum} />
          <MetricCard label="Valore pipeline"    value={formatEurCompact(sfKpi.pipelineValue)} icon="💼" color="green" loading={loadSfSum} />
          <MetricCard label="Chiuse questo mese" value={sfKpi.wonThisMonth}       icon="🏆" color="rose"   loading={loadSfSum}
            subtitle={sfKpi.wonValueThisMonth ? formatEurCompact(sfKpi.wonValueThisMonth) : undefined} />
        </div>
      </div>

      {/* ── TREND CHARTS (above fold) ──────────────────────────────────────── */}
      <Section title="Andamento nel periodo" accent="#3b82f6">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <TrendChart
            title="Click e Impressioni (Search Console)"
            data={gscDaily}
            loading={loadGscOv}
            height={220}
            lines={[
              { key: "clicks",      label: "Click",       color: "#16a34a" },
              { key: "impressions", label: "Impressioni",  color: "#3b82f6", format: v => v?.toLocaleString("it-IT") },
            ]}
          />
          <TrendChart
            title="Sessioni e Utenti (Analytics)"
            data={ga4Daily}
            loading={loadGa4Ov}
            height={220}
            lines={[
              { key: "sessions",   label: "Sessioni", color: "#8b5cf6" },
              { key: "totalUsers", label: "Utenti",   color: "#0ea5e9" },
            ]}
          />
        </div>
      </Section>

      {/* ── CANALI GA4 + TOP QUERY GSC ────────────────────────────────────── */}
      <Section title="Canali di traffico + Query di ricerca" accent="#8b5cf6">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Canali GA4 */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Sessioni per canale</h3>
            {loadGa4Ch ? (
              <div style={{ height: 220, background: "#f1f5f9", borderRadius: 8 }} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                  />
                  <YAxis type="category" dataKey="channel"
                    tick={{ fontSize: 10, fill: "#475569", fontFamily: "'DM Sans', sans-serif" }}
                    axisLine={false} tickLine={false} width={95}
                  />
                  <Tooltip content={<ChannelTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="sessions" radius={[0, 4, 4, 0]} maxBarSize={16}>
                    {chData.map((e: any, i: number) => (
                      <Cell key={i} fill={CHANNEL_COLORS[e.channel] || "#3b82f6"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top query GSC */}
          <DataTable
            title="Top query di ricerca"
            columns={QUERY_COLS}
            data={qData}
            loading={loadGscQ}
            accentColor="#16a34a"
            maxRows={8}
          />
        </div>
      </Section>

      {/* ── TOP PAGINE GA4 ────────────────────────────────────────────────── */}
      <Section title="Top pagine per sessioni" accent="#0ea5e9">
        <DataTable
          columns={PAGE_COLS}
          data={pgData}
          loading={loadGa4Pg}
          accentColor="#3b82f6"
          maxRows={8}
        />
      </Section>

      {/* ── PIPELINE SALESFORCE ───────────────────────────────────────────── */}
      <Section title="Pipeline commerciale" accent="#f59e0b">
        <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Valore per stage</span>
            {!loadSfPipe && totalPipe > 0 && (
              <div style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)", border: "1px solid #bbf7d0", borderRadius: 8, padding: "5px 12px" }}>
                <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Totale pipeline </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatEurCompact(totalPipe)}
                </span>
              </div>
            )}
          </div>

          {loadSfPipe ? (
            <div style={{ height: 160, background: "#f1f5f9", borderRadius: 8 }} />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={pipeData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="stage"
                  tick={{ fontSize: 9, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={v => v.length > 12 ? v.slice(0, 11) + "…" : v}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false} tickLine={false} width={55}
                  tickFormatter={v => v >= 1000 ? `€${(v/1000).toFixed(0)}k` : `€${v}`}
                />
                <Tooltip content={<PipelineTooltip />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="totalAmount" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {pipeData.map((e: any, i: number) => (
                    <Cell key={i} fill={STAGE_COLORS[e.stage] || "#475569"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Pillole stage */}
          {!loadSfPipe && pipeData.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
              {pipeData.map((s: any) => {
                const color = STAGE_COLORS[s.stage] || "#475569";
                return (
                  <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 5, background: color + "12", borderRadius: 6, padding: "3px 10px" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                    <span style={{ fontSize: 11, color, fontWeight: 600 }}>{s.stage}</span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>{s.deals} deal</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>

      {/* ── CORE WEB VITALS ───────────────────────────────────────────────── */}
      <Section title="Core Web Vitals" accent="#e11d48">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
            {(["mobile", "desktop"] as const).map(s => (
              <button key={s} onClick={() => setCwvStrategy(s)} className="btn"
                style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  background: cwvStrategy === s ? "#fff" : "transparent",
                  color: cwvStrategy === s ? "#1e293b" : "#64748b",
                  boxShadow: cwvStrategy === s ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>
                {s === "mobile" ? "📱 Mobile" : "🖥️ Desktop"}
              </button>
            ))}
          </div>
        </div>
        <CWVScore data={(cwv as any)?.data} loading={loadCwv} />
      </Section>

      <p style={{ textAlign: "center", fontSize: 12, color: "#cbd5e1", paddingBottom: 20 }}>
        Search Console · Analytics 4 · Salesforce — Periodo: {period.label}
      </p>
    </PageShell>
  );
}
