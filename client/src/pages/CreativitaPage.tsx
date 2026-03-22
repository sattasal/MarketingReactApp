import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { TABLE, OFFLINE_TYPES } from "../lib/constants";
import { PageProps, Entry } from "../lib/types";
import {
  getCurrentMonthKey, getMonthLabel, formatDate, formatEur, exportCSV,
  getBrandColor, isImageUrl, parseCreativitaFiles, mapEntryFn
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { ExportBar } from "../components/shared/ExportBar";

export default function CreativitaPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthKey());
  const [filterTipologia, setFilterTipologia] = useState<string>("all");

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "order=data_inizio.desc"); setEntries(data.map(mapEntryFn)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const imageEntries = entries.filter(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).some(f => isImageUrl(f.url)));
  const availableBrands = Array.from(new Set(imageEntries.map(e => e.brand))).sort();
  const availableMonths = Array.from(new Set(imageEntries.map(e => e.meseCompetenza))).sort().reverse();
  const availableTipologie = Array.from(new Set(imageEntries.map(e => e.tipologia))).sort();

  useEffect(() => {
    if (!loading && imageEntries.length > 0 && filterMonth !== "all") {
      const hasData = imageEntries.some(e => e.meseCompetenza === filterMonth);
      if (!hasData) setFilterMonth(availableMonths[0] || "all");
    }
  }, [loading, imageEntries.length]);

  const filtered = imageEntries
    .filter(e => {
      if (filterBrand !== "all" && e.brand !== filterBrand) return false;
      if (filterMonth !== "all" && e.meseCompetenza !== filterMonth) return false;
      if (filterTipologia !== "all" && e.tipologia !== filterTipologia) return false;
      return true;
    })
    .sort((a, b) => {
      const monthCmp = b.meseCompetenza.localeCompare(a.meseCompetenza);
      if (monthCmp !== 0) return monthCmp;
      return a.brand.localeCompare(b.brand);
    });

  const handleExportCSV = () => {
    const h = ["Brand", "Tipologia", "Descrizione", "Soggetto", "Data Inizio", "Data Fine", "Spesa", "File URL"];
    const r = filtered.map(e => [e.brand, e.tipologia, e.descrizione, e.soggetto, formatDate(e.dataInizio), formatDate(e.dataFine), Math.round(e.spesa).toString(), parseCreativitaFiles(e.creativita_url, e.creativita_nome).map(f => f.url).join(" | ")]);
    exportCSV("creativita.csv", h, r);
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  return (
    <PageShell toast={null}>
      <NavBar current="creativita" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>🖼 Galleria Creatività</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>{filtered.flatMap(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).filter(f => isImageUrl(f.url))).length} immagini · {filtered.length} iniziative</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 20, border: "1px solid #e8ecf1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🔍 Filtri:</span>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, background: filterMonth !== "all" ? "#eff6ff" : undefined }}>
          <option value="all">Tutti i mesi</option>
          {availableMonths.map(m => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
        </select>
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, background: filterBrand !== "all" ? "#eff6ff" : undefined }}>
          <option value="all">Tutti i brand</option>
          {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={filterTipologia} onChange={e => setFilterTipologia(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, background: filterTipologia !== "all" ? "#eff6ff" : undefined }}>
          <option value="all">Tutte le tipologie</option>
          {availableTipologie.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <ExportBar onCSV={handleExportCSV} onPrint={() => window.print()} />

      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", color: "#94a3b8", border: "1px solid #e8ecf1" }}>Nessuna creatività con immagine trovata</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {filtered.flatMap(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).filter(f => isImageUrl(f.url)).map((f, fi) => (
            <div key={e.id + "-" + fi} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1", boxShadow: "0 2px 8px rgba(0,0,0,.04)", transition: "box-shadow .2s" }}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative", paddingBottom: "62%", background: "#f1f5f9", overflow: "hidden" }}>
                <img src={f.url} alt={e.descrizione} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
              <div style={{ padding: "12px 16px 0" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ background: getBrandColor(e.brand), color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{e.brand}</span>
                  <span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : "#dbeafe", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : "#1e40af", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{e.tipologia}</span>
                  {e.piano_extra && <span style={{ background: "#f3e8ff", color: "#7c3aed", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>EXTRA</span>}
                  {e.collettiva && <span style={{ background: "#ecfdf5", color: "#059669", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>COLL</span>}
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 4px", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{e.descrizione}</h3>
                {f.nome && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 4px" }}>{f.nome}</p>}
                {e.soggetto && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>{e.soggetto}</p>}
              </div>
              <div style={{ padding: "8px 16px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f1f5f9", marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatDate(e.dataInizio)} → {formatDate(e.dataFine)}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{formatEur(e.spesa)}</span>
              </div>
            </div>
          )))}
        </div>
      )}
    </PageShell>
  );
}