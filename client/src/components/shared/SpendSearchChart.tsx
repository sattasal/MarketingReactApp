/**
 * COMPONENTE: SpendSearchChart
 *
 * Grafico di correlazione tra:
 * - Spesa settimanale (da Supabase marketing_entries) → barre, asse Y sinistro €
 * - Click organici settimanali (Search Console) → linea, asse Y destro
 * - Click brand settimanali (query con 'leonori') → linea, asse Y destro
 *
 * Feature speciale: toggle "delay 1 settimana" — sposta le linee di ricerca
 * in avanti di una settimana per vedere la correlazione con ritardo.
 */

import React, { useState, useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { supabase } from "../../lib/supabase";
import { TABLE } from "../../lib/constants";
import { useApiData } from "../../hooks/useApiData";

// ─── TIPI ────────────────────────────────────────────────────────────────────
interface WeeklyGSC {
  weekStart: string;
  organicClicks: number;
  brandClicks: number;
}

interface SpendEntry {
  dataInizio: string;
  dataFine: string;
  spesa: number;
  tipologia: string;
  date_singole: string | null;
}

// ─── HELPERS SETTIMANA ────────────────────────────────────────────────────────

// Lunedì della settimana di una data
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

// Genera tutte le date tra start e end (incluse)
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const fin = new Date(end   + "T00:00:00");
  while (cur <= fin) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Data N settimane fa
function weeksAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d.toISOString().split("T")[0];
}

// Formatta la data "2024-01-08" → "08/01"
function fmtWeek(dateStr: string): string {
  if (!dateStr) return "";
  const [, m, dd] = dateStr.split("-");
  return `${dd}/${m}`;
}

