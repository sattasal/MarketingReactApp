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
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem("pianiextra_collapsed"); return s ? new Set(JSON.parse(s)) : new Set(); }
    catch { return new Set(); }
  });

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("pianiextra_collapsed", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

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
        const isCollapsed = collapsed.has(brandName);
        return (
          <div key={brandName} style={{ marginBottom: 16, background: "#fff", border: "1px solid #e8ecf1", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", background: isCollapsed ? "#f8fafc" : "#fff", borderBottom: isCollapsed ? "none" : "1px solid #e8ecf1" }} onClick={() => toggleCollapse(brandName)}>
              <span style={{ fontSize: 13, color: "#94a3b8", transition: "transform .2s", display: "inline-block", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📌 {brandName}</h2>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>{ge.length} azioni</span>
            </div>
            {!isCollapsed && (
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
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Totale Spesa Netta" value={filtered.reduce((s, e) => s + calcSpesaNetta(e), 0)} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" />
      </div>
    </PageShell>
  );
}