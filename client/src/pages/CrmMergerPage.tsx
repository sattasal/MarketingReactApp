/**
 * PAGINA: CRM Merger
 *
 * Tool per unire export Salesforce: Account CSV + Opportunità CSV → CSV unificato
 * Supporta più file per slot (per aggirare il limite 100k di Salesforce).
 * Deduplicazione automatica per ID 18 byte.
 * Max 3 opportunità per riga di output.
 *
 * Convertito dall'HTML originale al tema chiaro dell'app.
 */

import React, { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { NavBar }    from "../components/shared/NavBar";
import { PageShell } from "../components/shared/PageShell";
import { PageProps } from "../lib/types";

// ─── COLONNE ATTESE ────────────────────────────────────────────────────────────
const ACC = {
  id:      "ID 18 byte",
  nome:    "Person Account: First Name",
  cognome: "Person Account: Last Name",
  email:   "Email",
  tel:     "Person Account: Mobile",
  data:    "Created Date",
};
const OPP = {
  accId:   "ID 18 byte",
  oppId:   "Opportunity ID",
  data:    "Created Date",
  modello: "Modello",
  brand:   "Brand",
  nome:    "Opportunity Name",
};
const ACC_REQUIRED = [ACC.id];
const OPP_REQUIRED = [OPP.accId, OPP.oppId];
const MAX_OPP = 3;

// ─── TIPI ─────────────────────────────────────────────────────────────────────
interface ParsedFile {
  name:   string;
  rows:   any[];
  ok:     boolean;
  error:  string | null;
}

type Step = 1 | 2 | 3;

interface MergeResult {
  accCount:  number;
  oppCount:  number;
  matched:   number;
  unmatched: number;
  accFiles:  number;
  oppFiles:  number;
}

// ─── CSV PARSER (usa xlsx, già nel progetto) ──────────────────────────────────
function parseCSVFile(file: File): Promise<{ rows: any[]; cols: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        // XLSX legge CSV con separatore ;
        const wb   = XLSX.read(text, { type: "string", FS: ";" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
        resolve({ rows, cols });
      } catch (err: any) {
        reject(err.message || "Errore parsing");
      }
    };
    reader.onerror = () => reject("Errore lettura file");
    reader.readAsText(file, "utf-8");
  });
}

function validateCols(cols: string[], required: string[]): string | null {
  const missing = required.filter(c => !cols.includes(c));
  return missing.length ? `Colonne mancanti: ${missing.map(c => `"${c}"`).join(", ")}` : null;
}

// ─── MERGE LOGIC ──────────────────────────────────────────────────────────────
function doMerge(accFiles: ParsedFile[], oppFiles: ParsedFile[]): { csv: string; result: MergeResult } {
  // Unisci tutti i file e deduplica per ID
  const accAll  = accFiles.filter(f => f.ok).flatMap(f => f.rows);
  const accMap  = new Map<string, any>();
  accAll.forEach(a => {
    const k = (a[ACC.id] || "").trim();
    if (k && !accMap.has(k)) accMap.set(k, a);
  });
  const accData = Array.from(accMap.values());

  const oppAll  = oppFiles.filter(f => f.ok).flatMap(f => f.rows);
  const oppSeen = new Set<string>();
  const oppData = oppAll.filter(o => {
    const k = (o[OPP.oppId] || "").trim();
    if (!k || oppSeen.has(k)) return false;
    oppSeen.add(k); return true;
  });

  // Indice account → [opp, ...]
  const idx = new Map<string, any[]>();
  oppData.forEach(o => {
    const k = (o[OPP.accId] || "").trim();
    if (!k) return;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k)!.push(o);
  });

  let matched = 0, unmatched = 0;
  const rows: any[] = [];

  accData.forEach(acc => {
    const key  = (acc[ACC.id] || "").trim();
    const opps = idx.get(key) || [];
    if (opps.length) matched++; else unmatched++;

    const row: any = {
      Account_ID:             acc[ACC.id]     || "",
      Nome:                   acc[ACC.nome]   || "",
      Cognome:                acc[ACC.cognome]|| "",
      Email:                  acc[ACC.email]  || "",
      Telefono:               acc[ACC.tel]    || "",
      Data_Creazione_Account: acc[ACC.data]   || "",
    };

    for (let j = 0; j < MAX_OPP; j++) {
      const o = opps[j] || null;
      const n = j + 1;
      row[`Opp${n}_ID`]      = o ? (o[OPP.oppId]  || "") : "";
      row[`Opp${n}_Data`]    = o ? (o[OPP.data]   || "") : "";
      row[`Opp${n}_Modello`] = o ? (o[OPP.modello]|| "") : "";
      row[`Opp${n}_Brand`]   = o ? (o[OPP.brand]  || "") : "";
      row[`Opp${n}_Nome`]    = o ? (o[OPP.nome]   || "") : "";
    }
    rows.push(row);
  });

  const ws  = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });

  return {
    csv,
    result: {
      accCount:  accData.length,
      oppCount:  oppData.length,
      matched,
      unmatched,
      accFiles:  accFiles.filter(f => f.ok).length,
      oppFiles:  oppFiles.filter(f => f.ok).length,
    },
  };
}

