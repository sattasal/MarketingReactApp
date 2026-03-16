import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { TABLE } from "../lib/constants";
import { PageProps, Entry } from "../lib/types";
import {
  getMonthLabelShort, formatDate, formatEur, calcImportoRimborso, calcSpesaNetta,
  exportCSV, mapEntryFn
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { SummaryCard } from "../components/shared/SummaryCard";
import { ExportBar } from "../components/shared/ExportBar";
import { cellStyle } from "./MarketingCostsPage";

export default function PianiExtraPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");

  useEffect(() => {
    supabase.select(TABLE, "piano_extra=eq.true&order=data_inizio.asc")
      .then(data => setEntries(data.map(mapEntryFn)))
      .finally(() => setLoading(false));
  }, []);

  const availableYears = Array.from(new Set(entries.map(e => e.meseCompetenza.split("-")[0]))).sort().reverse();
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();

  const filtered = entries.filter(e => {
    if (filterYear !== "all" && !e.meseCompetenza.startsWith(filterYear)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    return true;
  });

  const groups = Array.from(new Set(filtered.map(e => e.brand))).sort();

  if (loading) return <div>Caricamento...</div>;

  return (
    <PageShell toast={null}>
      <NavBar current="piani-extra" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📌 Piani Extra</h1>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 24, border: "1px solid #e8ecf1", display: "flex", gap: 16 }}>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={inputStyle}><option value="all">Tutti gli anni</option>{availableYears.map(y => <option key={y}>{y}</option>)}</select>
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={inputStyle}><option value="all">Tutti i brand</option>{availableBrands.map(b => <option key={b}>{b}</option>)}</select>
      </div>

      <ExportBar onCSV={() => {}} onPrint={() => window.print()} />

      {groups.map(brandName => {
        const ge = filtered.filter(e => e.brand === brandName);
        return (
          <div key={brandName} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>📌 {brandName}</h2>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <tbody>
                  {ge.map(e => (
                    <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={cellStyle}>{getMonthLabelShort(e.meseCompetenza)}</td>
                      <td style={cellStyle}>{e.descrizione}</td>
                      <td style={{ ...cellStyle, textAlign: "right" }}>{formatEur(e.spesa)}</td>
                      <td style={{ ...cellStyle, textAlign: "right", color: "#059669", fontWeight: 600 }}>{formatEur(calcSpesaNetta(e))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Totale Spesa Netta" value={filtered.reduce((s, e) => s + calcSpesaNetta(e), 0)} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" />
      </div>
    </PageShell>
  );
}