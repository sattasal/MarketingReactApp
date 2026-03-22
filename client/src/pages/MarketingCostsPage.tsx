import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { MAX_FILE_SIZE, STORAGE_BUCKET, TABLE, TIPOLOGIE, BRANDS, OFFLINE_TYPES, ONLINE_TYPES, MESI, emptyForm, today } from "../lib/constants";
import { PageProps, Entry, CsvImportRow } from "../lib/types";
import {
  parseCreativitaFiles, isImageUrl, getMediaColor, getMonthKey, getMonthLabel,
  getMonthLabelShort, getCurrentMonthKey, formatEur, formatDate, formatFileSize,
  calcImportoRimborso, calcSpesaNetta, exportCSV, processMetaCSV, processGoogleCSV, metaParseBrandModel, googleBrandFromAccount, googleModelFromCampaign, mapEntryFn
} from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { SummaryCard } from "../components/shared/SummaryCard";
import { ExportBar } from "../components/shared/ExportBar";
import { Field } from "../components/shared/Field";

export const cellStyle: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

// --- Modali e Componenti Interni ---

export function StampaCalendar({ selected, onChange, baseMonth }: { selected: string[]; onChange: (dates: string[]) => void; baseMonth: string }) {
  const [viewMonth, setViewMonth] = useState(baseMonth || getCurrentMonthKey());
  const [yr, mo] = viewMonth.split("-").map(Number);
  const daysInMo = new Date(yr, mo, 0).getDate();
  const firstDow = new Date(yr, mo - 1, 1).getDay();
  const adjDow = firstDow === 0 ? 6 : firstDow - 1;

  const toggleDate = (d: number) => {
    const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(selected.includes(iso) ? selected.filter(x => x !== iso) : [...selected, iso].sort());
  };

  const prevMonth = () => { const nm = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, "0")}`; setViewMonth(nm); };
  const nextMonth = () => { const nm = mo === 12 ? `${yr + 1}-01` : `${yr}-${String(mo + 1).padStart(2, "0")}`; setViewMonth(nm); };

  const cells: (number | null)[] = [...Array(adjDow).fill(null), ...Array.from({ length: daysInMo }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <button className="btn" onClick={prevMonth} style={{ background: "#e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>◀</button>
        <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{MESI[mo - 1]} {yr}</span>
        <button className="btn" onClick={nextMonth} style={{ background: "#e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: 6, fontSize: 12 }}>▶</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, textAlign: "center" }}>
        {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "4px 0", textTransform: "uppercase" }}>{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = selected.includes(iso);
          return (
            <div key={d} onClick={() => toggleDate(d)} style={{
              width: 32, height: 32, lineHeight: "32px", borderRadius: 8, fontSize: 13, fontWeight: isSelected ? 700 : 400, cursor: "pointer", margin: "0 auto",
              background: isSelected ? "#2563eb" : "transparent", color: isSelected ? "#fff" : "#334155", border: isSelected ? "none" : "1px solid transparent", transition: "all .1s",
            }} onMouseEnter={e => { if (!isSelected) (e.target as HTMLElement).style.background = "#dbeafe"; }} onMouseLeave={e => { if (!isSelected) (e.target as HTMLElement).style.background = "transparent"; }}>{d}</div>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {selected.sort().map(d => (
            <span key={d} style={{ background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3 }}>
              {formatDate(d)}<span onClick={ev => { ev.stopPropagation(); onChange(selected.filter(x => x !== d)); }} style={{ cursor: "pointer", opacity: .6, fontSize: 9 }}>✕</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const importoRimb = calcImportoRimborso(entry);
  const spesaNetta = calcSpesaNetta(entry);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 600, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)", padding: "28px 32px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>📋 Dettaglio iniziativa</h2>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
        </div>
        {[
          ["Mese competenza", getMonthLabel(entry.meseCompetenza)],
          ["Periodo", `${formatDate(entry.dataInizio)} → ${formatDate(entry.dataFine)}`],
          ...(entry.date_singole ? [["Date uscita stampa", entry.date_singole.split(",").map(d => formatDate(d)).join(", ")]] : []),
          ["Descrizione", entry.descrizione],
          ["Tipologia", entry.tipologia],
          ["Brand", entry.brand],
          ["Soggetto", entry.soggetto || "—"],
          ["Spesa", formatEur(entry.spesa)],
          ["Rimborso %", entry.rimborso_pct ? `${entry.rimborso_pct}%` : "—"],
          ["Costo dichiarato", entry.costo_dichiarato ? formatEur(entry.costo_dichiarato) : "—"],
          ["Importo rimborso", importoRimb > 0 ? formatEur(importoRimb) : "—"],
          ["Spesa netta", formatEur(spesaNetta)],
          ["Numero partecipanti", entry.collettiva ? entry.numero_partecipanti.toString() : "—"],
          ["Piano Extra", entry.piano_extra ? "✅ Sì" : "No"],
          ["Collettiva", entry.collettiva ? `✅ ${entry.nome_collettiva || "Sì"}` : "No"],
          ["Stato", entry.da_confermare ? "✅ Confermata" : "⏳ Da confermare"],
          ...(entry.tipologia === "OOH" ? [
            ["Poster 3x2", entry.poster_3x2.toString()], ["Poster altri", entry.poster_altri.toString()], ["Poster maxi", entry.poster_maxi.toString()],
            ["Totale poster", (entry.poster_3x2 + entry.poster_altri + entry.poster_maxi).toString()],
          ] : []),
          ...(entry.fattura_url ? [["Fattura", entry.fattura_nome || "PDF"]] : []),
        ].map(([label, value], i) => (
          <div key={i} style={{ display: "flex", borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
            <span style={{ width: 160, flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontSize: 14, color: "#1e293b", wordBreak: "break-word" }}>{value}</span>
          </div>
        ))}
        {(() => {
          const files = parseCreativitaFiles(entry.creativita_url, entry.creativita_nome);
          return files.length > 0 ? (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {files.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: isImageUrl(f.url) ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "#f1f5f9", color: isImageUrl(f.url) ? "#fff" : "#2563eb", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                  {isImageUrl(f.url) ? "🖼" : "📎"} {f.nome || "File " + (i + 1)}
                </a>
              ))}
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
}

function CsvImportModal({ rows, onConfirm, onClose, saving, title, existingEntries }: { rows: CsvImportRow[]; onConfirm: (rows: CsvImportRow[]) => void; onClose: () => void; saving: boolean; title?: string; existingEntries?: Entry[]; }) {
  const modalTitle = title || "📊 Importa CSV";
  const [importRows, setImportRows] = useState<CsvImportRow[]>(rows);
  const toggleRow = (i: number) => setImportRows(prev => prev.map((r, idx) => idx === i ? { ...r, selected: !r.selected } : r));
  const toggleAll = () => { const allOn = importRows.every(r => r.selected); setImportRows(prev => prev.map(r => ({ ...r, selected: !allOn }))); };
  const setMerge = (i: number, id: string) => setImportRows(prev => prev.map((r, idx) => idx === i ? { ...r, mergeWithId: id || undefined } : r));
  const selCount = importRows.filter(r => r.selected).length;
  const selTotal = importRows.filter(r => r.selected).reduce((s, r) => s + r.spesa, 0);
  const periodo = rows.length > 0 ? `${formatDate(rows[0].dataInizio)} → ${formatDate(rows[0].dataFine)}` : "";

  const getCandidates = (row: CsvImportRow): Entry[] => {
    if (!existingEntries) return [];
    const mese = getMonthKey(row.dataInizio);
    return existingEntries.filter(e => e.tipologia === "Digital Adv" && e.piattaforma === row.piattaforma && e.brand === row.brand && e.meseCompetenza === mese);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 960, width: "100%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #e8ecf1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{modalTitle}</h2><p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>{periodo} · {rows.length} brand rilevati</p></div>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 28px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}><input type="checkbox" checked={selCount === importRows.length} onChange={toggleAll} /></th>
                {["Brand", "Soggetto", "Spesa", "Collega a voce esistente"].map((h, i) => <th key={i} style={{ padding: "10px 8px", textAlign: i === 2 ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", fontSize: 10, textTransform: "uppercase" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {importRows.map((r, i) => {
                const candidates = getCandidates(r);
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: r.selected ? "#eff6ff" : "transparent", opacity: r.selected ? 1 : .5 }}>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}><input type="checkbox" checked={r.selected} onChange={() => toggleRow(i)} /></td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "#2563eb" }}>{r.brand}</td>
                    <td style={{ padding: "8px", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.soggetto || "—"}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatEur(r.spesa)}</td>
                    <td style={{ padding: "8px", minWidth: 220 }}>
                      {candidates.length > 0 ? (
                        <select value={r.mergeWithId || ""} onChange={e => setMerge(i, e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "5px 8px" }}>
                          <option value="">➕ Crea nuova voce</option>
                          {candidates.map(c => <option key={c.id} value={c.id}>🔄 {c.descrizione || c.brand}</option>)}
                        </select>
                      ) : <span style={{ fontSize: 11, color: "#94a3b8" }}>➕ Nuova voce</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "16px 28px", borderTop: "1px solid #e8ecf1", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
          <span style={{ fontSize: 13, color: "#475569" }}><strong>{selCount}</strong> selezionati · <strong style={{ color: "#059669" }}>{formatEur(selTotal)}</strong></span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "8px 20px", borderRadius: 8, fontSize: 13 }}>Annulla</button>
            <button className="btn" onClick={() => onConfirm(importRows.filter(r => r.selected))} disabled={saving || selCount === 0} style={{ background: "#059669", color: "#fff", padding: "8px 24px", borderRadius: 8, fontSize: 13 }}>{saving ? "Importazione..." : `Importa ${selCount}`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DuplicateModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    dataInizio: entry.dataInizio, dataFine: entry.dataFine, descrizione: entry.descrizione, tipologia: entry.tipologia, brand: entry.brand,
    soggetto: entry.soggetto, spesa: String(entry.spesa), rimborsoPct: String(entry.rimborso_pct), costoDichiarato: String(entry.costo_dichiarato),
    collettiva: entry.collettiva, nomeCollettiva: entry.nome_collettiva, numeroPartecipanti: String(entry.numero_partecipanti), pianoExtra: entry.piano_extra, daConfermare: entry.da_confermare,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const spesa = parseFloat(form.spesa) || 0;
      const rimbPct = parseFloat(form.rimborsoPct) || 0;
      const mk = getMonthKey(form.dataInizio);
      await supabase.insert(TABLE, {
        mese_competenza: mk, data_inizio: form.dataInizio, data_fine: form.dataFine, descrizione: form.descrizione, tipologia: form.tipologia, brand: form.brand, soggetto: form.soggetto,
        spesa, rimborso_pct: rimbPct, costo_dichiarato: parseFloat(form.costoDichiarato) || spesa, numero_partecipanti: parseInt(form.numeroPartecipanti) || 2,
        piano_extra: form.pianoExtra, collettiva: form.collettiva, nome_collettiva: form.nomeCollettiva, da_confermare: form.daConfermare,
        date_singole: entry.date_singole, mappa_url: entry.mappa_url, poster_3x2: entry.poster_3x2, poster_altri: entry.poster_altri, poster_maxi: entry.poster_maxi,
        creativita_url: entry.creativita_url, creativita_nome: entry.creativita_nome, fattura_url: entry.fattura_url, fattura_nome: entry.fattura_nome,
      });
      await onSaved();
    } catch (err: unknown) { alert("Errore"); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>📋 Duplica azione</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Data inizio"><input type="date" value={form.dataInizio} onChange={e => setForm({ ...form, dataInizio: e.target.value })} style={inputStyle} /></Field>
          <Field label="Data fine"><input type="date" value={form.dataFine} onChange={e => setForm({ ...form, dataFine: e.target.value })} style={inputStyle} /></Field>
        </div>
        <Field label="Descrizione"><input type="text" value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} style={{ ...inputStyle, marginBottom: 12 }} /></Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", padding: "9px 16px", borderRadius: 8 }}>Annulla</button>
          <button className="btn" onClick={handleSave} disabled={saving} style={{ background: "#059669", color: "#fff", padding: "9px 24px", borderRadius: 8 }}>{saving ? "Salvataggio..." : "Salva copia"}</button>
        </div>
      </div>
    </div>
  );
}

// --- Pagina Principale ---

export default function MarketingCostsPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [selectedMonths, setSelectedMonths] = useState([getCurrentMonthKey()]);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fatturaFile, setFatturaFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<Entry | null>(null);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterTipologia, setFilterTipologia] = useState<string>("all");
  const [formVisible, setFormVisible] = useState(true);
  const [metaImportRows, setMetaImportRows] = useState<CsvImportRow[] | null>(null);
  const [metaImporting, setMetaImporting] = useState(false);
  const [googleImportRows, setGoogleImportRows] = useState<CsvImportRow[] | null>(null);
  const [googleImporting, setGoogleImporting] = useState(false);
  const [duplicateEntry, setDuplicateEntry] = useState<Entry | null>(null);
  const [sortField, setSortField] = useState<"mese" | "periodo" | "descrizione" | "tipologia" | "brand" | "none">("none");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); setError(null); }
    catch (e) { console.error(e); setError("Errore di connessione a Supabase."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const toggleSort = (field: any) => { if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(field); setSortDir("asc"); } };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const files = e.target.files;
    if (!files) return;
    const newFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_FILE_SIZE) { setFileError(`File "${files[i].name}" troppo grande. Max 500 KB.`); continue; }
      newFiles.push(files[i]);
    }
    setSelectedFiles(prev => [...prev, ...newFiles]);
    e.target.value = "";
  };
  const removeFile = (idx: number) => { setSelectedFiles(prev => prev.filter((_, i) => i !== idx)); setFileError(null); };

  const handleSubmit = async () => {
    const isStampa = form.tipologia === "Stampa";
    let effDataInizio = form.dataInizio; let effDataFine = form.dataFine; let dateSingoleStr: string | null = null;
    if (isStampa) {
      if (form.dateSingole.length === 0) { showToast("⚠️ Seleziona almeno una data di uscita"); return; }
      const sorted = [...form.dateSingole].sort(); effDataInizio = sorted[0]; effDataFine = sorted[sorted.length - 1]; dateSingoleStr = sorted.join(",");
    } else {
      if (!form.dataInizio || !form.dataFine) { showToast("⚠️ Compila le date"); return; }
      if (form.dataFine < form.dataInizio) { showToast("⚠️ Data fine prima di data inizio"); return; }
    }
    if (!form.descrizione.trim()) { showToast("⚠️ Compila la descrizione"); return; }
    setSaving(true);
    try {
      let creativita_url: string | null = null, creativita_nome: string | null = null, fattura_url_val: string | null = null, fattura_nome_val: string | null = null;
      const allUrls: string[] = []; const allNames: string[] = [];
      if (editingId) {
        const existing = entries.find(e => e.id === editingId);
        if (existing) { const parsed = parseCreativitaFiles(existing.creativita_url, existing.creativita_nome); parsed.forEach(f => { allUrls.push(f.url); allNames.push(f.nome); }); }
      }
      for (const file of selectedFiles) {
        const fn = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${file.name.split(".").pop()}`;
        await supabase.uploadFile(STORAGE_BUCKET, fn, file);
        allUrls.push(supabase.getPublicUrl(STORAGE_BUCKET, fn)); allNames.push(file.name);
      }
      if (allUrls.length > 0) { creativita_url = JSON.stringify(allUrls); creativita_nome = JSON.stringify(allNames); }
      if (fatturaFile) {
        const fn = `fattura_${Date.now()}_${Math.random().toString(36).slice(2,6)}.pdf`;
        await supabase.uploadFile(STORAGE_BUCKET, fn, fatturaFile);
        fattura_url_val = supabase.getPublicUrl(STORAGE_BUCKET, fn); fattura_nome_val = fatturaFile.name;
      }
      const spesaVal = parseFloat(form.spesa) || 0; const rimbPct = parseFloat(form.rimborsoPct) || 0;
      const row: any = {
        mese_competenza: getMonthKey(effDataInizio), data_inizio: effDataInizio, data_fine: effDataFine, descrizione: form.descrizione.trim(), tipologia: form.tipologia, brand: form.brand,
        soggetto: form.soggetto.trim(), spesa: spesaVal, rimborso_pct: rimbPct, costo_dichiarato: rimbPct > 0 && form.costoDichiarato !== "" ? (parseFloat(form.costoDichiarato) || spesaVal) : spesaVal,
        numero_partecipanti: form.collettiva ? (parseInt(form.numeroPartecipanti) || 2) : 2, piano_extra: form.pianoExtra, collettiva: form.collettiva, nome_collettiva: form.collettiva ? form.nomeCollettiva.trim() : "",
        date_singole: dateSingoleStr, mappa_url: form.tipologia === "OOH" ? (form.mappaUrl.trim() || null) : null,
        poster_3x2: form.tipologia === "OOH" ? (parseInt(form.poster3x2) || 0) : 0, poster_altri: form.tipologia === "OOH" ? (parseInt(form.posterAltri) || 0) : 0, poster_maxi: form.tipologia === "OOH" ? (parseInt(form.posterMaxi) || 0) : 0,
        piattaforma: form.tipologia === "Digital Adv" ? (form.piattaforma || "") : "",
      };
      if (creativita_url) { row.creativita_url = creativita_url; row.creativita_nome = creativita_nome; }
      if (fattura_url_val) { row.fattura_url = fattura_url_val; row.fattura_nome = fattura_nome_val; }
      if (editingId) { await supabase.update(TABLE, editingId, row); showToast("✓ Aggiornata"); }
      else { if (!creativita_url) { row.creativita_url = null; row.creativita_nome = null; } if (!fattura_url_val) { row.fattura_url = null; row.fattura_nome = null; } row.da_confermare = true; await supabase.insert(TABLE, row); showToast("✓ Inserita"); }
      setForm({ ...emptyForm }); setEditingId(null); setSelectedFiles([]); setFatturaFile(null); await loadEntries();
    } catch (e) { showToast("❌ Errore nel salvataggio"); } finally { setSaving(false); }
  };

  const handleEdit = (entry: Entry) => {
    setForm({
      dataInizio: entry.dataInizio, dataFine: entry.dataFine, descrizione: entry.descrizione, tipologia: entry.tipologia, brand: entry.brand, soggetto: entry.soggetto,
      spesa: entry.spesa.toString(), rimborsoPct: entry.rimborso_pct.toString(), costoDichiarato: entry.costo_dichiarato.toString(), numeroPartecipanti: entry.numero_partecipanti.toString(),
      pianoExtra: entry.piano_extra, collettiva: entry.collettiva, nomeCollettiva: entry.nome_collettiva, dateSingole: entry.date_singole ? entry.date_singole.split(",") : [],
      mappaUrl: entry.mappa_url || "", poster3x2: entry.poster_3x2 ? entry.poster_3x2.toString() : "", posterAltri: entry.poster_altri ? entry.poster_altri.toString() : "", posterMaxi: entry.poster_maxi ? entry.poster_maxi.toString() : "",
      piattaforma: entry.piattaforma || "",
    });
    setEditingId(entry.id); setSelectedFiles([]); setFatturaFile(null); setFormVisible(true); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleDelete = async (id: string) => { try { await supabase.delete(TABLE, id); showToast("✓ Eliminata"); await loadEntries(); } catch (e) { showToast("❌ Errore"); } };
  const toggleDaConfermare = async (entry: Entry) => { try { await supabase.update(TABLE, entry.id, { da_confermare: !entry.da_confermare }); setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, da_confermare: !e.da_confermare } : e)); } catch (e) { showToast("❌ Errore"); } };

  const handleMetaCSV = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const parsed = processMetaCSV(ev.target?.result as string); setMetaImportRows(parsed); } catch (err) { showToast("❌ Errore nel parsing"); } }; reader.readAsText(file); e.target.value = ""; };

  const [metaApiLoading, setMetaApiLoading] = useState(false);
  const [metaApiModal, setMetaApiModal] = useState(false);
  const [metaApiMonth, setMetaApiMonth] = useState(getCurrentMonthKey());

  const handleMetaAPI = async () => {
    setMetaApiLoading(true);
    try {
      const [y, m] = metaApiMonth.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const daysInMonth = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const res = await fetch(`/api/meta/insights?from=${from}&to=${to}`);
      const json = await res.json();

      if (json.error) { showToast("❌ " + json.error); return; }
      if (!json.data?.length) { showToast("⚠️ Nessun dato trovato per il mese selezionato"); return; }

      // Usa lo stesso parser già esistente per CSV Meta
      // Costruiamo un testo CSV sintetico compatibile con processMetaCSV
      // oppure convertiamo direttamente i dati API nel formato CsvImportRow
      const parsed: CsvImportRow[] = [];
      const brandMap: Record<string, { brand: string; models: Set<string>; adsets: string[]; total: number; start: string; end: string }> = {};

      for (const row of json.data) {
        const spent = parseFloat(row.spend) || 0;
        if (spent === 0) continue;
        const { brand, model } = metaParseBrandModel(row.campaign_name, row.adset_name);
        if (!brandMap[brand]) brandMap[brand] = { brand, models: new Set(), adsets: [], total: 0, start: row.date_start, end: row.date_stop };
        brandMap[brand].models.add(model);
        brandMap[brand].adsets.push(row.adset_name);
        brandMap[brand].total += spent;
      }

      for (const g of Object.values(brandMap).sort((a, b) => b.total - a.total)) {
        parsed.push({
          brand: g.brand,
          soggetto: [...g.models].join(", "),
          descrizione: g.adsets.join(", "),
          spesa: Math.round(g.total * 100) / 100,
          dataInizio: g.start,
          dataFine: g.end,
          selected: true,
          piattaforma: "Meta",
        });
      }

      setMetaApiModal(false);
      setMetaImportRows(parsed);
    } catch (err: any) {
      showToast("❌ Errore connessione API: " + err.message);
    } finally {
      setMetaApiLoading(false);
    }
  };
  const handleGoogleCSV = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const parsed = processGoogleCSV(ev.target?.result as string); setGoogleImportRows(parsed); } catch (err) { showToast("❌ Errore nel parsing"); } }; reader.readAsText(file); e.target.value = ""; };

  const [googleApiLoading, setGoogleApiLoading] = useState(false);
  const [googleApiModal, setGoogleApiModal] = useState(false);
  const [googleApiMonth, setGoogleApiMonth] = useState(getCurrentMonthKey());

  const handleGoogleAPI = async () => {
    setGoogleApiLoading(true);
    try {
      const [y, m] = googleApiMonth.split("-").map(Number);
      const from = `${y}-${String(m).padStart(2, "0")}-01`;
      const daysInMonth = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

      const res = await fetch(`/api/google/insights?from=${from}&to=${to}`);
      const json = await res.json();

      if (json.error) { showToast("❌ " + json.error); return; }
      if (!json.data?.length) { showToast("⚠️ Nessun dato trovato per il mese selezionato"); return; }

      // Converti i dati Google API nel formato CsvImportRow
      // account_name es. "Leonori-Fiat" → brand "Fiat"
      const parsed: CsvImportRow[] = json.data.map((row: any) => {
        const brand = googleBrandFromAccount(row.account_name);
        const soggetto = googleModelFromCampaign(row.campaigns ?? "");
        return {
          brand,
          soggetto,
          descrizione: row.account_name + " — " + (row.campaigns ?? ""),
          spesa: row.cost,
          dataInizio: row.date_start,
          dataFine: row.date_stop,
          selected: true,
          piattaforma: "Google",
        };
      });

      setGoogleApiModal(false);
      setGoogleImportRows(parsed);
    } catch (err: any) {
      showToast("❌ Errore connessione API: " + err.message);
    } finally {
      setGoogleApiLoading(false);
    }
  };
  const handleCSVConfirm = async (rows: CsvImportRow[], isMeta: boolean) => {
    isMeta ? setMetaImporting(true) : setGoogleImporting(true);
    try {
      for (const r of rows) {
        const mk = getMonthKey(r.dataInizio);
        if (r.mergeWithId) { await supabase.update(TABLE, r.mergeWithId, { mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine, soggetto: r.soggetto, spesa: r.spesa, costo_dichiarato: r.spesa, piattaforma: isMeta ? "Meta" : "Google" }); }
        else { await supabase.insert(TABLE, { mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine, descrizione: r.descrizione, tipologia: "Digital Adv", brand: r.brand, soggetto: r.soggetto, spesa: r.spesa, rimborso_pct: 0, costo_dichiarato: r.spesa, numero_partecipanti: 2, piano_extra: false, collettiva: false, nome_collettiva: "", da_confermare: true, creativita_url: null, creativita_nome: null, piattaforma: isMeta ? "Meta" : "Google" }); }
      }
      isMeta ? setMetaImportRows(null) : setGoogleImportRows(null); showToast(`✓ Importazione completata`); await loadEntries();
    } catch (err) { showToast("❌ Errore durante l'importazione"); } finally { isMeta ? setMetaImporting(false) : setGoogleImporting(false); }
  };

  const availableMonths = Array.from(new Set(entries.map(e => e.meseCompetenza))).sort().reverse();
  if (!availableMonths.includes(getCurrentMonthKey())) availableMonths.unshift(getCurrentMonthKey());
  const toggleMonth = (m: string) => { setSelectedRows(new Set()); setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]); };
  const filtered = entries.filter(e => {
    if (selectedMonths.length > 0 && !selectedMonths.includes(e.meseCompetenza)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    if (filterTipologia !== "all" && e.tipologia !== filterTipologia) return false; return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortField === "none") cmp = a.dataInizio.localeCompare(b.dataInizio);
    else if (sortField === "mese") cmp = a.meseCompetenza.localeCompare(b.meseCompetenza) || a.dataInizio.localeCompare(b.dataInizio);
    else if (sortField === "periodo") cmp = a.dataInizio.localeCompare(b.dataInizio);
    else if (sortField === "descrizione") cmp = a.descrizione.localeCompare(b.descrizione, "it");
    else if (sortField === "tipologia") cmp = a.tipologia.localeCompare(b.tipologia, "it");
    else if (sortField === "brand") cmp = a.brand.localeCompare(b.brand, "it");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  const availableTipologie = Array.from(new Set(entries.map(e => e.tipologia))).sort();
  const totalsBase = selectedRows.size > 0 ? filtered.filter(e => selectedRows.has(e.id)) : filtered;

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Connessione a Supabase...</div></div></div>;

  return (
    <PageShell toast={toast}>
      <NavBar current="marketing" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      {/* Intestazione */}
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div><h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>📊 Costi Marketing</h1><p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Gestione iniziative e monitoraggio spese</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {unlocked && <>
            <label className="btn" style={{ background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12 }}>📊 Meta Ads CSV<input type="file" accept=".csv" onChange={handleMetaCSV} style={{ display: "none" }} /></label>
            <button className="btn" onClick={() => setMetaApiModal(true)} style={{ background: "linear-gradient(135deg, #1877f2, #0a5fd8)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>🔄 Meta API</button>
            <label className="btn" style={{ background: "linear-gradient(135deg, #ea4335, #c5221f)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12 }}>📈 Google Ads CSV<input type="file" accept=".csv" onChange={handleGoogleCSV} style={{ display: "none" }} /></label>
            <button className="btn" onClick={() => setGoogleApiModal(true)} style={{ background: "linear-gradient(135deg, #34a853, #1e8e3e)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>🔄 Google API</button>
          </>}
        </div>
      </div>

      {/* Form Aggiunta/Modifica (identico all'originale, accorciato per brevità qui ma mantiene tutte le logiche di stato) */}
      {unlocked && (
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 24, border: "1px solid #e8ecf1" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", cursor: "pointer", background: formVisible ? "transparent" : "#f8fafc" }} onClick={() => !editingId && setFormVisible(!formVisible)}>
            <div style={{ display: "flex", gap: 8 }}><span style={{ fontSize: 16, fontWeight: 600 }}>{editingId ? "✏️ Modifica iniziativa" : "➕ Nuova iniziativa"}</span>{editingId && <button className="btn" onClick={e => { e.stopPropagation(); setEditingId(null); setForm({ ...emptyForm }); }} style={{ background: "#fef2f2", color: "#dc2626", fontSize: 12, padding: "4px 12px", borderRadius: 6 }}>Annulla</button>}</div>
            <button className="btn" style={{ background: "#f1f5f9", padding: "4px 12px", borderRadius: 6, fontSize: 12 }}>{formVisible ? "▲ Nascondi" : "▼ Mostra"}</button>
          </div>
          {formVisible && (
            <div style={{ padding: "0 28px 24px" }}>
              {/* Riga 1: date, descrizione, tipologia, brand, piattaforma */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                {form.tipologia !== "Stampa" && (
                  <>
                    <Field label="Data inizio"><input type="date" value={form.dataInizio} onChange={e => setForm({ ...form, dataInizio: e.target.value })} style={inputStyle} /></Field>
                    <Field label="Data fine"><input type="date" value={form.dataFine} min={form.dataInizio} onChange={e => setForm({ ...form, dataFine: e.target.value })} style={inputStyle} /></Field>
                  </>
                )}
                <Field label="Descrizione"><input type="text" placeholder="Descrizione..." value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} style={inputStyle} /></Field>
                <Field label="Tipologia"><select value={form.tipologia} onChange={e => setForm({ ...form, tipologia: e.target.value, dateSingole: e.target.value === "Stampa" ? form.dateSingole : [], piattaforma: e.target.value !== "Digital Adv" ? "" : form.piattaforma })} style={inputStyle}>{TIPOLOGIE.map(t => <option key={t}>{t}</option>)}</select></Field>
                <Field label="Brand"><select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} style={inputStyle}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></Field>
                {form.tipologia === "Digital Adv" && (
                  <Field label="Piattaforma">
                    <select value={form.piattaforma} onChange={e => setForm({ ...form, piattaforma: e.target.value })} style={{ ...inputStyle, borderColor: "#7c3aed" }}>
                      <option value="">— Non specificata —</option>
                      <option value="Google">Google</option>
                      <option value="Meta">Meta</option>
                      <option value="Portali">Portali</option>
                      <option value="Altro">Altro</option>
                    </select>
                  </Field>
                )}
                <Field label="Soggetto"><input type="text" placeholder="Soggetto..." value={form.soggetto} onChange={e => setForm({ ...form, soggetto: e.target.value })} style={inputStyle} /></Field>
                <Field label="Spesa (€)"><input type="number" min="0" step="1" placeholder="0" value={form.spesa} onChange={e => setForm({ ...form, spesa: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></Field>
                <Field label="Rimborso (%)"><input type="number" min="0" max="100" step="1" placeholder="0" value={form.rimborsoPct} onChange={e => setForm({ ...form, rimborsoPct: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></Field>
              </div>

              {/* Stampa: multi-date picker */}
              {form.tipologia === "Stampa" && (
                <div style={{ marginTop: 14 }}>
                  <Field label="📰 Date uscite stampa (clicca i giorni)">
                    <StampaCalendar selected={form.dateSingole} onChange={dates => setForm({ ...form, dateSingole: dates })} baseMonth={getCurrentMonthKey()} />
                  </Field>
                </div>
              )}

              {/* Spesa dichiarata — visibile solo se rimborso > 0 */}
              {parseFloat(form.rimborsoPct) > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
                  <Field label="Spesa dichiarata (€)">
                    <input type="number" min="0" step="1" placeholder={form.spesa || "0"} value={form.costoDichiarato} onChange={e => setForm({ ...form, costoDichiarato: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#f59e0b" }} />
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>Default = spesa</span>
                  </Field>
                </div>
              )}

              {/* Checkboxes Piano Extra + Collettiva */}
              <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.pianoExtra} onChange={e => setForm({ ...form, pianoExtra: e.target.checked })} style={{ accentColor: "#8b5cf6", width: 16, height: 16 }} /> 📌 Piano Extra
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.collettiva} onChange={e => {
                    const checked = e.target.checked;
                    if (checked) {
                      const meseIdx = form.dateSingole.length > 0
                        ? new Date(form.dateSingole.sort()[0] + "T00:00:00").getMonth()
                        : new Date(form.dataInizio + "T00:00:00").getMonth();
                      const defaultName = `${form.brand} - ${MESI[meseIdx]}`;
                      setForm({ ...form, collettiva: true, nomeCollettiva: form.nomeCollettiva || defaultName });
                    } else {
                      setForm({ ...form, collettiva: false, nomeCollettiva: "" });
                    }
                  }} style={{ accentColor: "#059669", width: 16, height: 16 }} /> 🤝 Collettiva
                </label>
              </div>

              {/* Campi collettiva */}
              {form.collettiva && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
                  <Field label="Nome Collettiva"><input type="text" placeholder="Nome..." value={form.nomeCollettiva} onChange={e => setForm({ ...form, nomeCollettiva: e.target.value })} style={{ ...inputStyle, borderColor: "#10b981" }} /></Field>
                  <Field label="Numero partecipanti"><input type="number" min="1" step="1" value={form.numeroPartecipanti} onChange={e => setForm({ ...form, numeroPartecipanti: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#10b981" }} /></Field>
                </div>
              )}

              {/* Campi OOH */}
              {form.tipologia === "OOH" && (
                <div style={{ marginTop: 14, padding: 14, background: "#fef9c3", borderRadius: 12, border: "1px solid #fde68a" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 10 }}>🏙 Dettagli OOH</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                    <Field label="Link Mappa (Google My Maps)"><input type="url" placeholder="https://www.google.com/maps/d/..." value={form.mappaUrl} onChange={e => setForm({ ...form, mappaUrl: e.target.value })} style={{ ...inputStyle, borderColor: "#fbbf24" }} /></Field>
                    <Field label="Poster 3x2"><input type="number" min="0" step="1" placeholder="0" value={form.poster3x2} onChange={e => setForm({ ...form, poster3x2: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#fbbf24" }} /></Field>
                    <Field label="Poster altri formati"><input type="number" min="0" step="1" placeholder="0" value={form.posterAltri} onChange={e => setForm({ ...form, posterAltri: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#fbbf24" }} /></Field>
                    <Field label="Poster maxi formati"><input type="number" min="0" step="1" placeholder="0" value={form.posterMaxi} onChange={e => setForm({ ...form, posterMaxi: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#fbbf24" }} /></Field>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Field label="Fattura PDF (opzionale)">
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#fff", border: "1px solid #fde68a", cursor: "pointer" }}>
                          📄 Scegli PDF<input type="file" accept=".pdf" onChange={e => { const f = e.target.files?.[0]; if (f && !f.name.toLowerCase().endsWith(".pdf")) { setFileError("La fattura deve essere un PDF"); e.target.value = ""; return; } setFatturaFile(f || null); }} style={{ display: "none" }} />
                        </label>
                        {fatturaFile && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef3c7", color: "#92400e", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>✓ {fatturaFile.name} <span onClick={() => setFatturaFile(null)} style={{ cursor: "pointer", opacity: .6, fontSize: 14 }}>✕</span></span>}
                        {!fatturaFile && editingId && entries.find(e => e.id === editingId)?.fattura_nome && <span style={{ fontSize: 12, color: "#92400e" }}>Fattura: <strong>{entries.find(e => e.id === editingId)?.fattura_nome}</strong></span>}
                      </div>
                    </Field>
                  </div>
                </div>
              )}

              {/* Upload creatività */}
              <div style={{ marginTop: 14 }}>
                <Field label="Creatività (max 500 KB ciascuna)">
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer" }}>
                      📎 Aggiungi file<input type="file" multiple accept="image/*,.pdf,.ai,.psd,.eps,.svg" onChange={handleFileSelect} style={{ display: "none" }} />
                    </label>
                    {/* File esistenti (in modifica) */}
                    {editingId && (() => {
                      const existing = entries.find(e => e.id === editingId);
                      const files = existing ? parseCreativitaFiles(existing.creativita_url, existing.creativita_nome) : [];
                      return files.map((f, i) => (
                        <a key={"ex" + i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#dbeafe", color: "#2563eb", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, textDecoration: "none" }}>📄 {f.nome || "File " + (i + 1)}</a>
                      ));
                    })()}
                    {/* Nuovi file da caricare */}
                    {selectedFiles.map((f, i) => (
                      <span key={"new" + i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ecfdf5", color: "#059669", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                        ✓ {f.name} ({formatFileSize(f.size)})<span onClick={() => removeFile(i)} style={{ cursor: "pointer", opacity: .6, fontSize: 14 }}>✕</span>
                      </span>
                    ))}
                    {fileError && <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 500 }}>❌ {fileError}</span>}
                  </div>
                </Field>
              </div>

              {/* Bottone salva */}
              <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn" onClick={handleSubmit} disabled={saving} style={{ background: saving ? "#94a3b8" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", padding: "10px 28px", borderRadius: 10, fontSize: 14, boxShadow: saving ? "none" : "0 2px 8px rgba(59,130,246,.3)" }}>
                  {saving ? "Salvataggio..." : editingId ? "Salva modifiche" : "Inserisci"}
                </button>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Mese: <strong style={{ color: "#475569" }}>{form.dataInizio ? getMonthLabelShort(getMonthKey(form.dataInizio)) : "—"}</strong></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filtri */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", marginBottom: 20, border: "1px solid #e8ecf1" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🔍 Filtri:</span>
          <div style={{ position: "relative" }}>
            <button className="btn" onClick={() => setMonthDropdownOpen(!monthDropdownOpen)} style={{ background: "#f1f5f9", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>
              🗓 {selectedMonths.length === 0 ? "Tutti i mesi" : `${selectedMonths.length} mes${selectedMonths.length === 1 ? "e" : "i"}`} ▾
            </button>
            {monthDropdownOpen && (
              <>
                <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setMonthDropdownOpen(false)} />
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 100, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: "10px 4px", minWidth: 180 }}>
                  <div style={{ padding: "2px 12px 8px", fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Seleziona mesi</div>
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, borderRadius: 6 }}>
                      <input type="checkbox" checked={selectedMonths.length === 0} onChange={() => setSelectedMonths([])} />
                      <span style={{ fontWeight: 500 }}>Tutti i mesi</span>
                    </label>
                    {availableMonths.map(m => (
                      <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, borderRadius: 6, background: selectedMonths.includes(m) ? "#eff6ff" : undefined }}>
                        <input type="checkbox" checked={selectedMonths.includes(m)} onChange={() => {
                          setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
                        }} />
                        {getMonthLabel(m)}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13 }}><option value="all">Tutti i brand</option>{availableBrands.map(b => <option key={b}>{b}</option>)}</select>
          <select value={filterTipologia} onChange={e => setFilterTipologia(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13 }}><option value="all">Tutte tipologie</option>{availableTipologie.map(t => <option key={t}>{t}</option>)}</select>
        </div>
      </div>

      <ExportBar onCSV={() => exportCSV("costi.csv", ["Mese", "Descrizione", "Spesa"], filtered.map(e => [e.meseCompetenza, e.descrizione, e.spesa.toString()]))} onPrint={() => window.print()} />

      {/* Tabella colonne fisse */}
      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "3%" }} />   {/* checkbox */}
            <col style={{ width: "3%" }} />   {/* eye */}
            <col style={{ width: "7%" }} />   {/* Mese */}
            <col style={{ width: "8%" }} />   {/* Periodo */}
            <col style={{ width: "20%" }} />  {/* Descrizione */}
            <col style={{ width: "10%" }} />  {/* Tipo */}
            <col style={{ width: "8%" }} />   {/* Brand */}
            <col style={{ width: "8%" }} />   {/* Sogg. */}
            <col style={{ width: "4%" }} />   {/* File */}
            <col style={{ width: "8%" }} />   {/* Spesa */}
            <col style={{ width: "8%" }} />   {/* Imp. Rimb. */}
            <col style={{ width: "8%" }} />   {/* Sp. Netta */}
            {unlocked && <><col style={{ width: "3%" }} /><col style={{ width: "10%" }} /></>}
          </colgroup>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "10px", textAlign: "center" }}><input type="checkbox" onChange={() => setSelectedRows(new Set(filtered.map(e=>e.id)))} /></th>
              {([
                { label: "", field: null },
                { label: "Mese", field: "mese" },
                { label: "Periodo", field: "periodo" },
                { label: "Descrizione", field: null },
                { label: "Tipo", field: "tipologia" },
                { label: "Brand", field: "brand" },
                { label: "Sogg.", field: null },
                { label: "File", field: null },
                { label: "Spesa", field: null },
                { label: "Imp. Rimb.", field: null },
                { label: "Sp. Netta", field: null },
                ...(unlocked ? [{ label: "OK", field: null }, { label: "", field: null }] : [])
              ] as { label: string; field: string | null }[]).map(({ label, field }, i) => (
                <th key={i} onClick={field ? () => toggleSort(field) : undefined}
                  style={{ padding: "10px", textAlign: i >= 9 && i <= 11 ? "right" : "left", fontSize: 10, color: field ? "#1e40af" : "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: field ? "pointer" : "default", userSelect: "none", background: sortField === field ? "#eff6ff" : undefined }}>
                  {label}{field && sortField === field ? (sortDir === "asc" ? " ▲" : " ▼") : field ? " ↕" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...cellStyle, textAlign: "center" }}><input type="checkbox" checked={selectedRows.has(e.id)} onChange={() => { const s = new Set(selectedRows); s.has(e.id) ? s.delete(e.id) : s.add(e.id); setSelectedRows(s); }} /></td>
                <td style={{ padding: 4 }}><button className="eye-btn" onClick={() => setDetailEntry(e)}>👁</button></td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getMonthLabelShort(e.meseCompetenza)}</td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatDate(e.dataInizio)}</td>
                <td style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>{e.descrizione}</td>
                <td style={{ ...cellStyle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.tipologia}
                  {e.tipologia === "Digital Adv" && e.piattaforma && (
                    <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 4, background: e.piattaforma === "Google" ? "#fee2e2" : e.piattaforma === "Meta" ? "#ede9fe" : "#f1f5f9", color: e.piattaforma === "Google" ? "#dc2626" : e.piattaforma === "Meta" ? "#7c3aed" : "#64748b" }}>
                      {e.piattaforma}
                    </span>
                  )}
                </td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.brand}</td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.soggetto || "—"}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>{e.creativita_url ? "📄" : "—"}</td>
                <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap" }}>{formatEur(e.spesa)}</td>
                <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap" }}>{formatEur(calcImportoRimborso(e))}</td>
                <td style={{ ...cellStyle, textAlign: "right", whiteSpace: "nowrap", color: "#059669", fontWeight: 600 }}>{formatEur(calcSpesaNetta(e))}</td>
                {unlocked && <>
                  <td style={{ ...cellStyle, textAlign: "center" }}><input type="checkbox" checked={e.da_confermare} onChange={() => toggleDaConfermare(e)} /></td>
                  <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                    <button className="btn" onClick={() => setDuplicateEntry(e)}>📋</button>
                    <button className="btn" onClick={() => handleEdit(e)}>✏️</button>
                    <button className="btn" onClick={() => handleDelete(e.id)}>🗑</button>
                  </td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 24 }}>
        <SummaryCard label="Totale Spesa" value={totalsBase.reduce((s,e)=>s+e.spesa,0)} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
        <SummaryCard label="Spesa Netta" value={totalsBase.reduce((s,e)=>s+calcSpesaNetta(e),0)} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
      </div>

      {detailEntry && <DetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}
      {/* Modal selezione mese per importazione Meta API */}
      {metaApiModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setMetaApiModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 28, boxShadow: "0 24px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>🔄 Importa da Meta API</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>Seleziona il mese da importare. I dati verranno raggruppati per brand come nel CSV.</p>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Mese</label>
            <select value={metaApiMonth} onChange={e => setMetaApiMonth(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 24 }}>
              {Array.from({ length: 12 }, (_, i) => {
                const now = new Date();
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return <option key={key} value={key}>{getMonthLabel(key)}</option>;
              })}
            </select>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setMetaApiModal(false)} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 20px", borderRadius: 8 }}>Annulla</button>
              <button className="btn" onClick={handleMetaAPI} disabled={metaApiLoading} style={{ background: metaApiLoading ? "#94a3b8" : "linear-gradient(135deg, #1877f2, #0a5fd8)", color: "#fff", padding: "9px 24px", borderRadius: 8, fontWeight: 600 }}>
                {metaApiLoading ? "⏳ Caricamento..." : "📥 Scarica dati"}
              </button>
            </div>
          </div>
        </div>
      )}

      {metaImportRows && <CsvImportModal rows={metaImportRows} onConfirm={r => handleCSVConfirm(r, true)} onClose={() => setMetaImportRows(null)} saving={metaImporting} title="Importa Meta Ads" existingEntries={entries} />}
      {/* Modal selezione mese per importazione Google API */}
      {googleApiModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setGoogleApiModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, padding: 28, boxShadow: "0 24px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>🔄 Importa da Google Ads API</h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#64748b" }}>Seleziona il mese da importare. I dati vengono aggregati per account (un brand per riga).</p>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>Mese</label>
            <select value={googleApiMonth} onChange={e => setGoogleApiMonth(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 24 }}>
              {Array.from({ length: 12 }, (_, i) => {
                const now = new Date();
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return <option key={key} value={key}>{getMonthLabel(key)}</option>;
              })}
            </select>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setGoogleApiModal(false)} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 20px", borderRadius: 8 }}>Annulla</button>
              <button className="btn" onClick={handleGoogleAPI} disabled={googleApiLoading} style={{ background: googleApiLoading ? "#94a3b8" : "linear-gradient(135deg, #34a853, #1e8e3e)", color: "#fff", padding: "9px 24px", borderRadius: 8, fontWeight: 600 }}>
                {googleApiLoading ? "⏳ Caricamento..." : "📥 Scarica dati"}
              </button>
            </div>
          </div>
        </div>
      )}

      {googleImportRows && <CsvImportModal rows={googleImportRows} onConfirm={r => handleCSVConfirm(r, false)} onClose={() => setGoogleImportRows(null)} saving={googleImporting} title="Importa Google Ads" existingEntries={entries} />}
      {duplicateEntry && <DuplicateModal entry={duplicateEntry} onClose={() => setDuplicateEntry(null)} onSaved={async () => { setDuplicateEntry(null); await loadEntries(); }} />}
    </PageShell>
  );
}