// ─── AGGREGAZIONE SPESA SETTIMANALE ─────────────────────────────────────────
function aggregateSpending(entries: SpendEntry[], weeks: number): Record<string, number> {
  const startLimit = weeksAgo(weeks + 1);
  const map: Record<string, number> = {};

  entries.forEach(entry => {
    const { dataInizio, dataFine, spesa, tipologia, date_singole } = entry;

    // Stampa con date_singole → spesa intera nella settimana di ogni azione
    if (tipologia === "Stampa" && date_singole) {
      const dates = date_singole.split(",").map(d => d.trim()).filter(Boolean);
      const perDate = spesa / dates.length;
      dates.forEach(date => {
        if (date >= startLimit) {
          const wk = getWeekStart(date);
          map[wk] = (map[wk] || 0) + perDate;
        }
      });
      return;
    }

    // Tutti gli altri → distribuzione proporzionale sui giorni della campagna
    const allDays = dateRange(dataInizio, dataFine);
    if (allDays.length === 0) return;
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

// ─── FETCH SPESA DA SUPABASE ─────────────────────────────────────────────────
async function fetchSpending(weeks: number): Promise<SpendEntry[]> {
  const since = weeksAgo(weeks + 1);
  const data = await supabase.select(
    TABLE,
    `data_fine=gte.${since}&select=data_inizio,data_fine,spesa,tipologia,date_singole&order=data_inizio.asc`
  );
  return data || [];
}

// ─── FETCH GSC SETTIMANALE ────────────────────────────────────────────────────
async function fetchGSCWeekly(weeks: number): Promise<WeeklyGSC[]> {
  const url = new URL("/api/search-console/weekly", window.location.origin);
  url.searchParams.set("weeks", String(weeks));
  url.searchParams.set("brandKeyword", "leonori");
  const res  = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ─── TOOLTIP CUSTOM ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,.12)", minWidth: 180 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>
        Settimana dal {label}
      </p>
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

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────────────────────
export default function SpendSearchChart() {
  const WEEKS = 12;
  const [delay, setDelay] = useState(false);

  // Fetch paralleli
  const { data: gscData, loading: loadGsc } = useApiData(
    () => fetchGSCWeekly(WEEKS), []
  );
  const { data: spendData, loading: loadSpend } = useApiData(
    () => fetchSpending(WEEKS), []
  );

  // Aggrega spesa settimanale
  const spendMap = useMemo(() => {
    if (!spendData) return {};
    return aggregateSpending(spendData as SpendEntry[], WEEKS);
  }, [spendData]);

  // Costruisce il dataset per il grafico
  const chartData = useMemo(() => {
    if (!gscData) return [];

    const gscArr = gscData as WeeklyGSC[];

    // Tutte le settimane uniche (spesa + GSC)
    const allWeeks = new Set<string>([
      ...Object.keys(spendMap),
      ...gscArr.map(r => r.weekStart),
    ]);

    const sorted = Array.from(allWeeks).sort().slice(-WEEKS);

    // Mappa GSC per weekStart
    const gscMap: Record<string, WeeklyGSC> = {};
    gscArr.forEach(r => { gscMap[r.weekStart] = r; });

    return sorted.map((wk, i) => {
      const gsc = delay
        ? gscMap[sorted[i - 1]] // delay: usa dati GSC della settimana precedente
        : gscMap[wk];

      return {
        weekStart:     wk,
        label:         fmtWeek(wk),
        spesa:         Math.round((spendMap[wk] || 0) * 100) / 100,
        organicClicks: gsc?.organicClicks ?? null,
        brandClicks:   gsc?.brandClicks   ?? null,
      };
    });
  }, [gscData, spendMap, delay]);

  const loading = loadGsc || loadSpend;

  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Correlazione Spesa ↔ Ricerche
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
            Spesa settimanale vs click organici e ricerche brand · ultime {WEEKS} settimane
          </p>
        </div>

        {/* Toggle delay */}
        <button
          onClick={() => setDelay(d => !d)}
          className="btn"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", borderRadius: 8, fontSize: 12,
            background: delay ? "#1e293b" : "#f1f5f9",
            color:      delay ? "#fff"    : "#475569",
            border: "1px solid " + (delay ? "#1e293b" : "#e2e8f0"),
            transition: "all .15s ease",
          }}
        >
          <span style={{ fontSize: 14 }}>⏱</span>
          {delay ? "Delay 1 sett. attivo" : "Attiva delay 1 sett."}
        </button>
      </div>

      {loading ? (
        <div style={{ height: 320, background: "#f1f5f9", borderRadius: 8, animation: "pulse 1.5s infinite" }} />
      ) : (
        <>
          {/* Legenda assi */}
          <div style={{ display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: "#cbd5e1" }} />
              <span>Spesa (€ — asse sx)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
              <div style={{ width: 16, height: 2.5, borderRadius: 2, background: "#3b82f6" }} />
              <span>Click organici (asse dx)</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#64748b" }}>
              <div style={{ width: 16, height: 2.5, borderRadius: 2, background: "#f59e0b" }} />
              <span>Click brand "leonori" (asse dx){delay ? " — ritardato 1 sett." : ""}</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 50, bottom: 4, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                axisLine={false} tickLine={false}
              />
              {/* Asse Y sinistro — spesa € */}
              <YAxis
                yAxisId="spend"
                orientation="left"
                tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                axisLine={false} tickLine={false} width={60}
                tickFormatter={v => v >= 1000 ? `€${(v/1000).toFixed(0)}k` : `€${v}`}
              />
              {/* Asse Y destro — click */}
              <YAxis
                yAxisId="clicks"
                orientation="right"
                tick={{ fontSize: 10, fill: "#94a3b8", fontFamily: "'DM Sans', sans-serif" }}
                axisLine={false} tickLine={false} width={55}
                tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />

              {/* Barre spesa */}
              <Bar
                yAxisId="spend"
                dataKey="spesa"
                name="Spesa €"
                fill="#e2e8f0"
                radius={[3, 3, 0, 0]}
                maxBarSize={32}
              />
              {/* Linea click organici */}
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="organicClicks"
                name="Click organici"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }}
                connectNulls={false}
              />
              {/* Linea click brand */}
              <Line
                yAxisId="clicks"
                type="monotone"
                dataKey="brandClicks"
                name='Click brand "leonori"'
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Note */}
          {delay && (
            <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, textAlign: "center" }}>
              ⏱ Le ricerche mostrate sono quelle della settimana precedente rispetto alla spesa — per valutare l'effetto ritardato
            </p>
          )}
        </>
      )}
    </div>
  );
}
