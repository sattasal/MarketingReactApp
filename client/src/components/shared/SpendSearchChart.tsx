/**
 * COMPONENTE: SpendSearchChart
 * - Barre spesa settimanale (distribuzione proporzionale, Stampa su data singola)
 * - Linea click organici Search Console (toggle on/off)
 * - Linea click brand "leonori" (toggle on/off)
 * - Asse Y sinistro (€) e destro (click) si adattano ai dati visibili
 * - Filtro per escludere tipologie di spesa
 * - Toggle delay 1 settimana per le ricerche
 */

import React, { useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "../../lib/supabase";
import { TABLE } from "../../lib/constants";
import { useApiData } from "../../hooks/useApiData";

// ─── TIPI ────────────────────────────────────────────────────────────────────
interface WeeklyGSC {
  weekStart:     string;
  organicClicks: number;
  brandClicks:   number;
}
interface SpendEntry {
  data_inizio:  string;
  data_fine:    string;
  spesa:        number;
  tipologia:    string;
  date_singole: string | null;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getWeekStart(dateStr: string): string {
  const d   = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  const y  = mon.getFullYear();
  const m  = String(mon.getMonth() + 1).padStart(2, "0");
  const dd = String(mon.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T12:00:00");
  const fin = new Date(end   + "T12:00:00");
  while (cur <= fin) {
    const y  = cur.getFullYear();
    const m  = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split("T")[0];
}

function fmtWeek(dateStr: string): string {
  if (!dateStr) return "";
  const [, m, dd] = dateStr.split("-");
  return `${dd}/${m}`;
}

// ─── AGGREGAZIONE SPESA ───────────────────────────────────────────────────────
function aggregateSpending(
  entries: SpendEntry[],
  weeks: number,
  excludedTipologie: Set<string>
): Record<string, number> {
  const startLimit = weeksAgo(weeks + 1);
  const map: Record<string, number> = {};

  entries.forEach(({ data_inizio, data_fine, spesa, tipologia, date_singole }) => {
    if (excludedTipologie.has(tipologia)) return;

    if (tipologia === "Stampa" && date_singole) {
      const dates = date_singole.split(",").map(d => d.trim()).filter(Boolean);
      const perDate = spesa / (dates.length || 1);
      dates.forEach(date => {
        if (date >= startLimit) {
          const wk = getWeekStart(date);
          map[wk] = (map[wk] || 0) + perDate;
        }
      });
      return;
    }

    const allDays = dateRange(data_inizio, data_fine);
    if (!allDays.length) return;
    const perDay = spesa / allDays.length;
    allDays.forEach(date => {
      if (date >= startLimit) {
        const wk = getWeekStart(date);
        map[wk] = (map[wk] || 0) + perDay;
      }
    });
  });

  return map;
}

// ─── FETCH ────────────────────────────────────────────────────────────────────
async function fetchSpending(weeks: number): Promise<SpendEntry[]> {
  const since = weeksAgo(weeks + 1);
  const data  = await supabase.select(
    TABLE,
    `data_fine=gte.${since}&select=data_inizio,data_fine,spesa,tipologia,date_singole&order=data_inizio.asc`
  );
  return data || [];
}

async function fetchGSCWeekly(weeks: number): Promise<WeeklyGSC[]> {
  const url = new URL("/api/search-console/weekly", window.location.origin);
  url.searchParams.set("weeks", String(weeks));
  url.searchParams.set("brandKeyword", "leonori");
  const res  = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", minWidth: 190 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Settimana dal {label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
            <span style={{ fontSize: 12, color: "#475569" }}>{p.name}</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
            {p.name === "Spesa €"
              ? `€ ${Math.round(p.value).toLocaleString("it-IT")}`
              : p.value?.toLocaleString("it-IT")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── TOGGLE BUTTON ────────────────────────────────────────────────────────────
function ToggleBtn({ active, color, label, onClick }: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn" style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
      background: active ? color + "18" : "#f8fafc",
      color:      active ? color       : "#94a3b8",
      border:     `1.5px solid ${active ? color + "40" : "#e2e8f0"}`,
      transition: "all .15s ease",
    }}>
      <div style={{ width: 10, height: 10, borderRadius: "50%", background: active ? color : "#cbd5e1", transition: "background .15s" }} />
      {label}
    </button>
  );
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
export default function SpendSearchChart() {
  const WEEKS = 12;

  const [showOrganic, setShowOrganic] = useState(true);
  const [showBrand,   setShowBrand]   = useState(true);
  const [delay, setDelay] = useState(0); // 0 = nessun delay, 1 = 1 sett., 2 = 2 sett.
  const [excludedTip, setExcludedTip] = useState<Set<string>>(new Set());

  const toggleTipologia = (tip: string) => {
    setExcludedTip(prev => {
      const next = new Set(prev);
      next.has(tip) ? next.delete(tip) : next.add(tip);
      return next;
    });
  };

  const { data: gscData,   loading: loadGsc   } = useApiData(() => fetchGSCWeekly(WEEKS), []);
  const { data: spendData, loading: loadSpend } = useApiData(() => fetchSpending(WEEKS),   []);

  // Tipologie presenti nei dati
  const availableTip = useMemo(() => {
    if (!spendData) return [] as string[];
    return Array.from(new Set((spendData as SpendEntry[]).map(e => e.tipologia))).sort();
  }, [spendData]);

  // Aggrega con filtro
  const spendMap = useMemo(() => {
    if (!spendData) return {};
    return aggregateSpending(spendData as SpendEntry[], WEEKS, excludedTip);
  }, [spendData, excludedTip]);

  // Dataset
  const chartData = useMemo(() => {
    const gscArr   = (gscData as WeeklyGSC[]) || [];
    const weekKeys = gscArr.length > 0
      ? gscArr.map(r => r.weekStart).sort()
      : Array.from(new Set(Object.keys(spendMap))).sort().slice(-WEEKS);
    if (!weekKeys.length) return [];

    const gscMap: Record<string, WeeklyGSC> = {};
    gscArr.forEach(r => { gscMap[r.weekStart] = r; });

    return weekKeys.map((wk, i) => {
      const gsc = delay > 0 ? gscMap[weekKeys[i - delay]] : gscMap[wk];
      return {
        label:         fmtWeek(wk),
        spesa:         Math.round((spendMap[wk] || 0) * 100) / 100,
        organicClicks: gsc?.organicClicks ?? null,
        brandClicks:   gsc?.brandClicks   ?? null,
      };
    });
  }, [gscData, spendMap, delay]);

  // Domain assi adattivi
  const spendMax = useMemo(() =>
    Math.max(...chartData.map(d => d.spesa || 0), 1),
  [chartData]);

  const clicksMax = useMemo(() => {
    const vals: number[] = [];
    if (showOrganic) chartData.forEach(d => d.organicClicks && vals.push(d.organicClicks));
    if (showBrand)   chartData.forEach(d => d.brandClicks   && vals.push(d.brandClicks));
    return Math.max(...vals, 1);
  }, [chartData, showOrganic, showBrand]);

  const loading = loadGsc || loadSpend;

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Correlazione Spesa ↔ Ricerche</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Spesa settimanale vs click organici e brand · ultime {WEEKS} settimane
          </p>
        </div>
		<div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
		  {[{ val: 0, label: "Nessun delay" }, { val: 1, label: "Delay 1 sett." }, { val: 2, label: "Delay 2 sett." }].map(({ val, label }) => (
			<button key={val} onClick={() => setDelay(val)} className="btn" style={{
			  padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
			  background: delay === val ? "#1e293b" : "transparent",
			  color:      delay === val ? "#fff"    : "#64748b",
			  boxShadow:  delay === val ? "0 1px 4px rgba(0,0,0,.1)" : "none",
			}}>
			  {val === 0 ? "⏱ " : ""}{label}
			</button>
		  ))}
		</div>
          ⏱ {delay ? "Delay 1 sett. attivo" : "Attiva delay 1 sett."}
        </button>
      </div>

      {/* Controlli */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>

        {/* Toggle linee ricerca */}
        <ToggleBtn active={showOrganic} color="#3b82f6" label="Click organici"   onClick={() => setShowOrganic(v => !v)} />
        <ToggleBtn active={showBrand}   color="#f59e0b" label='Brand "leonori"'  onClick={() => setShowBrand(v => !v)} />

        {availableTip.length > 0 && (
          <>
            <div style={{ width: 1, height: 24, background: "#e2e8f0", margin: "0 4px" }} />
            <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px" }}>
              Escludi spesa:
            </span>
            {availableTip.map(tip => {
              const excluded = excludedTip.has(tip);
              return (
                <button key={tip} onClick={() => toggleTipologia(tip)} className="btn" style={{
                  padding: "4px 10px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                  background: excluded ? "#fef2f2" : "#f8fafc",
                  color:      excluded ? "#e11d48" : "#475569",
                  border:     `1.5px solid ${excluded ? "#fecdd3" : "#e2e8f0"}`,
                  textDecoration: excluded ? "line-through" : "none",
                  transition: "all .15s ease",
                }}>
                  {tip}
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Grafico */}
      {loading ? (
        <div style={{ height: 300, background: "#f1f5f9", borderRadius: 8 }} />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 55, bottom: 4, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                axisLine={false} tickLine={false}
              />
              {/* Asse Y sx — spesa adattiva */}
              <YAxis yAxisId="spend" orientation="left"
                domain={[0, Math.ceil(spendMax * 1.15 / 1000) * 1000]}
                tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                axisLine={false} tickLine={false} width={62}
                tickFormatter={v => v >= 1000 ? `€${(v/1000).toFixed(0)}k` : `€${v}`}
              />
              {/* Asse Y dx — click adattivo, visibile solo se almeno una linea è attiva */}
              {(showOrganic || showBrand) && (
                <YAxis yAxisId="clicks" orientation="right"
                  domain={[0, Math.ceil(clicksMax * 1.15 / 1000) * 1000]}
                  tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false} tickLine={false} width={52}
                  tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
                />
              )}
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />

              <Bar yAxisId="spend" dataKey="spesa" name="Spesa €"
                fill="#e2e8f0" radius={[3, 3, 0, 0]} maxBarSize={32} />

              {showOrganic && (
                <Line yAxisId="clicks" type="monotone" dataKey="organicClicks"
                  name="Click organici" stroke="#3b82f6" strokeWidth={2.5}
                  dot={false} activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
                  connectNulls={false} />
              )}
              {showBrand && (
                <Line yAxisId="clicks" type="monotone" dataKey="brandClicks"
                  name='Brand "leonori"' stroke="#f59e0b" strokeWidth={2.5}
                  dot={false} activeDot={{ r: 4, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                  connectNulls={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>

          {/* Legenda */}
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: "#e2e8f0" }} />
              Spesa (€ — asse sx)
              {excludedTip.size > 0 && (
                <span style={{ color: "#e11d48", fontWeight: 600 }}>
                  · escluso: {Array.from(excludedTip).join(", ")}
                </span>
              )}
            </div>
            {showOrganic && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8" }}>
                <div style={{ width: 14, height: 2.5, borderRadius: 2, background: "#3b82f6" }} />
                Click organici (asse dx)
              </div>
            )}
            {showBrand && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#94a3b8" }}>
                <div style={{ width: 14, height: 2.5, borderRadius: 2, background: "#f59e0b" }} />
                Brand "leonori" (asse dx){delay > 0 ? ` · ritardo ${delay} sett.` : ""}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
