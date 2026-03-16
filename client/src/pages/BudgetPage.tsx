import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { TABLE, BUDGET_TABLE, TIPOLOGIE, BRANDS, STORAGE_BUCKET, MESI, today, MAX_FILE_SIZE } from "../lib/constants";
import { PageProps, BudgetRow } from "../lib/types";
import { bgParseCSV, getMonthLabel, getMonthKey, formatEur } from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { Field } from "../components/shared/Field";
import { cellStyle, StampaCalendar } from "./MarketingCostsPage";

export default function BudgetPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [plans, setPlans] = useState<Record<string, BudgetRow[]>>({});
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importMonth, setImportMonth] = useState(new Date().getMonth() + 1);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const fileRef = useRef<HTMLInputElement>(null);

  const [showAddRow, setShowAddRow] = useState<string | null>(null);
  const emptyRow = { azione: "", brand: "", costo: "", rimborso: "", note: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await supabase.select(BUDGET_TABLE, "order=month_key.desc,id.asc&select=*");
      const map: Record<string, BudgetRow[]> = {};
      for (const r of data) { if (!map[r.month_key]) map[r.month_key] = []; map[r.month_key].push(r); }
      setPlans(map);
    } catch (err: unknown) { showToast("Errore caricamento"); } finally { setLoaded(true); setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rows = bgParseCSV(e.target!.result as string);
      if (rows.length === 0) { showToast("Nessun dato valido nel CSV"); return; }
      const key = `${importYear}-${String(importMonth).padStart(2, "0")}`;
      try {
        setLoading(true);
        await supabase.delete(BUDGET_TABLE, `month_key=eq.${key}`);
        await supabase.insert(BUDGET_TABLE, rows.map(r => ({ ...r, month_key: key })));
        await loadData();
        setOpenMonths(prev => ({ ...prev, [key]: true }));
        setShowImport(false);
        showToast(`Importati ${rows.length} record per ${getMonthLabel(key)}`);
      } catch (err: unknown) { showToast("Errore importazione"); } finally { setLoading(false); }
    };
    reader.readAsText(file);
  };

  const handleAddRow = async (key: string) => {
    if (!newRow.azione.trim()) return;
    try {
      setLoading(true);
      await supabase.insert(BUDGET_TABLE, [{ month_key: key, azione: newRow.azione, brand: newRow.brand, costo: parseFloat(newRow.costo) || 0, rimborso: parseFloat(newRow.rimborso) || 0, note: newRow.note }]);
      await loadData(); setNewRow(emptyRow); setShowAddRow(null); showToast("Record aggiunto");
    } catch (err: unknown) { showToast("Errore aggiunta"); } finally { setLoading(false); }
  };

  const deleteRow = async (id: string) => { try { setLoading(true); await supabase.delete(BUDGET_TABLE, id); await loadData(); } catch (err: unknown) { showToast("Errore eliminazione"); } finally { setLoading(false); } };

  const startEdit = (row: BudgetRow) => { setEditingRow(row.id); setEditData({ azione: row.azione, brand: row.brand, costo: String(row.costo), rimborso: String(row.rimborso), note: row.note }); };

  const saveEdit = async () => {
    if (!editingRow) return;
    try {
      setLoading(true);
      await supabase.update(BUDGET_TABLE, editingRow, { azione: editData.azione, brand: editData.brand, costo: parseFloat(editData.costo) || 0, rimborso: parseFloat(editData.rimborso) || 0, note: editData.note });
      await loadData(); setEditingRow(null); showToast("Record modificato");
    } catch (err: unknown) { showToast("Errore modifica"); } finally { setLoading(false); }
  };

  const deleteMonth = async (key: string) => {
    if (!confirm(`Eliminare il piano di ${getMonthLabel(key)}?`)) return;
    try { setLoading(true); await supabase.delete(BUDGET_TABLE, `month_key=eq.${key}`); await loadData(); showToast(`Piano eliminato`); } catch (err: unknown) { showToast("Errore"); } finally { setLoading(false); }
  };

  const sortedKeys = Object.keys(plans).sort((a, b) => b.localeCompare(a));
  const [budgetSort, setBudgetSort] = useState<"brand" | "azione">("brand");
  const toggleBudgetSort = () => setBudgetSort(prev => prev === "brand" ? "azione" : "brand");

  const sortedPlans = useMemo(() => {
    const out: Record<string, BudgetRow[]> = {};
    for (const k of Object.keys(plans)) {
      out[k] = [...plans[k]].sort((a, b) => {
        const primary = (a[budgetSort] || "").localeCompare(b[budgetSort] || "");
        if (primary !== 0) return primary;
        const secondary = budgetSort === "brand" ? "azione" : "brand";
        return (a[secondary] || "").localeCompare(b[secondary] || "");
      });
    }
    return out;
  }, [plans, budgetSort]);

  const [convertRow, setConvertRow] = useState<BudgetRow | null>(null);
  const [convertForm, setConvertForm] = useState({ dataInizio: today, dataFine: today, tipologia: TIPOLOGIE[0], soggetto: "", rimborsoPct: "0", costoDichiarato: "", dateSingole: [] as string[], piattaforma: "" });
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertFiles, setConvertFiles] = useState<File[]>([]);
  const convertFileRef = useRef<HTMLInputElement>(null);

  const openConvert = (row: BudgetRow) => {
    const rimbPct = row.costo > 0 ? Math.round((row.rimborso / row.costo) * 100) : 0;
    const matchedTipo = TIPOLOGIE.find(t => t.toLowerCase() === row.azione.trim().toLowerCase()) || TIPOLOGIE[0];
    let piattaforma = "";
    if (matchedTipo === "Digital Adv" && row.note) { const noteL = row.note.toLowerCase(); if (noteL.includes("google")) piattaforma = "Google"; else if (noteL.includes("meta") || noteL.includes("facebook")) piattaforma = "Meta"; }
    setConvertRow(row); setConvertFiles([]); setConvertForm({ dataInizio: today, dataFine: today, tipologia: matchedTipo, soggetto: "", rimborsoPct: String(rimbPct), costoDichiarato: "", dateSingole: [], piattaforma });
  };

  const handleConvert = async () => {
    if (!convertRow) return;
    const isStampa = convertForm.tipologia === "Stampa";
    if (isStampa && convertForm.dateSingole.length === 0) { showToast("Seleziona almeno una data di uscita"); return; }
    if (!isStampa && (!convertForm.dataInizio || !convertForm.dataFine)) { showToast("Compila le date"); return; }
    try {
      setConvertSaving(true);
      const spesa = convertRow.costo || 0;
      const rimbPct = parseFloat(convertForm.rimborsoPct) || 0;
      const costoDich = convertForm.costoDichiarato !== "" ? (parseFloat(convertForm.costoDichiarato) || spesa) : spesa;
      let effDataInizio = convertForm.dataInizio; let effDataFine = convertForm.dataFine; let dateSingoleStr: string | null = null;
      if (isStampa) { const sorted = [...convertForm.dateSingole].sort(); effDataInizio = sorted[0]; effDataFine = sorted[sorted.length - 1]; dateSingoleStr = sorted.join(","); }
      
      let creativita_url: string | null = null; let creativita_nome: string | null = null;
      if (convertFiles.length > 0) {
        const urls: string[] = []; const names: string[] = [];
        for (const file of convertFiles) {
          const fn = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${file.name.split(".").pop()}`;
          await supabase.uploadFile(STORAGE_BUCKET, fn, file);
          urls.push(supabase.getPublicUrl(STORAGE_BUCKET, fn)); names.push(file.name);
        }
        creativita_url = JSON.stringify(urls); creativita_nome = JSON.stringify(names);
      }
      const entry: any = {
        mese_competenza: getMonthKey(effDataInizio), data_inizio: effDataInizio, data_fine: effDataFine, descrizione: convertRow.note || convertRow.azione,
        tipologia: convertForm.tipologia, brand: convertRow.brand || BRANDS[0], soggetto: convertForm.soggetto.trim(), spesa: spesa, rimborso_pct: rimbPct, costo_dichiarato: costoDich,
        numero_partecipanti: 2, piano_extra: false, collettiva: false, nome_collettiva: "", date_singole: dateSingoleStr, mappa_url: null, poster_3x2: 0, poster_altri: 0, poster_maxi: 0,
        creativita_url, creativita_nome, fattura_url: null, fattura_nome: null, da_confermare: true, piattaforma: convertForm.tipologia === "Digital Adv" ? (convertForm.piattaforma || "") : "",
      };
      await supabase.insert(TABLE, entry); showToast("Azione inserita nei Costi Marketing!"); setConvertRow(null); setConvertFiles([]);
    } catch (err: unknown) { showToast("Errore"); } finally { setConvertSaving(false); }
  };

  const allRows = sortedKeys.flatMap(k => sortedPlans[k] || []);
  const grandCosto = allRows.reduce((s, r) => s + (r.costo || 0), 0);
  const grandRimborso = allRows.reduce((s, r) => s + (r.rimborso || 0), 0);

  return (
    <PageShell toast={toast}>
      <NavBar current="budget" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>💰 Budget Planner</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: "6px 0 0" }}>{sortedKeys.length} mesi caricati {allRows.length > 0 && <span style={{ marginLeft: 12 }}>• Costo: <strong style={{ color: "#ea580c" }}>{formatEur(grandCosto)}</strong> • Rimborso: <strong style={{ color: "#059669" }}>{formatEur(grandRimborso)}</strong></span>}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={toggleBudgetSort} style={{ background: "#f1f5f9", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>{budgetSort === "brand" ? "🔤 Per Brand" : "📋 Per Azione"}</button>
          <button className="btn" onClick={() => setShowImport(true)} disabled={loading} style={{ background: "#1e293b", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>📤 Importa CSV</button>
        </div>
      </div>

      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowImport(false)}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>📤 Importa Piano Budget</h2>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}><label style={{ display: "block", fontSize: 11, fontWeight: 700 }}>Mese</label><select value={importMonth} onChange={e => setImportMonth(+e.target.value)} style={inputStyle}>{MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
              <div style={{ flex: 1 }}><label style={{ display: "block", fontSize: 11, fontWeight: 700 }}>Anno</label><select value={importYear} onChange={e => setImportYear(+e.target.value)} style={inputStyle}>{[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}</select></div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ ...inputStyle, padding: 10, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowImport(false)} style={{ background: "#f1f5f9", padding: "9px 16px", borderRadius: 8 }}>Annulla</button>
              <button className="btn" onClick={handleImport} disabled={loading} style={{ background: "#1e293b", color: "#fff", padding: "9px 20px", borderRadius: 8 }}>Importa</button>
            </div>
          </div>
        </div>
      )}

      {sortedKeys.map(key => {
        const rows = sortedPlans[key] || [];
        const isOpen = openMonths[key];
        const totalCosto = rows.reduce((s, r) => s + (r.costo || 0), 0);
        const totalRimborso = rows.reduce((s, r) => s + (r.rimborso || 0), 0);
        return (
          <div key={key} style={{ marginBottom: 16, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e8ecf1" }}>
            <div onClick={() => setOpenMonths(prev => ({ ...prev, [key]: !prev[key] }))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", background: isOpen ? "#f8fafc" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontWeight: 700, fontSize: 16 }}>{getMonthLabel(key)}</span><span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 10px", borderRadius: 20 }}>{rows.length} voci</span></div>
              <div style={{ display: "flex", gap: 16, fontSize: 13 }}><span style={{ color: "#64748b" }}>Costo: <strong style={{ color: "#ea580c" }}>{formatEur(totalCosto)}</strong></span><span style={{ color: "#64748b" }}>Netta: <strong style={{ color: "#7c3aed" }}>{formatEur(totalCosto - totalRimborso)}</strong></span></div>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid #e8ecf1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...cellStyle, fontWeight: 500, color: "#1e293b" }}>{row.azione}</td>
                        <td style={cellStyle}><span style={{ fontSize: 11, fontWeight: 600, background: "#f1f5f9", padding: "2px 10px", borderRadius: 20 }}>{row.brand}</span></td>
                        <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#ea580c" }}>{formatEur(row.costo)}</td>
                        <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#7c3aed" }}>{formatEur((row.costo || 0) - (row.rimborso || 0))}</td>
                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                          {unlocked && <><button className="btn" onClick={() => openConvert(row)} style={{ background: "#eff6ff", color: "#2563eb", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginRight: 4 }}>→ MKT</button><button className="btn" onClick={() => deleteRow(row.id)} style={{ background: "none", color: "#94a3b8", padding: 4, fontSize: 13 }}>🗑</button></>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {convertRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConvertRow(null)}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 500 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>📊 Inserisci nei Costi Marketing</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="Tipologia"><select value={convertForm.tipologia} onChange={e => setConvertForm({ ...convertForm, tipologia: e.target.value })} style={inputStyle}>{TIPOLOGIE.map(t => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Soggetto"><input type="text" value={convertForm.soggetto} onChange={e => setConvertForm({ ...convertForm, soggetto: e.target.value })} style={inputStyle} /></Field>
            </div>
            {convertForm.tipologia === "Stampa" ? (
               <div style={{ marginBottom: 12 }}><Field label="📰 Date uscite stampa"><StampaCalendar selected={convertForm.dateSingole} onChange={dates => setConvertForm({ ...convertForm, dateSingole: dates })} baseMonth={getCurrentMonthKey()} /></Field></div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <Field label="Data inizio"><input type="date" value={convertForm.dataInizio} onChange={e => setConvertForm({ ...convertForm, dataInizio: e.target.value })} style={inputStyle} /></Field>
                <Field label="Data fine"><input type="date" value={convertForm.dataFine} onChange={e => setConvertForm({ ...convertForm, dataFine: e.target.value })} style={inputStyle} /></Field>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn" onClick={() => setConvertRow(null)} style={{ background: "#f1f5f9", padding: "9px 16px", borderRadius: 8 }}>Annulla</button>
              <button className="btn" onClick={handleConvert} disabled={convertSaving} style={{ background: "#2563eb", color: "#fff", padding: "9px 20px", borderRadius: 8 }}>{convertSaving ? "..." : "Inserisci"}</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}