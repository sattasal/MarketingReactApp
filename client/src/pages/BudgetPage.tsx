import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { TABLE, BUDGET_TABLE, TIPOLOGIE, BRANDS, STORAGE_BUCKET, MESI, today, MAX_FILE_SIZE } from "../lib/constants";
import { PageProps, BudgetRow } from "../lib/types";
import { bgParseCSV, getMonthLabel, getMonthKey, formatEur } from "../lib/utils";
import { NavBar, inputStyle } from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { Field } from "../components/shared/Field";
import { cellStyle, StampaCalendar } from "./MarketingCostsPage";

// ── Modale importazione multipla ─────────────────────────────────────────────
function MultiConvertModal({
  rows,
  onClose,
  onDone,
}: {
  rows: BudgetRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [dataInizio, setDataInizio] = useState(today);
  const [dataFine, setDataFine] = useState(today);
  const [saving, setSaving] = useState(false);

  // Stato per tipologia e soggetto per ogni riga
  const [perRow, setPerRow] = useState<Record<string, { tipologia: string; soggetto: string; dateSingole: string[] }>>(
    () => Object.fromEntries(
      rows.map(r => [r.id, {
        tipologia: TIPOLOGIE.find(t => t.toLowerCase() === r.azione.trim().toLowerCase()) || TIPOLOGIE[0],
        soggetto: r.note || "",
        dateSingole: [],
      }])
    )
  );

  const setRowField = (id: string, field: string, value: any) => {
    setPerRow(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const getCurrentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const row of rows) {
        const pr = perRow[row.id];
        const isStampa = pr.tipologia === "Stampa";
        let effInizio = dataInizio, effFine = dataFine, dateSingoleStr: string | null = null;
        if (isStampa) {
          if (pr.dateSingole.length === 0) continue;
          const sorted = [...pr.dateSingole].sort();
          effInizio = sorted[0]; effFine = sorted[sorted.length - 1];
          dateSingoleStr = sorted.join(",");
        }
        const entry: any = {
          mese_competenza: getMonthKey(effInizio),
          data_inizio: effInizio, data_fine: effFine,
          descrizione: pr.soggetto.trim() || row.azione,
          tipologia: pr.tipologia,
          brand: row.brand || BRANDS[0],
          soggetto: pr.soggetto.trim(),
          spesa: row.costo || 0,
          rimborso_pct: row.costo > 0 ? Math.round((row.rimborso / row.costo) * 100) : 0,
          costo_dichiarato: row.costo || 0,
          numero_partecipanti: 2, piano_extra: false, collettiva: false, nome_collettiva: "",
          date_singole: dateSingoleStr, mappa_url: null,
          poster_3x2: 0, poster_altri: 0, poster_maxi: 0,
          creativita_url: null, creativita_nome: null,
          fattura_url: null, fattura_nome: null, da_confermare: true,
          piattaforma: pr.tipologia === "Digital Adv" ? "" : "",
        };
        await supabase.insert(TABLE, entry);
      }
      onDone();
    } catch (err: unknown) {
      alert("Errore durante l'importazione: " + (err instanceof Error ? err.message : ""));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>📊 Importa nei Costi Marketing</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>{rows.length} azioni selezionate · Totale: <strong style={{ color: "#ea580c" }}>{formatEur(rows.reduce((s, r) => s + r.costo, 0))}</strong></p>

        {/* Date comuni */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "14px 16px", marginBottom: 20, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 10 }}>📅 Date (comuni a tutte le azioni non-Stampa)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Data inizio">
              <input type="date" value={dataInizio} onChange={e => setDataInizio(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Data fine">
              <input type="date" value={dataFine} min={dataInizio} onChange={e => setDataFine(e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </div>

        {/* Tabella righe */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {rows.map(row => {
            const pr = perRow[row.id];
            const isStampa = pr.tipologia === "Stampa";
            return (
              <div key={row.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#fafafa" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", flex: 1 }}>{row.azione}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, background: "#f1f5f9", padding: "2px 8px", borderRadius: 20 }}>{row.brand}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: "#ea580c" }}>{formatEur(row.costo)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Tipologia">
                    <select value={pr.tipologia} onChange={e => setRowField(row.id, "tipologia", e.target.value)} style={inputStyle}>
                      {TIPOLOGIE.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Soggetto">
                    <input type="text" value={pr.soggetto} onChange={e => setRowField(row.id, "soggetto", e.target.value)} style={inputStyle} placeholder="Soggetto..." />
                  </Field>
                </div>
                {isStampa && (
                  <div style={{ marginTop: 10 }}>
                    <Field label="📰 Date uscite stampa">
                      <StampaCalendar
                        selected={pr.dateSingole}
                        onChange={dates => setRowField(row.id, "dateSingole", dates)}
                        baseMonth={getCurrentMonthKey()}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 16px", borderRadius: 8 }}>Annulla</button>
          <button className="btn" onClick={handleSave} disabled={saving}
            style={{ background: "#2563eb", color: "#fff", padding: "9px 24px", borderRadius: 8, fontWeight: 700 }}>
            {saving ? "Importazione..." : `Importa ${rows.length} azioni`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────
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

  // Selezione multipla per importazione
  const [selectedForImport, setSelectedForImport] = useState<Set<string>>(new Set());
  const [multiConvertRows, setMultiConvertRows] = useState<BudgetRow[] | null>(null);

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
        await supabase.deleteWhere(BUDGET_TABLE, `month_key=eq.${key}`);
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

  const deleteRow = async (id: string) => {
    try { setLoading(true); await supabase.delete(BUDGET_TABLE, id); await loadData(); }
    catch (err: unknown) { showToast("Errore eliminazione"); } finally { setLoading(false); }
  };

  const startEdit = (row: BudgetRow) => {
    setEditingRow(row.id);
    setEditData({ azione: row.azione, brand: row.brand, costo: String(row.costo), rimborso: String(row.rimborso), note: row.note });
  };

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
    try {
      setLoading(true);
      await supabase.deleteWhere(BUDGET_TABLE, `month_key=eq.${key}`);
      await loadData(); showToast("Piano eliminato");
    } catch (err: unknown) { showToast("Errore"); } finally { setLoading(false); }
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

  // Tutte le righe visibili (per gestire selezione cross-month)
  const allVisibleRows = useMemo(() => sortedKeys.flatMap(k => sortedPlans[k] || []), [sortedKeys, sortedPlans]);

  const toggleSelect = (id: string) => {
    setSelectedForImport(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (rows: BudgetRow[]) => {
    const ids = rows.map(r => r.id);
    const allSelected = ids.every(id => selectedForImport.has(id));
    setSelectedForImport(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleOpenMultiConvert = () => {
    const rows = allVisibleRows.filter(r => selectedForImport.has(r.id));
    if (rows.length === 0) return;
    setMultiConvertRows(rows);
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
          <p style={{ color: "#64748b", fontSize: 14, margin: "6px 0 0" }}>
            {sortedKeys.length} mesi caricati
            {allRows.length > 0 && (
              <span style={{ marginLeft: 12 }}>
                · Costo: <strong style={{ color: "#ea580c" }}>{formatEur(grandCosto)}</strong>
                · Rimborso: <strong style={{ color: "#059669" }}>{formatEur(grandRimborso)}</strong>
              </span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={toggleBudgetSort}
            style={{ background: "#f1f5f9", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
            {budgetSort === "brand" ? "🔤 Per Brand" : "📋 Per Azione"}
          </button>
          <button className="btn" onClick={() => setShowImport(true)} disabled={loading}
            style={{ background: "#1e293b", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            📤 Importa CSV
          </button>
        </div>
      </div>

      {/* Barra azioni selezione multipla */}
      {selectedForImport.size > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#2563eb" }}>
            ✓ {selectedForImport.size} {selectedForImport.size === 1 ? "azione selezionata" : "azioni selezionate"}
            {" · "}<strong style={{ color: "#ea580c" }}>{formatEur(allVisibleRows.filter(r => selectedForImport.has(r.id)).reduce((s, r) => s + r.costo, 0))}</strong>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setSelectedForImport(new Set())}
              style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 12 }}>
              Deseleziona tutto
            </button>
            <button className="btn" onClick={handleOpenMultiConvert}
              style={{ background: "#2563eb", color: "#fff", padding: "6px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
              📊 Importa nei Costi Marketing
            </button>
          </div>
        </div>
      )}

      {/* Modal importa CSV */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
          onClick={() => setShowImport(false)}>
          <div onClick={ev => ev.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>📤 Importa Piano Budget</h2>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700 }}>Mese</label>
                <select value={importMonth} onChange={e => setImportMonth(+e.target.value)} style={inputStyle}>
                  {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700 }}>Anno</label>
                <select value={importYear} onChange={e => setImportYear(+e.target.value)} style={inputStyle}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ ...inputStyle, padding: 10, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowImport(false)} style={{ background: "#f1f5f9", padding: "9px 16px", borderRadius: 8 }}>Annulla</button>
              <button className="btn" onClick={handleImport} disabled={loading} style={{ background: "#1e293b", color: "#fff", padding: "9px 20px", borderRadius: 8 }}>Importa</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista mesi */}
      {sortedKeys.map(key => {
        const rows = sortedPlans[key] || [];
        const isOpen = openMonths[key];
        const totalCosto = rows.reduce((s, r) => s + (r.costo || 0), 0);
        const totalRimborso = rows.reduce((s, r) => s + (r.rimborso || 0), 0);
        const allMonthSelected = rows.length > 0 && rows.every(r => selectedForImport.has(r.id));
        const someMonthSelected = rows.some(r => selectedForImport.has(r.id));

        return (
          <div key={key} style={{ marginBottom: 16, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e8ecf1" }}>
            {/* Header mese */}
            <div style={{ display: "flex", alignItems: "center", padding: "14px 20px", background: isOpen ? "#f8fafc" : "#fff", gap: 10 }}>
              {/* Checkbox seleziona tutto il mese */}
              <input
                type="checkbox"
                checked={allMonthSelected}
                ref={el => { if (el) el.indeterminate = someMonthSelected && !allMonthSelected; }}
                onChange={() => toggleSelectAll(rows)}
                style={{ accentColor: "#2563eb", width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
                title="Seleziona tutto il mese"
              />
              <div onClick={() => setOpenMonths(prev => ({ ...prev, [key]: !prev[key] }))}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{getMonthLabel(key)}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 10px", borderRadius: 20 }}>{rows.length} voci</span>
                  {someMonthSelected && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: 20 }}>
                      {rows.filter(r => selectedForImport.has(r.id)).length} sel.
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                  <span style={{ color: "#64748b" }}>Costo: <strong style={{ color: "#ea580c" }}>{formatEur(totalCosto)}</strong></span>
                  <span style={{ color: "#64748b" }}>Netta: <strong style={{ color: "#7c3aed" }}>{formatEur(totalCosto - totalRimborso)}</strong></span>
                </div>
              </div>
            </div>

            {/* Righe */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #e8ecf1" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedForImport.has(row.id) ? "#eff6ff" : "transparent" }}>
                        {/* Checkbox singola riga */}
                        <td style={{ ...cellStyle, width: 36, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedForImport.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            style={{ accentColor: "#2563eb", width: 14, height: 14, cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ ...cellStyle, fontWeight: 500, color: "#1e293b" }}>{row.azione}</td>
                        <td style={cellStyle}>
                          <span style={{ fontSize: 11, fontWeight: 600, background: "#f1f5f9", padding: "2px 10px", borderRadius: 20 }}>{row.brand}</span>
                        </td>
                        <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#ea580c" }}>{formatEur(row.costo)}</td>
                        <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#7c3aed" }}>{formatEur((row.costo || 0) - (row.rimborso || 0))}</td>
                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                          {unlocked && (
                            <button className="btn" onClick={() => deleteRow(row.id)}
                              style={{ background: "none", color: "#94a3b8", padding: 4, fontSize: 13 }}>🗑</button>
                          )}
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

      {/* Modale importazione multipla */}
      {multiConvertRows && (
        <MultiConvertModal
          rows={multiConvertRows}
          onClose={() => setMultiConvertRows(null)}
          onDone={() => {
            setMultiConvertRows(null);
            setSelectedForImport(new Set());
            showToast(`✓ ${multiConvertRows.length} azioni importate nei Costi Marketing!`);
          }}
        />
      )}
    </PageShell>
  );
}
