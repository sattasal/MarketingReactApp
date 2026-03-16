import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { TABLE, OFFLINE_TYPES, ONLINE_TYPES, MESI } from "../lib/constants";
import { PageProps, Entry } from "../lib/types";
import {
  getMonthLabelShort, formatDate, formatEur, calcImportoRimborso, calcSpesaNetta,
  exportCSV, getEmbedUrl, mapEntryFn, downloadPianoCollettiva, getMediaColor
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { SummaryCard } from "../components/shared/SummaryCard";
import { ExportBar } from "../components/shared/ExportBar";
import { cellStyle } from "./MarketingCostsPage"; // Importiamo lo stile per le celle

// --- Componenti Interni ---

function MiniGantt({ entries, monthKey }: { entries: Entry[]; monthKey: string }) {
  const [yr, mo] = monthKey.split("-").map(Number);
  const daysInMo = new Date(yr, mo, 0).getDate();
  const days = Array.from({ length: daysInMo }, (_, i) => i + 1);
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMo).padStart(2, "0")}`;
  const vis = entries.filter(e => e.dataInizio <= monthEnd && e.dataFine >= monthStart);

  function getActive(e: Entry): Set<number> {
    const s = new Set<number>();
    if (e.tipologia === "Stampa" && e.date_singole) {
      for (const d of e.date_singole.split(",")) { if (d.startsWith(monthKey)) s.add(new Date(d + "T00:00:00").getDate()); }
      return s;
    }
    const sd = new Date(e.dataInizio + "T00:00:00") < new Date(monthStart + "T00:00:00") ? 1 : new Date(e.dataInizio + "T00:00:00").getDate();
    const ed = new Date(e.dataFine + "T00:00:00") > new Date(monthEnd + "T00:00:00") ? daysInMo : new Date(e.dataFine + "T00:00:00").getDate();
    for (let i = sd; i <= ed; i++) s.add(i);
    return s;
  }

  if (vis.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", marginTop: 10, marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 }}>📅 {MESI[mo - 1]} {yr}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 6px", textAlign: "left", fontSize: 9, color: "#94a3b8", minWidth: 120 }}>Azione</th>
            {days.map(d => <th key={d} style={{ padding: "2px 1px", textAlign: "center", fontSize: 8, color: "#94a3b8", minWidth: 16 }}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {vis.map(e => {
            const active = getActive(e);
            const color = getMediaColor(e.tipologia);
            return (
              <tr key={e.id}>
                <td style={{ padding: "2px 6px", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, marginRight: 4 }} />{e.tipologia}
                </td>
                {days.map(d => (
                  <td key={d} style={{ padding: 0, height: 18 }}>
                    {active.has(d) && <div style={{ background: color, height: "100%", minHeight: 16 }} />}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Pagina Principale ---

export default function CollettivePage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterNome, setFilterNome] = useState<string>("all");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mapEntry, setMapEntry] = useState<Entry | null>(null);

  useEffect(() => {
    supabase.select(TABLE, "collettiva=eq.true&order=data_inizio.asc")
      .then(data => setEntries(data.map(mapEntryFn)))
      .finally(() => setLoading(false));
  }, []);

  const availableYears = Array.from(new Set(entries.map(e => e.meseCompetenza.split("-")[0]))).sort().reverse();
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  const availableNomi = Array.from(new Set(entries.map(e => e.nome_collettiva || "Senza nome"))).sort();

  const filtered = entries.filter(e => {
    if (filterYear !== "all" && !e.meseCompetenza.startsWith(filterYear)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    if (filterNome !== "all" && (e.nome_collettiva || "Senza nome") !== filterNome) return false;
    return true;
  });

  const groups = Array.from(new Set(filtered.map(e => e.nome_collettiva || "Senza nome"))).sort();

  if (loading) return <div>Caricamento...</div>;

  return (
    <PageShell toast={null}>
      <NavBar current="collettive" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>🤝 Collettive</h1>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 24, border: "1px solid #e8ecf1", display: "flex", gap: 16 }}>
        <select value={filterNome} onChange={e => setFilterNome(e.target.value)} style={inputStyle}><option value="all">Tutte le collettive</option>{availableNomi.map(n => <option key={n}>{n}</option>)}</select>
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={inputStyle}><option value="all">Tutti i brand</option>{availableBrands.map(b => <option key={b}>{b}</option>)}</select>
      </div>

      <ExportBar onCSV={() => {}} onPrint={() => window.print()} />

      {groups.map(groupName => {
        const ge = filtered.filter(e => (e.nome_collettiva || "Senza nome") === groupName);
        const groupMonths = Array.from(new Set(ge.map(e => e.meseCompetenza))).sort();
        return (
          <div key={groupName} style={{ marginBottom: 24, background: "#fff", border: "1px solid #e8ecf1", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{groupName}</h2>
              <button className="btn" onClick={() => downloadPianoCollettiva(groupName, ge)} style={{ background: "#7c3aed", color: "#fff", padding: "4px 10px", borderRadius: 6 }}>📥 Scarica Piano</button>
            </div>
            
            {groupMonths.map(mk => <MiniGantt key={mk} entries={ge} monthKey={mk} />)}
            
            <table style={{ width: "100%", marginTop: 16, borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {ge.map(e => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={cellStyle}>{e.descrizione}</td>
                    <td style={cellStyle}>{e.brand}</td>
                    <td style={{ ...cellStyle, textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatEur(calcSpesaNetta(e))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Totale Spesa Netta" value={filtered.reduce((s, e) => s + calcSpesaNetta(e), 0)} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" />
      </div>
    </PageShell>
  );
}