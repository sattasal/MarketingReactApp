import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { TABLE } from "../lib/constants";
import { PageProps, Entry } from "../lib/types";
import {
  getMonthLabelShort, formatDate, formatEur, exportCSV,
  getEmbedUrl, parseCreativitaFiles, mapEntryFn
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { SummaryCard } from "../components/shared/SummaryCard";
import { ExportBar } from "../components/shared/ExportBar";

const cellStyle: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

export default function OOHDetailPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [mapEntry, setMapEntry] = useState<Entry | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      const data = await supabase.select(TABLE, "tipologia=eq.OOH&order=data_inizio.desc");
      setEntries(data.map(mapEntryFn));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const availableYears = Array.from(new Set(entries.map(e => e.meseCompetenza.split("-")[0]))).sort().reverse();
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  
  const filtered = entries.filter(e => {
    if (filterYear !== "all" && !e.meseCompetenza.startsWith(filterYear)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    return true;
  });

  const toggleRow = (id: string) => { setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const base = selectedRows.size > 0 ? filtered.filter(e => selectedRows.has(e.id)) : filtered;
  const totSpesa = base.reduce((s, e) => s + e.spesa, 0);
  const totPoster3x2 = base.reduce((s, e) => s + e.poster_3x2, 0);
  const totPosterAltri = base.reduce((s, e) => s + e.poster_altri, 0);
  const totPosterMaxi = base.reduce((s, e) => s + e.poster_maxi, 0);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  return (
    <PageShell toast={toast}>
      <NavBar current="ooh" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>🏙 Campagne OOH</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Tutte le campagne Out Of Home inserite dalla schermata Costi Marketing</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 24, border: "1px solid #e8ecf1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🔍 Filtri:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Anno:</span>
          <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setSelectedRows(new Set()); }} style={{ ...inputStyle, width: "auto", padding: "5px 10px", fontSize: 13 }}><option value="all">Tutti</option>{availableYears.map(y => <option key={y} value={y}>{y}</option>)}</select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Brand:</span>
          <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setSelectedRows(new Set()); }} style={{ ...inputStyle, width: "auto", padding: "5px 10px", fontSize: 13 }}><option value="all">Tutti</option>{availableBrands.map(b => <option key={b} value={b}>{b}</option>)}</select>
        </div>
      </div>

      <ExportBar
        onCSV={() => {
          const h = ["Mese", "Data Inizio", "Data Fine", "Descrizione", "Brand", "Poster 3x2", "Poster altri", "Poster maxi", "Totale poster", "Spesa", "Mappa URL"];
          const r = filtered.map(e => [getMonthLabelShort(e.meseCompetenza), formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione, e.brand, String(e.poster_3x2), String(e.poster_altri), String(e.poster_maxi), String(e.poster_3x2 + e.poster_altri + e.poster_maxi), Math.round(e.spesa).toString(), e.mappa_url || ""]);
          exportCSV("campagne-ooh.csv", h, r);
        }}
        onPrint={() => window.print()}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Totale Spesa" value={totSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
        <div style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", borderRadius: 14, padding: "20px 24px", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.7)", marginBottom: 8 }}>🗂 POSTER TOTALI</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{totPoster3x2}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>3x2</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{totPosterAltri}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>Altri</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{totPosterMaxi}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>Maxi</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{totPoster3x2 + totPosterAltri + totPosterMaxi}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>Totale</div></div>
          </div>
        </div>
      </div>

      {mapEntry && mapEntry.mappa_url && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setMapEntry(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 800, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e8ecf1" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>📍 Mappa — {mapEntry.descrizione}</h3>
                <span style={{ fontSize: 12, color: "#64748b" }}>{mapEntry.brand} · {formatDate(mapEntry.dataInizio)} → {formatDate(mapEntry.dataFine)}</span>
              </div>
              <button className="btn" onClick={() => setMapEntry(null)} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <iframe src={getEmbedUrl(mapEntry.mappa_url!)} width="100%" height="450" style={{ border: 0, borderRadius: 10 }} allowFullScreen loading="lazy" />
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)", border: "1px solid #e8ecf1" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "12px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={filtered.length > 0 && filtered.every(e => selectedRows.has(e.id))} onChange={() => { if (selectedRows.size === filtered.length) setSelectedRows(new Set()); else setSelectedRows(new Set(filtered.map(e => e.id))); }} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                </th>
                {["Mese", "Periodo", "Descrizione", "Brand", "3x2", "Altri", "Maxi", "Tot.", "Spesa", "Mappa", "File"].map((h, i) => (
                  <th key={i} style={{ padding: "12px 8px", textAlign: i >= 4 && i <= 8 ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nessuna campagna OOH.</td></tr>
              ) : filtered.map(e => {
                const tot = e.poster_3x2 + e.poster_altri + e.poster_maxi;
                return (
                  <tr key={e.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9", background: selectedRows.has(e.id) ? "#eff6ff" : "transparent" }}>
                    <td style={{ ...cellStyle, textAlign: "center", width: 36 }}><input type="checkbox" checked={selectedRows.has(e.id)} onChange={() => toggleRow(e.id)} style={{ accentColor: "#3b82f6", cursor: "pointer" }} /></td>
                    <td style={cellStyle}><span style={{ fontSize: 11 }}>{getMonthLabelShort(e.meseCompetenza)}</span></td>
                    <td style={cellStyle}><span style={{ fontSize: 11 }}>{formatDate(e.dataInizio)}<br/>{formatDate(e.dataFine)}</span></td>
                    <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>
                      {e.descrizione}
                      {e.collettiva && <span style={{ background: "#ecfdf5", color: "#059669", padding: "0 4px", borderRadius: 3, fontSize: 8, fontWeight: 700, marginLeft: 4 }}>CO</span>}
                    </td>
                    <td style={{ ...cellStyle, fontWeight: 600, fontSize: 12 }}>{e.brand}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{e.poster_3x2 || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{e.poster_altri || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{e.poster_maxi || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12 }}>{tot || "—"}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12 }}>{formatEur(e.spesa)}</td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      {e.mappa_url ? <button className="btn" onClick={() => setMapEntry(e)} style={{ background: "#dbeafe", color: "#1e40af", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>📍</button> : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </td>
                    <td style={{ ...cellStyle, textAlign: "center" }}>
                      {e.fattura_url && <a href={e.fattura_url} target="_blank" rel="noopener noreferrer" title={e.fattura_nome || "Fattura"} style={{ fontSize: 14 }}>📄</a>}
                      {parseCreativitaFiles(e.creativita_url, e.creativita_nome).map((f, fi) => <a key={fi} href={f.url} target="_blank" rel="noopener noreferrer" title={f.nome || "Creatività"} style={{ fontSize: 14, marginLeft: 4 }}>🖼</a>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}