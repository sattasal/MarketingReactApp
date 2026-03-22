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

type ViewMode = "grid" | "list";

export default function CreativitaPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthKey());
  const [filterTipologia, setFilterTipologia] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  // Flat list of all image+entry pairs
  const allImages = filtered.flatMap(e =>
    parseCreativitaFiles(e.creativita_url, e.creativita_nome)
      .filter(f => isImageUrl(f.url))
      .map((f, fi) => ({ e, f, key: e.id + "-" + fi }))
  );

  const handleExportCSV = () => {
    const h = ["Brand", "Tipologia", "Descrizione", "Soggetto", "Data Inizio", "Data Fine", "Spesa", "File URL"];
    const r = filtered.map(e => [e.brand, e.tipologia, e.descrizione, e.soggetto, formatDate(e.dataInizio), formatDate(e.dataFine), Math.round(e.spesa).toString(), parseCreativitaFiles(e.creativita_url, e.creativita_nome).map(f => f.url).join(" | ")]);
    exportCSV("creativita.csv", h, r);
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  return (
    <PageShell toast={null}>
      <NavBar current="creativita" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setLightboxUrl(null)}
        >
          <button onClick={() => setLightboxUrl(null)} style={{ position: "absolute", top: 20, right: 24, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", fontSize: 22, borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          <img
            src={lightboxUrl}
            alt="Anteprima"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "88vh", borderRadius: 10, boxShadow: "0 24px 60px rgba(0,0,0,.6)", objectFit: "contain" }}
          />
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>🖼 Galleria Creatività</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>{allImages.length} immagini · {filtered.length} iniziative</p>
      </div>

      {/* Filtri + toggle vista */}
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
        {/* Toggle vista */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 8, padding: 3 }}>
          {(["grid", "list"] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ background: viewMode === v ? "#fff" : "transparent", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: viewMode === v ? "#0f172a" : "#94a3b8", cursor: "pointer", boxShadow: viewMode === v ? "0 1px 3px rgba(0,0,0,.1)" : "none", transition: "all .15s" }}>
              {v === "grid" ? "⊞ Griglia" : "☰ Lista"}
            </button>
          ))}
        </div>
      </div>

      <ExportBar onCSV={handleExportCSV} onPrint={() => window.print()} />

      {allImages.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", color: "#94a3b8", border: "1px solid #e8ecf1" }}>Nessuna creatività con immagine trovata</div>
      ) : viewMode === "grid" ? (
        /* ── VISTA GRIGLIA ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {allImages.map(({ e, f, key }) => (
            <div key={key} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1", boxShadow: "0 2px 8px rgba(0,0,0,.04)" }}>
              <div style={{ position: "relative", paddingBottom: "62%", background: "#f1f5f9", overflow: "hidden" }}>
                <img src={f.url} alt={e.descrizione} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <button onClick={() => setLightboxUrl(f.url)} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.5)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 8px", fontSize: 11, cursor: "pointer", backdropFilter: "blur(4px)" }}>🔍 Ingrandisci</button>
              </div>
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
          ))}
        </div>
      ) : (
        /* ── VISTA LISTA ── */
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "80px" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "80px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Anteprima", "Brand", "Tipo", "Descrizione", "Soggetto", "Periodo", "Spesa", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 12px", textAlign: i === 6 ? "right" : "left", fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".3px", borderBottom: "2px solid #e8ecf1" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allImages.map(({ e, f, key }) => (
                <tr key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  {/* Thumbnail */}
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ width: 56, height: 40, borderRadius: 6, overflow: "hidden", background: "#f1f5f9", flexShrink: 0 }}>
                      <img src={f.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: getBrandColor(e.brand), color: "#fff", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>{e.brand}</span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : "#dbeafe", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : "#1e40af", padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap" }}>{e.tipologia}</span>
                  </td>
                  <td style={{ padding: "8px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, color: "#0f172a" }} title={e.descrizione}>{e.descrizione}</td>
                  <td style={{ padding: "8px 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#64748b" }}>{e.soggetto || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{formatDate(e.dataInizio)}<br />{formatDate(e.dataFine)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap" }}>{formatEur(e.spesa)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>
                    <button onClick={() => setLightboxUrl(f.url)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "4px 8px", fontSize: 12, cursor: "pointer", color: "#475569" }} title="Ingrandisci">🔍</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