// ─── COMPONENTI INTERNI ────────────────────────────────────────────────────────

// Indicatore step in cima
function StepBar({ step }: { step: Step }) {
  const steps = [
    { n: 1, label: "Account" },
    { n: 2, label: "Opportunità" },
    { n: 3, label: "Risultato" },
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {steps.map((s, i) => {
        const done   = s.n < step;
        const active = s.n === step;
        const numBg  = done ? "#16a34a" : active ? "#1e293b" : "#f1f5f9";
        const numCol = done || active ? "#fff" : "#94a3b8";
        const lblCol = done ? "#16a34a" : active ? "#0f172a" : "#94a3b8";
        return (
          <React.Fragment key={s.n}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: numBg, color: numCol,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700,
                border: `2px solid ${done ? "#16a34a" : active ? "#1e293b" : "#e2e8f0"}`,
                transition: "all .2s",
              }}>{done ? "✓" : s.n}</div>
              <span style={{ fontSize: 13, fontWeight: 700, color: lblCol, textTransform: "uppercase", letterSpacing: ".5px" }}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "0 12px", background: done ? "#16a34a" : "#e2e8f0", transition: "background .3s" }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Dropzone upload
function DropZone({ slot, files, onFiles }: {
  slot: 1 | 2;
  files: ParsedFile[];
  onFiles: (f: FileList) => void;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasOk = files.some(f => f.ok);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  }, [onFiles]);

  const totalRows = files.filter(f => f.ok).reduce((s, f) => s + f.rows.length, 0);

  return (
    <div>
      {/* Zona di drop */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${hasOk ? "#16a34a" : over ? "#3b82f6" : "#e2e8f0"}`,
          borderRadius: 12, background: hasOk ? "#f0fdf4" : over ? "#eff6ff" : "#f8fafc",
          padding: "32px 24px", textAlign: "center", cursor: "pointer",
          transition: "all .2s",
        }}
      >
        <input ref={inputRef} type="file" accept=".csv,.txt" multiple style={{ display: "none" }}
          onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = ""; }}
        />
        <div style={{ fontSize: 32, marginBottom: 8 }}>{slot === 1 ? "📋" : "🚗"}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
          {hasOk ? "➕ Aggiungi altri file" : slot === 1
            ? "Trascina qui i CSV degli Account"
            : "Trascina qui i CSV delle Opportunità"}
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
          {hasOk ? "Trascina o clicca per aggiungere altri CSV" : "Puoi selezionare più file · separatore ;"}
        </div>
      </div>

      {/* Lista file */}
      {files.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              background: f.ok ? "#f0fdf4" : "#fff1f2",
              border: `1px solid ${f.ok ? "#bbf7d0" : "#fecdd3"}`,
              borderRadius: 8, padding: "9px 14px",
              fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span>{f.ok ? "✅" : "❌"}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1e293b" }} title={f.name}>
                {f.name}
              </span>
              {f.ok
                ? <span style={{ color: "#16a34a", flexShrink: 0, fontSize: 12 }}>{f.rows.length.toLocaleString("it-IT")} righe</span>
                : <span style={{ color: "#e11d48", flexShrink: 0, fontSize: 12 }}>{f.error}</span>}
              <button className="btn" onClick={() => { /* gestito nel parent */ }}
                style={{ background: "none", color: "#94a3b8", fontSize: 16, padding: "0 4px", fontWeight: 400 }}
                data-remove={i}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Totale */}
      {hasOk && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8,
          padding: "10px 16px", marginTop: 12,
        }}>
          <span style={{ fontSize: 13, color: "#475569" }}>
            {slot === 1 ? "Totale account caricati" : "Totale opportunità caricate"}
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#16a34a", fontFamily: "'JetBrains Mono', monospace" }}>
            {totalRows.toLocaleString("it-IT")}
          </span>
        </div>
      )}
    </div>
  );
}

// Box schema colonne
function SchemaBox({ slot }: { slot: 1 | 2 }) {
  const tags = slot === 1
    ? [
        { label: "ID 18 byte — chiave univoca", key: true },
        { label: "Created Date" }, { label: "Person Account: First Name" },
        { label: "Person Account: Last Name" }, { label: "Email" },
        { label: "Person Account: Mobile" },
      ]
    : [
        { label: "ID 18 byte — collega all'account", key: true },
        { label: "Opportunity ID", key: true }, { label: "Created Date" },
        { label: "Modello" }, { label: "Brand" }, { label: "Opportunity Name" },
      ];
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#64748b", marginBottom: 10 }}>
        Colonne attese
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {tags.map((t, i) => (
          <span key={i} style={{
            background: t.key ? "#fffbeb" : "#fff",
            border: `1px solid ${t.key ? "#fde68a" : "#e2e8f0"}`,
            borderRadius: 5, padding: "3px 9px", fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            color: t.key ? "#d97706" : "#475569",
          }}>{t.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─── PAGINA PRINCIPALE ────────────────────────────────────────────────────────
export default function CrmMergerPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [step,     setStep]     = useState<Step>(1);
  const [accFiles, setAccFiles] = useState<ParsedFile[]>([]);
  const [oppFiles, setOppFiles] = useState<ParsedFile[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress,   setProgress]   = useState({ pct: 0, sub: "" });
  const [result,     setResult]     = useState<MergeResult | null>(null);
  const [outputCSV,  setOutputCSV]  = useState<string | null>(null);

  // ── Aggiunta file ──────────────────────────────────────────────────────────
  async function handleFiles(slot: 1 | 2, fileList: FileList) {
    const required = slot === 1 ? ACC_REQUIRED : OPP_REQUIRED;
    const setter   = slot === 1 ? setAccFiles   : setOppFiles;
    const current  = slot === 1 ? accFiles       : oppFiles;

    for (const file of Array.from(fileList)) {
      if (current.find(f => f.name === file.name)) continue;

      const entry: ParsedFile = { name: file.name, rows: [], ok: false, error: "Caricamento…" };
      setter(prev => [...prev, entry]);

      try {
        const { rows, cols } = await parseCSVFile(file);
        const err = validateCols(cols, required);
        entry.rows  = rows;
        entry.ok    = !err;
        entry.error = err;
      } catch (e: any) {
        entry.ok    = false;
        entry.error = "Errore parsing: " + e;
      }

      setter(prev => prev.map(f => f.name === entry.name ? { ...entry } : f));
    }
  }

  function removeFile(slot: 1 | 2, idx: number) {
    if (slot === 1) setAccFiles(prev => prev.filter((_, i) => i !== idx));
    else            setOppFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Merge ──────────────────────────────────────────────────────────────────
  function startMerge() {
    setStep(3);
    setProcessing(true);
    setProgress({ pct: 5, sub: "Avvio elaborazione…" });

    setTimeout(() => {
      setProgress({ pct: 20, sub: "Unione e deduplicazione account…" });
      setTimeout(() => {
        setProgress({ pct: 50, sub: "Indicizzazione opportunità…" });
        setTimeout(() => {
          setProgress({ pct: 75, sub: "Generazione righe output…" });
          setTimeout(() => {
            try {
              const { csv, result } = doMerge(accFiles, oppFiles);
              setProgress({ pct: 100, sub: `${result.accCount.toLocaleString("it-IT")} righe generate.` });
              setTimeout(() => {
                setOutputCSV(csv);
                setResult(result);
                setProcessing(false);
              }, 400);
            } catch (e: any) {
              setProgress({ pct: 0, sub: "❌ Errore: " + e.message });
              setProcessing(false);
            }
          }, 300);
        }, 300);
      }, 300);
    }, 100);
  }

  // ── Download ───────────────────────────────────────────────────────────────
  function downloadCSV() {
    if (!outputCSV) return;
    const d  = new Date();
    const ds = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
    const blob = new Blob(["\uFEFF" + outputCSV], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `crm_unificato_${ds}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset() {
    setStep(1); setAccFiles([]); setOppFiles([]);
    setResult(null); setOutputCSV(null); setProcessing(false);
    setProgress({ pct: 0, sub: "" });
  }

  const accHasOk = accFiles.some(f => f.ok);
  const oppHasOk = oppFiles.some(f => f.ok);

  return (
    <PageShell toast={null}>
      <NavBar current="crm-merger" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#8b5cf6" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6", textTransform: "uppercase", letterSpacing: ".5px" }}>
            Tool CRM
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>⚙ CRM Merger</h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
          Unisci export Account e Opportunità da Salesforce in un unico CSV
        </p>
      </div>

      {/* Card principale */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e2e8f0", maxWidth: 860 }}>

        <StepBar step={step} />

        {/* ── STEP 1: ACCOUNT ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>📋 File Account</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, fontFamily: "'JetBrains Mono', monospace" }}>
              Puoi caricare più file CSV — verranno uniti automaticamente
            </p>

            <SchemaBox slot={1} />

            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#1d4ed8" }}>
              ℹ️ Se Salesforce ha il limite 100k righe, esporta più tranche e caricale tutte qui. L'app le unisce e rimuove i duplicati.
            </div>

            <DropZone slot={1} files={accFiles}
              onFiles={fl => handleFiles(1, fl)} />

            {/* Bottoni rimozione file */}
            {accFiles.map((_, i) => null)}

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn" disabled={!accHasOk} onClick={() => setStep(2)} style={{
                padding: "10px 28px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                background: accHasOk ? "#1e293b" : "#f1f5f9",
                color:      accHasOk ? "#fff"    : "#94a3b8",
                cursor:     accHasOk ? "pointer" : "not-allowed",
              }}>
                Continua →
              </button>
            </div>
          </>
        )}

        {/* ── STEP 2: OPPORTUNITÀ ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>🚗 File Opportunità</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20, fontFamily: "'JetBrains Mono', monospace" }}>
              Puoi caricare più file CSV — verranno uniti automaticamente
            </p>

            <SchemaBox slot={2} />

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
              ℹ️ Il CSV finale conterrà <strong>Opportunity Name</strong> per ogni opportunità (max 3 per account).
            </div>

            <DropZone slot={2} files={oppFiles}
              onFiles={fl => handleFiles(2, fl)} />

            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn" onClick={() => setStep(1)} style={{
                padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: "#f1f5f9", color: "#475569",
              }}>
                ← Indietro
              </button>
              <button className="btn" disabled={!oppHasOk} onClick={startMerge} style={{
                padding: "10px 28px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                background: oppHasOk ? "#1e293b" : "#f1f5f9",
                color:      oppHasOk ? "#fff"    : "#94a3b8",
                cursor:     oppHasOk ? "pointer" : "not-allowed",
              }}>
                ⚙ Avvia elaborazione
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: PROGRESS + RISULTATO ──────────────────────────── */}
        {step === 3 && (
          <>
            {/* Progress */}
            {processing && (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 20 }}>
                  Elaborazione in corso…
                </div>
                <div style={{ background: "#f1f5f9", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 12 }}>
                  <div style={{
                    height: "100%", background: "#1e293b", borderRadius: 6,
                    width: `${progress.pct}%`, transition: "width .3s ease",
                  }} />
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace" }}>
                  {progress.sub}
                </div>
              </div>
            )}

            {/* Risultato */}
            {!processing && result && (
              <>
                <div style={{ background: "#f0fdf4", border: "2px solid #16a34a", borderRadius: 14, padding: "32px", textAlign: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                  <h2 style={{ fontSize: 26, fontWeight: 800, color: "#16a34a", marginBottom: 8 }}>File pronto!</h2>
                  <p style={{ fontSize: 12, color: "#64748b", marginBottom: 24, fontFamily: "'JetBrains Mono', monospace" }}>
                    {result.accFiles} file account · {result.oppFiles} file opp. · deduplicazione automatica · max {MAX_OPP} opp. per riga · sep: ;
                  </p>

                  {/* Stats */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
                    {[
                      { n: result.accCount,  l: "Account totali" },
                      { n: result.oppCount,  l: "Opp. totali" },
                      { n: result.matched,   l: "Con opportunità" },
                      { n: result.unmatched, l: "Senza opportunità" },
                    ].map((s, i) => (
                      <div key={i} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "'JetBrains Mono', monospace" }}>
                          {s.n.toLocaleString("it-IT")}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".5px", marginTop: 4 }}>
                          {s.l}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button className="btn" onClick={downloadCSV} style={{
                    padding: "14px 40px", borderRadius: 10, fontSize: 16, fontWeight: 700,
                    background: "#16a34a", color: "#fff",
                  }}>
                    ⬇ Scarica CSV unificato
                  </button>
                </div>

                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button className="btn" onClick={reset} style={{
                    padding: "9px 24px", borderRadius: 8, fontSize: 14,
                    background: "#f1f5f9", color: "#475569",
                  }}>
                    ↺ Ricomincia
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Nota rimozione file — gestita separatamente per semplicità */}
      <p style={{ textAlign: "center", fontSize: 12, color: "#cbd5e1", marginTop: 20, paddingBottom: 20 }}>
        Elaborazione 100% locale — nessun dato viene inviato a server esterni
      </p>
    </PageShell>
  );
}
