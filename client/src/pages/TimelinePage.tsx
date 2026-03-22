import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { TABLE } from "../lib/constants";
import { PageProps, Entry } from "../lib/types";
import {
  getCurrentMonthKey, getMonthLabel, formatDate, exportCSV,
  getBrandColor, getMediaColor, mapEntryFn
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";

const DIGITAL_ADV_EXCLUDED = ["Meta", "Google", "Portali"];

export default function TimelinePage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthKey());
  const ganttRef = useRef<HTMLDivElement>(null);

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const availableMonths = Array.from(new Set(entries.map(e => e.meseCompetenza))).sort().reverse();
  if (!availableMonths.includes(getCurrentMonthKey())) availableMonths.unshift(getCurrentMonthKey());

  const [selYear, selMon] = filterMonth.split("-").map(Number);
  const daysInMonth = new Date(selYear, selMon, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthStart = `${filterMonth}-01`;
  const monthEnd = `${filterMonth}-${String(daysInMonth).padStart(2, "0")}`;

  const allInMonth = entries.filter(e => e.dataInizio <= monthEnd && e.dataFine >= monthStart);

  // Digital Adv escluse dalla timeline (sempre evergreen per definizione)
  const excluded = allInMonth.filter(e =>
    e.tipologia === "Digital Adv" && DIGITAL_ADV_EXCLUDED.includes(e.piattaforma)
  );
  const inTimeline = allInMonth.filter(e =>
    !(e.tipologia === "Digital Adv" && DIGITAL_ADV_EXCLUDED.includes(e.piattaforma))
  );

  function getActiveDays(e: Entry): Set<number> {
    const active = new Set<number>();
    if (e.tipologia === "Stampa" && e.date_singole) {
      for (const d of e.date_singole.split(","))
        if (d.startsWith(filterMonth)) active.add(new Date(d + "T00:00:00").getDate());
      return active;
    }
    const s = new Date(e.dataInizio + "T00:00:00");
    const en = new Date(e.dataFine + "T00:00:00");
    const ms = new Date(monthStart + "T00:00:00");
    const me = new Date(monthEnd + "T00:00:00");
    const startDay = s < ms ? 1 : s.getDate();
    const endDay = en > me ? daysInMonth : en.getDate();
    for (let i = startDay; i <= endDay; i++) active.add(i);
    return active;
  }

  // Evergreen: coprono tutti i giorni del mese
  const evergreen = inTimeline.filter(e => getActiveDays(e).size === daysInMonth);
  const evergreenIds = new Set(evergreen.map(e => e.id));
  const timedEntries = inTimeline.filter(e => !evergreenIds.has(e.id));

  const sectionMyUsato = timedEntries
    .filter(e => e.brand === "MyUsato")
    .sort((a, b) => a.tipologia.localeCompare(b.tipologia, "it"));

  const sectionVaigo = timedEntries
    .filter(e => e.brand === "Vaigo")
    .sort((a, b) => a.tipologia.localeCompare(b.tipologia, "it"));

  const sectionVendita = timedEntries
    .filter(e => e.brand !== "MyUsato" && e.brand !== "Vaigo")
    .sort((a, b) => {
      const bc = a.brand.localeCompare(b.brand, "it");
      return bc !== 0 ? bc : a.tipologia.localeCompare(b.tipologia, "it");
    });

  const handleExportCSV = () => {
    const h = ["Sezione", "Tipologia", "Soggetto", "Brand", "Data Inizio", "Data Fine", "Descrizione"];
    const rows = [
      ...sectionMyUsato.map(e => ["MyUsato", e.tipologia, e.soggetto||"", e.brand, formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione]),
      ...sectionVaigo.map(e => ["Vaigo", e.tipologia, e.soggetto||"", e.brand, formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione]),
      ...sectionVendita.map(e => ["Vendita Nuovo", e.tipologia, e.soggetto||"", e.brand, formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione]),
    ];
    exportCSV("timeline.csv", h, rows);
  };

  const handleDownloadJPEG = async () => {
    if (!ganttRef.current) return;
    try {
      if (!(window as any).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Errore caricamento html2canvas"));
          document.head.appendChild(script);
        });
      }
      const el = ganttRef.current;
      const canvas = await (window as any).html2canvas(el, {
        scale: 2, useCORS: true, backgroundColor: "#ffffff",
        scrollX: 0, scrollY: 0, width: el.scrollWidth, height: el.scrollHeight, windowWidth: el.scrollWidth,
      });
      const link = document.createElement("a");
      link.download = `timeline_${filterMonth}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (e) { console.error(e); alert("Errore esportazione. Riprova."); }
  };

  const brandsInView = Array.from(new Set(timedEntries.map(e => e.brand))).sort();

  const SECTIONS = [
    { title: "MyUsato", entries: sectionMyUsato, color: "#7c3aed" },
    { title: "Vaigo", entries: sectionVaigo, color: "#0284c7" },
    { title: "Vendita Nuovo", entries: sectionVendita, color: "#059669" },
  ];

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", fontFamily:"'DM Sans',sans-serif", color:"#6b7280" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:28, marginBottom:8 }}>⏳</div><div>Caricamento...</div></div></div>;

  return (
    <PageShell toast={null}>
      <NavBar current="timeline" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📅 Timeline Iniziative</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Visualizzazione Gantt delle azioni marketing</p>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 20, border: "1px solid #e8ecf1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🗓 Mese:</span>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 12px", fontSize: 13 }}>
          {availableMonths.map(m => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{timedEntries.length} iniziative in timeline</span>
      </div>

      {/* Attività evergreen */}
      {(evergreen.length > 0 || excluded.length > 0) && (
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 16px", marginBottom: 16, border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: "#334155", marginRight: 6 }}>🔁 Attivi tutto il mese:</span>
          {[
            ...evergreen.map(e => `${e.tipologia}${e.soggetto ? " · " + e.soggetto : ""} (${e.brand})`),
            ...excluded.map(e => `Digital Adv ${e.piattaforma}${e.soggetto ? " · " + e.soggetto : ""} (${e.brand})`),
          ].join(", ") || "—"}
        </div>
      )}

      {/* Legenda brand */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 20, border: "1px solid #e8ecf1" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 8 }}>Legenda Brand</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {brandsInView.map(b => (
            <div key={b} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 16, height: 16, borderRadius: 3, background: getBrandColor(b), flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>{b}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn" onClick={handleExportCSV} style={{ background: "#059669", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>📥 Esporta Excel (CSV)</button>
        <button className="btn" onClick={handleDownloadJPEG} style={{ background: "#0ea5e9", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>🖼 Scarica JPEG</button>
      </div>

      <div ref={ganttRef} style={{ display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)", border: "1px solid #e8ecf1" }}>
        {SECTIONS.filter(s => s.entries.length > 0).map(({ title, entries: se, color }, si) => (
          <div key={title}>
            {si > 0 && <div style={{ height: 1, background: "#e8ecf1" }} />}
            <div style={{ background: color, padding: "6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: ".5px" }}>{title}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,.7)" }}>{se.length} azioni</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#1e293b" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#fff", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px", position: "sticky", left: 0, background: "#1e293b", zIndex: 2, minWidth: 200 }}>Media / Soggetto</th>
                    {days.map(d => <th key={d} style={{ padding: "8px 2px", textAlign: "center", color: "#cbd5e1", fontWeight: 500, fontSize: 10, minWidth: 28, borderLeft: "1px solid #334155" }}>{d}</th>)}
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#fff", fontWeight: 600, fontSize: 10, textTransform: "uppercase", minWidth: 160 }}>Descrizione</th>
                  </tr>
                </thead>
                <tbody>
                  {se.map(e => {
                    const activeDays = getActiveDays(e);
                    const entryColor = getBrandColor(e.brand);
                    const abbr = e.brand.slice(0, 2).toUpperCase();
                    const isStampa = e.tipologia === "Stampa" && !!e.date_singole;
                    const mediaLabel = e.tipologia + (e.soggetto ? ` · ${e.soggetto}` : "");
                    return (
                      <tr key={e.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200, position: "sticky", left: 0, background: "#fff", zIndex: 1 }} title={mediaLabel}>
                          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: getMediaColor(e.tipologia), marginRight: 4, verticalAlign: "middle" }} />
                          <strong>{e.tipologia}</strong>{e.soggetto ? <span style={{ fontWeight: 400, color: "#64748b" }}> · {e.soggetto}</span> : ""}
                        </td>
                        {days.map(d => {
                          const isActive = activeDays.has(d);
                          return (
                            <td key={d} style={{ padding: 0, borderLeft: "1px solid #f1f5f9", height: 28 }}>
                              {isActive && <div style={{ background: entryColor, height: "100%", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, letterSpacing: ".05em", borderRadius: isStampa ? 4 : 0 }}>{abbr}</div>}
                            </td>
                          );
                        })}
                        <td style={{ padding: "6px 10px", fontSize: 10, color: "#64748b", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>{e.descrizione}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {timedEntries.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nessuna iniziativa nel mese selezionato</div>
        )}
      </div>
    </PageShell>
  );
}
