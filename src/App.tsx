import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import ReachPage from "./pages/ReachPage";

// ============================================================
// ⚠️  CONFIGURA QUI LE TUE CREDENZIALI SUPABASE
// ============================================================
export const SUPABASE_URL = "https://rlgfdsvqintkibxrxdaw.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZ2Zkc3ZxaW50a2lieHJ4ZGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTk0ODEsImV4cCI6MjA4NjI5NTQ4MX0.vGsri3DXyd7B-eCzZv7S7asDMOzMOR1zi-ncikq1baQ";
// ============================================================

export const MAX_FILE_SIZE = 500 * 1024;

// Helper: parse creativita fields — handles both legacy single URL and JSON array
export function parseCreativitaFiles(url: string | null, nome: string | null): { url: string; nome: string }[] {
  if (!url) return [];
  try {
    const urls = JSON.parse(url);
    const nomi = nome ? JSON.parse(nome) : [];
    if (Array.isArray(urls)) return urls.map((u: string, i: number) => ({ url: u, nome: nomi[i] || "" }));
  } catch {}
  return [{ url, nome: nome || "" }];
}
export function isImageUrl(url: string): boolean { return /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(url); }
export const STORAGE_BUCKET = "creativita";
export const TABLE = "marketing_entries";
const STAGE_ID = "351b3bffc8e40e37cdb3109c3aa47aec0164456f55dd0a8c96c38cf07b833ece";
async function verifyPin(pin: string): Promise<boolean> {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === STAGE_ID;
}

export const supabase = {
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
  url: (path: string) => `${SUPABASE_URL}/rest/v1/${path}`,
  storageUrl: (path: string) => `${SUPABASE_URL}/storage/v1/${path}`,
  async select(table: string, params = "") { const r = await fetch(this.url(`${table}?${params}`), { headers: this.headers }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async insert(table: string, data: any) { const r = await fetch(this.url(table), { method: "POST", headers: this.headers, body: JSON.stringify(data) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async update(table: string, id: string, data: any) { const r = await fetch(this.url(`${table}?id=eq.${id}`), { method: "PATCH", headers: this.headers, body: JSON.stringify(data) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async delete(table: string, id: string) { const r = await fetch(this.url(`${table}?id=eq.${id}`), { method: "DELETE", headers: this.headers }); if (!r.ok) throw new Error(await r.text()); },
  async uploadFile(bucket: string, path: string, file: File) { const r = await fetch(this.storageUrl(`object/${bucket}/${path}`), { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": file.type, "x-upsert": "true" }, body: file }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async deleteFile(bucket: string, paths: string[]) { await fetch(this.storageUrl(`object/${bucket}`), { method: "DELETE", headers: { ...this.headers }, body: JSON.stringify({ prefixes: paths }) }).catch(() => {}); },
  getPublicUrl(bucket: string, path: string) { return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`; },
};

export const TIPOLOGIE = ["Radio", "OOH", "Stampa", "Digital Adv", "Evento", "Sponsor", "Partner", "Servizio", "Altro online", "Altro offline"];
export const BRANDS = ["Fiat", "Jeep", "Alfa Romeo", "Lancia", "Leapmotor", "Opel", "Peugeot", "Citroen", "DS", "Honda", "Skoda", "BYD", "Dongfeng", "Hurba", "MyUsato", "Post Vendita", "Commerciali", "Vaigo", "Leonori", "Veicoli nuovi"];
const OFFLINE_TYPES = ["Radio", "OOH", "Stampa", "Evento", "Sponsor", "Altro offline"];
const ONLINE_TYPES = ["Digital Adv", "Altro online"];
const MEDIA_COLORS: Record<string, string> = {
  "Radio": "#e11d48", "OOH": "#ea580c", "Stampa": "#0284c7", "Digital Adv": "#7c3aed",
  "Evento": "#059669", "Sponsor": "#d97706", "Partner": "#8b5cf6", "Servizio": "#0891b2",
  "Altro online": "#6366f1", "Altro offline": "#78716c",
};
function getMediaColor(tip: string) { return MEDIA_COLORS[tip] || "#64748b"; }
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export function getMonthKey(dateStr: string) { const d = new Date(dateStr); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function getMonthLabel(key: string) { const [y, m] = key.split("-"); return `${MESI[parseInt(m, 10) - 1]} ${y}`; }
function getMonthLabelShort(key: string) { const [y, m] = key.split("-"); return `${MESI_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}`; }
export function getCurrentMonthKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
export function formatEur(n: number) { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)); }
export function formatDate(dateStr: string) { return new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT"); }
function formatFileSize(bytes: number) { return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(1) + " KB"; }
function daysBetween(d1: string, d2: string) { const a = new Date(d1+"T00:00:00"); const b = new Date(d2+"T00:00:00"); return Math.max(1, Math.round((b.getTime()-a.getTime())/86400000)+1); }

// importo rimborso = spesa × rimborso_pct%
// Importo rimborso: costo_dichiarato × rimborso%
function calcImportoRimborso(e: Entry) {
  return e.costo_dichiarato * e.rimborso_pct / 100;
}
// Spesa netta: se collettiva → (spesa − rimborso) / n_partecipanti, altrimenti → spesa − rimborso. Può essere negativa.
function calcSpesaNetta(e: Entry) {
  const netta = e.spesa - calcImportoRimborso(e);
  return e.collettiva && e.numero_partecipanti > 0 ? netta / e.numero_partecipanti : netta;
}

export const today = new Date().toISOString().slice(0, 10);

interface Entry {
  id: string;
  meseCompetenza: string;
  dataInizio: string;
  dataFine: string;
  descrizione: string;
  tipologia: string;
  brand: string;
  soggetto: string;
  spesa: number;
  rimborso_pct: number;
  costo_dichiarato: number;
  numero_partecipanti: number;
  creativita_url: string | null;
  creativita_nome: string | null;
  piano_extra: boolean;
  collettiva: boolean;
  nome_collettiva: string;
  da_confermare: boolean;
  date_singole: string | null;
  mappa_url: string | null;
  poster_3x2: number;
  poster_altri: number;
  poster_maxi: number;
  fattura_url: string | null;
  fattura_nome: string | null;
  piattaforma: string;
}

const emptyForm = {
  dataInizio: today, dataFine: today, descrizione: "", tipologia: TIPOLOGIE[0],
  brand: BRANDS[0], soggetto: "", spesa: "", rimborsoPct: "",
  costoDichiarato: "", numeroPartecipanti: "2",
  pianoExtra: false, collettiva: false, nomeCollettiva: "",
  dateSingole: [] as string[],
  mappaUrl: "", poster3x2: "", posterAltri: "", posterMaxi: "",
  piattaforma: "",
};

export type PageType = "marketing" | "ooh" | "collettive" | "piani-extra" | "timeline" | "creativita" | "lead-contratti" | "budget" | "reach";

export interface PageProps {
  onNavigate: (p: PageType) => void;
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
}

// Brand color map for timeline
const BRAND_COLORS: Record<string, string> = {
  "Fiat": "#d32f2f", "Jeep": "#2e7d32", "Alfa Romeo": "#8b0000", "Lancia": "#1565c0",
  "Leapmotor": "#0097a7", "Opel": "#f9a825", "Peugeot": "#1a237e", "Citroen": "#c62828",
  "DS": "#6a1b9a", "Honda": "#e64a19", "Skoda": "#388e3c", "BYD": "#0d47a1",
  "Dongfeng": "#4e342e", "Hurba": "#ff6f00", "MyUsato": "#e65100", "Post Vendita": "#546e7a",
  "Commerciali": "#37474f", "Vaigo": "#00838f", "Leonori": "#795548", "Veicoli nuovi": "#455a64",
};
function getBrandColor(brand: string): string { return BRAND_COLORS[brand] || "#607d8b"; }

// Export utilities
function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = "\uFEFF";
  const csv = bom + [headers.join(";"), ...rows.map(r => r.map(c => `"${(c||"").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

function ExportBar({ onCSV, onPrint }: { onCSV: () => void; onPrint: () => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <button className="btn" onClick={onCSV} style={{ background: "#059669", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>📥 Esporta Excel (CSV)</button>
      <button className="btn" onClick={onPrint} style={{ background: "#7c3aed", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>🖨 Stampa / PDF</button>
    </div>
  );
}

// Multi-day calendar picker for Stampa
function StampaCalendar({ selected, onChange, baseMonth }: { selected: string[]; onChange: (dates: string[]) => void; baseMonth: string }) {
  const [viewMonth, setViewMonth] = useState(baseMonth || getCurrentMonthKey());
  const [yr, mo] = viewMonth.split("-").map(Number);
  const daysInMo = new Date(yr, mo, 0).getDate();
  const firstDow = new Date(yr, mo - 1, 1).getDay(); // 0=Sun
  const adjDow = firstDow === 0 ? 6 : firstDow - 1; // Monday-first

  const toggleDate = (d: number) => {
    const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    onChange(selected.includes(iso) ? selected.filter(x => x !== iso) : [...selected, iso].sort());
  };

  const prevMonth = () => {
    const nm = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, "0")}`;
    setViewMonth(nm);
  };
  const nextMonth = () => {
    const nm = mo === 12 ? `${yr + 1}-01` : `${yr}-${String(mo + 1).padStart(2, "0")}`;
    setViewMonth(nm);
  };

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
        {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => (
          <div key={d} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "4px 0", textTransform: "uppercase" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;
          const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = selected.includes(iso);
          return (
            <div key={d} onClick={() => toggleDate(d)} style={{
              width: 32, height: 32, lineHeight: "32px", borderRadius: 8, fontSize: 13, fontWeight: isSelected ? 700 : 400, cursor: "pointer", margin: "0 auto",
              background: isSelected ? "#2563eb" : "transparent", color: isSelected ? "#fff" : "#334155",
              border: isSelected ? "none" : "1px solid transparent", transition: "all .1s",
            }}
              onMouseEnter={e => { if (!isSelected) (e.target as HTMLElement).style.background = "#dbeafe"; }}
              onMouseLeave={e => { if (!isSelected) (e.target as HTMLElement).style.background = "transparent"; }}
            >{d}</div>
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
      <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>📰 {selected.length} uscit{selected.length === 1 ? "a" : "e"} selezionat{selected.length === 1 ? "a" : "e"}</div>
    </div>
  );
}

// Helper: Google Maps embed URL
function getEmbedUrl(raw: string): string {
  if (raw.includes("/embed")) return raw;
  const midMatch = raw.match(/mid=([^&"]+)/);
  if (midMatch) return `https://www.google.com/maps/d/u/0/embed?mid=${midMatch[1]}`;
  return raw;
}

// Mini Gantt timeline for a set of entries within a month range
function MiniGantt({ entries, monthKey }: { entries: Entry[]; monthKey: string }) {
  const [yr, mo] = monthKey.split("-").map(Number);
  const daysInMo = new Date(yr, mo, 0).getDate();
  const days = Array.from({ length: daysInMo }, (_, i) => i + 1);
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMo).padStart(2, "0")}`;
  const vis = entries.filter(e => e.dataInizio <= monthEnd && e.dataFine >= monthStart);

  function getActive(e: Entry): Set<number> {
    const s = new Set<number>();
    if (e.tipologia === "Stampa" && e.date_singole) {
      for (const d of e.date_singole.split(",")) { if (d.startsWith(monthKey)) s.add(new Date(d + "T00:00:00").getDate()); }
      return s;
    }
    const sd = new Date(e.dataInizio + "T00:00:00") < new Date(monthStart + "T00:00:00") ? 1 : new Date(e.dataInizio + "T00:00:00").getDate();
    const ed = new Date(e.dataFine + "T00:00:00") > new Date(monthEnd + "T00:00:00") ? daysInMo : new Date(e.dataFine + "T00:00:00").getDate();
    for (let i = sd; i <= ed; i++) s.add(i);
    return s;
  }

  if (vis.length === 0) return null;

  return (
    <div style={{ overflowX: "auto", marginTop: 10, marginBottom: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 }}>📅 {MESI[mo - 1]} {yr}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: 600 }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 6px", textAlign: "left", fontSize: 9, color: "#94a3b8", minWidth: 120 }}>Azione</th>
            {days.map(d => <th key={d} style={{ padding: "2px 1px", textAlign: "center", fontSize: 8, color: "#94a3b8", minWidth: 16 }}>{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {vis.map(e => {
            const active = getActive(e);
            const color = getMediaColor(e.tipologia);
            const abbr = e.tipologia.slice(0, 3).toUpperCase();
            return (
              <tr key={e.id}>
                <td style={{ padding: "2px 6px", fontSize: 10, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }} title={e.descrizione}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, marginRight: 4, verticalAlign: "middle" }} />{e.tipologia}
                </td>
                {days.map(d => (
                  <td key={d} style={{ padding: 0, height: 18 }}>
                    {active.has(d) && <div style={{ background: color, height: "100%", minHeight: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 7, fontWeight: 700, borderRadius: e.tipologia === "Stampa" ? 3 : 0 }}>{abbr}</div>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Generate HTML report for a collettiva group
function downloadPianoCollettiva(groupName: string, groupEntries: Entry[]) {
  const totSpesa = groupEntries.reduce((s, e) => s + e.spesa, 0);
  const totNetta = groupEntries.reduce((s, e) => s + calcSpesaNetta(e), 0);
  const oohEntries = groupEntries.filter(e => e.tipologia === "OOH" && e.mappa_url);

  // Compute month range
  const allMonths = Array.from(new Set(groupEntries.map(e => e.meseCompetenza))).sort();

  // Timeline HTML
  const timelineMonths = allMonths.map(mk => {
    const [y, m] = mk.split("-").map(Number);
    const dim = new Date(y, m, 0).getDate();
    const ms = `${mk}-01`, me = `${mk}-${String(dim).padStart(2, "0")}`;
    const vis = groupEntries.filter(e => e.dataInizio <= me && e.dataFine >= ms);
    if (vis.length === 0) return "";
    const headerCells = Array.from({ length: dim }, (_, i) => `<th style="padding:2px;text-align:center;font-size:8px;color:#94a3b8;min-width:16px">${i + 1}</th>`).join("");
    const rows = vis.map(e => {
      const active = new Set<number>();
      if (e.tipologia === "Stampa" && e.date_singole) {
        for (const d of e.date_singole.split(",")) { if (d.startsWith(mk)) active.add(new Date(d + "T00:00:00").getDate()); }
      } else {
        const sd = new Date(e.dataInizio + "T00:00:00") < new Date(ms + "T00:00:00") ? 1 : new Date(e.dataInizio + "T00:00:00").getDate();
        const ed = new Date(e.dataFine + "T00:00:00") > new Date(me + "T00:00:00") ? dim : new Date(e.dataFine + "T00:00:00").getDate();
        for (let i = sd; i <= ed; i++) active.add(i);
      }
      const color = getMediaColor(e.tipologia);
      const cells = Array.from({ length: dim }, (_, i) => active.has(i + 1) ? `<td style="padding:0;height:18px"><div style="background:${color};height:100%;min-height:16px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:7px;font-weight:700">${e.tipologia.slice(0, 3).toUpperCase()}</div></td>` : `<td style="padding:0;height:18px"></td>`).join("");
      return `<tr><td style="padding:2px 6px;font-size:10px;white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:4px;vertical-align:middle"></span>${e.tipologia}</td>${cells}</tr>`;
    }).join("");
    return `<h3 style="font-size:14px;margin:16px 0 6px">${MESI[m - 1]} ${y}</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr><th style="padding:4px 6px;text-align:left;font-size:9px;min-width:120px">Azione</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");

  // Map iframes
  const mapsHtml = oohEntries.map(e => {
    const url = getEmbedUrl(e.mappa_url!);
    return `<div style="margin:16px 0"><h3 style="font-size:14px">📍 ${e.descrizione} — ${e.brand}</h3><p style="font-size:12px;color:#64748b">${formatDate(e.dataInizio)} → ${formatDate(e.dataFine)} · Poster: ${e.poster_3x2 + e.poster_altri + e.poster_maxi} (3x2: ${e.poster_3x2}, altri: ${e.poster_altri}, maxi: ${e.poster_maxi})</p><iframe src="${url}" width="100%" height="400" style="border:0;border-radius:8px" allowfullscreen loading="lazy"></iframe></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Piano Collettiva — ${groupName}</title><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{font-family:'DM Sans',sans-serif;max-width:1100px;margin:0 auto;padding:24px;color:#1e293b}table{border-collapse:collapse}th,td{border-bottom:1px solid #e8ecf1}h1{font-size:22px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #e8ecf1;padding-bottom:6px}.sum{display:inline-block;background:#f1f5f9;padding:6px 14px;border-radius:8px;margin:4px 6px 4px 0;font-size:13px;font-weight:600}@media print{body{padding:12px}iframe{height:300px !important}}</style></head><body>
<h1>🤝 Piano Collettiva: ${groupName}</h1>
<p style="color:#64748b">${groupEntries.length} azioni · Generato il ${new Date().toLocaleDateString("it-IT")}</p>
<div style="margin:16px 0"><span class="sum">💰 Spesa totale: ${formatEur(totSpesa)}</span><span class="sum">🧾 Spesa netta: ${formatEur(totNetta)}</span></div>

<h2>📋 Dettaglio azioni</h2>
<table style="width:100%;font-size:13px"><thead><tr style="background:#f8fafc"><th style="padding:8px;text-align:left">Descrizione</th><th style="padding:8px">Tipo</th><th style="padding:8px">Brand</th><th style="padding:8px">Periodo</th><th style="padding:8px;text-align:right">Spesa</th><th style="padding:8px;text-align:right">Sp.Netta</th></tr></thead><tbody>
${groupEntries.map(e => `<tr><td style="padding:6px 8px">${e.descrizione}</td><td style="padding:6px 8px;text-align:center"><span style="background:${OFFLINE_TYPES.includes(e.tipologia) ? '#fef3c7' : '#dbeafe'};padding:2px 6px;border-radius:4px;font-size:10px">${e.tipologia}</span></td><td style="padding:6px 8px">${e.brand}</td><td style="padding:6px 8px;font-size:11px">${formatDate(e.dataInizio)} → ${formatDate(e.dataFine)}</td><td style="padding:6px 8px;text-align:right;font-weight:600">${formatEur(e.spesa)}</td><td style="padding:6px 8px;text-align:right;font-weight:600;color:#059669">${formatEur(calcSpesaNetta(e))}</td></tr>`).join("")}
</tbody></table>

<h2>📅 Timeline</h2>
${timelineMonths || "<p style='color:#94a3b8'>Nessun dato timeline</p>"}

${oohEntries.length > 0 ? `<h2>📍 Mappe OOH</h2>${mapsHtml}` : ""}
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `piano-collettiva-${groupName.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#1e293b", background: "#f8fafc", transition: "all .15s ease", boxSizing: "border-box" };
export const cellStyle: React.CSSProperties = { padding: "8px 10px", whiteSpace: "nowrap" };

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</label>{children}</div>);
}

function SummaryCard({ label, value, icon, gradient, textColor, subColor, detail }: any) {
  return (
    <div style={{ background: gradient, borderRadius: 14, padding: "20px 24px", boxShadow: "0 4px 16px rgba(0,0,0,.1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: subColor, textTransform: "uppercase", letterSpacing: ".3px" }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: textColor, fontFamily: "'JetBrains Mono', monospace" }}>{formatEur(value)}</div>
      {detail && <div style={{ fontSize: 11, color: subColor, marginTop: 6 }}>{detail}</div>}
    </div>
  );
}

export function NavBar({ current, onNavigate, unlocked, setUnlocked }: { current: PageType; onNavigate: (p: PageType) => void; unlocked: boolean; setUnlocked: (v: boolean) => void }) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState(false);
  const tabs: { key: PageType; label: string; icon: string }[] = [
    { key: "marketing", label: "Costi Marketing", icon: "📊" },
    { key: "collettive", label: "Collettive", icon: "🤝" },
    { key: "piani-extra", label: "Piani Extra", icon: "📌" },
    { key: "ooh", label: "Campagne OOH", icon: "🏙" },
    { key: "timeline", label: "Timeline", icon: "📅" },
    { key: "creativita", label: "Creatività", icon: "🖼" },
    { key: "lead-contratti", label: "Lead ↔ Contratti", icon: "🔗" },
    { key: "budget", label: "Budget", icon: "💰" },
    { key: "reach", label: "Reach", icon: "📡" },
  ];
  const [pinChecking, setPinChecking] = useState(false);
  const handlePinSubmit = async () => {
    setPinChecking(true);
    const ok = await verifyPin(pinValue);
    setPinChecking(false);
    if (ok) { setUnlocked(true); setPinOpen(false); setPinValue(""); setPinError(false); }
    else { setPinError(true); }
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
      {tabs.map(t => (
        <button key={t.key} className="nav-link" onClick={() => t.key !== current && onNavigate(t.key)}
          style={{ background: current === t.key ? "#1e293b" : "#f1f5f9", color: current === t.key ? "#fff" : "#475569" }}>
          {t.icon} {t.label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", position: "relative" }}>
        {unlocked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ background: "#dcfce7", color: "#16a34a", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
              🔓 Modifica attiva
            </span>
            <button className="btn" onClick={() => setUnlocked(false)} title="Esci dalla modalità modifica" style={{ background: "#fef2f2", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn" onClick={() => { setPinOpen(!pinOpen); setPinValue(""); setPinError(false); }} title="Sblocca modifiche" style={{ background: "#f1f5f9", color: "#94a3b8", padding: "8px 14px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
            🔒 Sola lettura
          </button>
        )}
        {pinOpen && !unlocked && (
          <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 6, background: "#fff", borderRadius: 12, padding: 16, boxShadow: "0 8px 30px rgba(0,0,0,.15)", border: "1px solid #e8ecf1", zIndex: 100, minWidth: 220 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Inserisci PIN per modificare</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="password" inputMode="numeric" maxLength={7} value={pinValue} onChange={e => { setPinValue(e.target.value.replace(/\D/g, "").slice(0, 7)); setPinError(false); }}
                onKeyDown={e => e.key === "Enter" && handlePinSubmit()}
                placeholder="0000000" autoFocus
                style={{ ...inputStyle, flex: 1, padding: "8px 12px", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", letterSpacing: 4, borderColor: pinError ? "#ef4444" : "#e2e8f0" }} />
              <button className="btn" onClick={handlePinSubmit} disabled={pinChecking} style={{ background: "#1e293b", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>{pinChecking ? "…" : "→"}</button>
            </div>
            {pinError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>PIN errato</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export function PageShell({ children, toast }: { children: React.ReactNode; toast: string | null }) {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "linear-gradient(145deg, #f8f9fb 0%, #eef1f5 100%)", minHeight: "100vh", color: "#1e293b", padding: "24px 16px 60px" }}>
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 999, boxShadow: "0 8px 30px rgba(0,0,0,.15)", animation: "fadeIn .2s ease" }}>{toast}</div>}
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>{children}</div>
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
            ["Poster 3x2", entry.poster_3x2.toString()],
            ["Poster altri", entry.poster_altri.toString()],
            ["Poster maxi", entry.poster_maxi.toString()],
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

function mapEntryFn(row: any): Entry {
  return {
    id: row.id, meseCompetenza: row.mese_competenza,
    dataInizio: row.data_inizio, dataFine: row.data_fine,
    descrizione: row.descrizione, tipologia: row.tipologia,
    brand: row.brand, soggetto: row.soggetto || "",
    spesa: parseFloat(row.spesa) || 0,
    rimborso_pct: parseFloat(row.rimborso_pct) || 0,
    costo_dichiarato: parseFloat(row.costo_dichiarato) || 0,
    numero_partecipanti: parseInt(row.numero_partecipanti) || 2,
    creativita_url: row.creativita_url || null,
    creativita_nome: row.creativita_nome || null,
    piano_extra: !!row.piano_extra, collettiva: !!row.collettiva,
    nome_collettiva: row.nome_collettiva || "",
    da_confermare: row.da_confermare === undefined ? true : !!row.da_confermare,
    date_singole: row.date_singole || null,
    mappa_url: row.mappa_url || null,
    poster_3x2: parseInt(row.poster_3x2) || 0,
    poster_altri: parseInt(row.poster_altri) || 0,
    poster_maxi: parseInt(row.poster_maxi) || 0,
    fattura_url: row.fattura_url || null,
    fattura_nome: row.fattura_nome || null,
    piattaforma: row.piattaforma || "",
  };
}

// ============================
// META ADS CSV IMPORT
// ============================
const META_KNOWN_BRANDS = [
  "Alfa Romeo","Abarth","BYD","Citroen","Dacia","Fiat",
  "Ford","Jeep","Kia","Lancia","Opel","Peugeot","Renault",
  "Skoda","Smart","Toyota","Volkswagen","Volvo","Honda","Nissan",
];
const META_CLEANUP = /[_\s]*(nov|gen|v\d+|\d{4,}[\w_]*)$/gi;
const META_MYUSATO = /\b(usato|myusato|outlet)\b/i;

function metaExtractBrand(str: string): string | null {
  if (!str?.trim()) return null;
  const n = str.trim();
  const uIdx = n.indexOf("_");
  if (uIdx > 0) { const p = n.slice(0, uIdx).trim(); const b = META_KNOWN_BRANDS.find(b => b.toLowerCase() === p.toLowerCase()); if (b) return b; }
  const sorted = [...META_KNOWN_BRANDS].sort((a, b) => b.length - a.length);
  for (const b of sorted) { if (n.toLowerCase().startsWith(b.toLowerCase())) return b; }
  // Normalizza varianti con caratteri speciali
  if (/citro[eë]n/i.test(n)) return "Citroen";
  if (/[sš]koda/i.test(n)) return "Skoda";
  return null;
}

function metaExtractModel(str: string, brand: string): string {
  if (!str || !brand) return brand || "Leonori";
  const n = str.trim();
  const uIdx = n.indexOf("_");
  if (uIdx > 0 && n.slice(0, uIdx).toLowerCase() === brand.toLowerCase()) {
    let m = n.slice(uIdx + 1).replace(META_CLEANUP, "").replace(/_/g, " ").trim();
    return m || brand;
  }
  let rest = n.slice(brand.length).replace(/^[-_\s]+/, "").trim();
  rest = rest.replace(/[-–]\s*(traffico|conversioni|lead|awareness|retargeting).*/gi, "").replace(/_/g, " ").trim();
  return rest || brand;
}

function metaParseBrandModel(campaign: string, adset: string) {
  if (campaign && META_MYUSATO.test(campaign)) {
    const brand = metaExtractBrand(adset) || "MyUsato";
    return { brand: "MyUsato", model: metaExtractModel(adset, brand) };
  }
  const bc = metaExtractBrand(campaign);
  if (bc) return { brand: bc, model: metaExtractModel(adset, bc) || metaExtractModel(campaign, bc) };
  const ba = metaExtractBrand(adset);
  if (ba) return { brand: ba, model: metaExtractModel(adset, ba) };
  return { brand: "Leonori", model: "Leonori" };
}

// Minimal CSV parser (handles quoted fields)
function parseCSVText(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = ""; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; current += ch; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = "";
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else { current += ch; }
  }
  if (current.trim()) lines.push(current);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const cols: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { cols.push(cur); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur);
    return cols.map(c => c.trim());
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

interface CsvImportRow {
  brand: string;
  soggetto: string;
  descrizione: string;
  spesa: number;
  dataInizio: string;
  dataFine: string;
  selected: boolean;
  piattaforma: string;
  mergeWithId?: string;
}

function processMetaCSV(csvText: string): CsvImportRow[] {
  const data = parseCSVText(csvText);
  const items = data
    .filter(r => r["Ad set name"]?.trim())
    .map(r => {
      const spent = parseFloat(r["Amount spent (EUR)"] || "0");
      const campaign = r["Campaign name"] || r["campaign name"] || "";
      const { brand, model } = metaParseBrandModel(campaign, r["Ad set name"]);
      return { adset: r["Ad set name"].trim(), brand, model, spent,
               start: r["Reporting starts"] || "", end: r["Reporting ends"] || "" };
    })
    .filter(r => r.spent > 0);

  const map: Record<string, { brand: string; models: Set<string>; adsets: string[]; total: number; start: string; end: string }> = {};
  items.forEach(r => {
    if (!map[r.brand]) map[r.brand] = { brand: r.brand, models: new Set(), adsets: [], total: 0, start: r.start, end: r.end };
    map[r.brand].models.add(r.model);
    map[r.brand].adsets.push(r.adset);
    map[r.brand].total += r.spent;
  });

  return Object.values(map)
    .sort((a, b) => b.total - a.total)
    .map(g => ({
      brand: g.brand,
      soggetto: [...g.models].join(", "),
      descrizione: g.adsets.join(", "),
      spesa: Math.round(g.total * 100) / 100,
      dataInizio: g.start,
      dataFine: g.end,
      selected: true,
      piattaforma: "Meta",
    }));
}

function CsvImportModal({ rows, onConfirm, onClose, saving, title, existingEntries }: {
  rows: CsvImportRow[];
  onConfirm: (rows: CsvImportRow[]) => void;
  onClose: () => void;
  saving: boolean;
  title?: string;
  existingEntries?: Entry[];
}) {
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
    return existingEntries.filter(e =>
      e.tipologia === "Digital Adv" &&
      e.piattaforma === row.piattaforma &&
      e.brand === row.brand &&
      e.meseCompetenza === mese
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 960, width: "100%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        {/* Header */}
        <div style={{ padding: "20px 28px", borderBottom: "1px solid #e8ecf1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{modalTitle}</h2>
            <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>{periodo} · {rows.length} brand rilevati · Totale {formatEur(rows.reduce((s, r) => s + r.spesa, 0))}</p>
          </div>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
        </div>

        {/* Legenda merge */}
        <div style={{ padding: "8px 28px", background: "#fffbeb", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e" }}>
          💡 <strong>Collega a voce esistente</strong>: se esiste già un preventivo Digital Adv per questo brand/mese/piattaforma, puoi aggiornarlo (spesa e date aggiornate, creatività mantenute).
        </div>
        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 28px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={selCount === importRows.length} onChange={toggleAll} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                </th>
                {["Brand", "Soggetto", "Spesa", "Collega a voce esistente"].map((h, i) => (
                  <th key={i} style={{ padding: "10px 8px", textAlign: i === 2 ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {importRows.map((r, i) => {
                const candidates = getCandidates(r);
                return (
                  <tr key={i} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9", background: r.selected ? "#eff6ff" : "transparent", opacity: r.selected ? 1 : .5 }}>
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      <input type="checkbox" checked={r.selected} onChange={() => toggleRow(i)} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "#2563eb", whiteSpace: "nowrap" }}>{r.brand}</td>
                    <td style={{ padding: "8px", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.soggetto}>{r.soggetto || "—"}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{formatEur(r.spesa)}</td>
                    <td style={{ padding: "8px", minWidth: 220 }}>
                      {candidates.length > 0 ? (
                        <select value={r.mergeWithId || ""} onChange={e => setMerge(i, e.target.value)}
                          style={{ ...inputStyle, fontSize: 12, padding: "5px 8px", borderColor: r.mergeWithId ? "#f59e0b" : "#e2e8f0", background: r.mergeWithId ? "#fffbeb" : "#fff" }}>
                          <option value="">➕ Crea nuova voce</option>
                          {candidates.map(c => (
                            <option key={c.id} value={c.id}>
                              🔄 {c.descrizione || c.soggetto || c.brand}{parseCreativitaFiles(c.creativita_url, c.creativita_nome).length > 0 ? " 🖼" : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>➕ Nuova voce</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 28px", borderTop: "1px solid #e8ecf1", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
          <span style={{ fontSize: 13, color: "#475569" }}>
            <strong>{selCount}</strong> selezionati · <strong style={{ fontFamily: "'JetBrains Mono', monospace", color: "#059669" }}>{formatEur(selTotal)}</strong>
            {importRows.filter(r => r.selected && r.mergeWithId).length > 0 && (
              <span style={{ marginLeft: 10, background: "#fffbeb", color: "#92400e", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                🔄 {importRows.filter(r => r.selected && r.mergeWithId).length} aggiorn. · {importRows.filter(r => r.selected && !r.mergeWithId).length} nuove
              </span>
            )}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "8px 20px", borderRadius: 8, fontSize: 13 }}>Annulla</button>
            <button className="btn" onClick={() => onConfirm(importRows.filter(r => r.selected))} disabled={saving || selCount === 0}
              style={{ background: saving ? "#94a3b8" : "linear-gradient(135deg, #059669, #10b981)", color: "#fff", padding: "8px 24px", borderRadius: 8, fontSize: 13, boxShadow: saving ? "none" : "0 2px 8px rgba(5,150,105,.3)" }}>
              {saving ? "Importazione..." : `✓ Importa ${selCount} voci`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================
// GOOGLE ADS CSV IMPORT
// ============================
const GOOGLE_MYUSATO = /\b(usato|myusato|outlet)\b/i;

// Pulizia completa nome campagna per isolare il modello
const GOOGLE_CLEANUP_CAMPAIGN = /\b(dsa|search|nuova|nuovo|nuovi|nuove|hybrid|gpl|discovery|suv|lead|dinamica|dinamici|dinamico|pmax|performance\s*max|rem|retargeting|display|awareness|video|competitors|test|promo|agosto|settembre|ottobre|novembre|dicembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|landing|rt|ab|rent|privati|società|evento|rottamazione|voucher|ecobonus|wible|drive|generica|multibrand)\b/gi;

const IT_MONTHS_MAP: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
};

function googleParseItNum(str: string): number {
  if (!str || str.trim() === "--" || str.trim() === "") return 0;
  const cleaned = str.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function googleBrandFromAccount(account: string): string {
  if (!account) return "Leonori";
  const dash = account.indexOf("-");
  if (dash === -1) return account.trim();
  const raw = account.slice(dash + 1).trim();
  if (GOOGLE_MYUSATO.test(raw)) return "MyUsato";
  return raw;
}

function googleModelFromCampaign(name: string): string {
  if (!name || name.trim() === "--") return "";
  let cleaned = name.trim()
    .replace(GOOGLE_CLEANUP_CAMPAIGN, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Rimuove suffissi v2, v3 ecc.
  cleaned = cleaned.replace(/\s+v\d+$/i, "").trim();
  return cleaned || name.trim();
}

function googleParseDateRange(rangeStr: string) {
  const match = rangeStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (!match) return { startISO: "", endISO: "" };
  const monthIdx = IT_MONTHS_MAP[match[2].toLowerCase()] ?? 0;
  const year = parseInt(match[3]);
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const mm = String(monthIdx + 1).padStart(2, "0");
  return { startISO: `${year}-${mm}-01`, endISO: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

// Gestisce due formati CSV:
//   Formato A (Report campagne): colonna "Account"
//   Formato B (Report importazione): colonna "Nome account"
function processGoogleCSV(text: string): CsvImportRow[] {
  const lines = text.split("\n");
  const dateInfo = googleParseDateRange(lines[1] || "");

  // Dal riga 2 in poi: header + dati
  const bodyLines = lines.slice(2);
  const csvData = parseCSVText(bodyLines.join("\n"));

  if (!csvData.length) return [];

  // Rileva formato: "Nome account" (Formato B) o "Account" (Formato A)
  const firstRow = csvData[0];
  const accountCol = "Nome account" in firstRow ? "Nome account"
                   : "Account" in firstRow       ? "Account"
                   : null;

  const items = csvData
    .filter(r => {
      const campaign = (r["Campagna"] || "").trim();
      if (!campaign || campaign === "--") return false;
      if (campaign.toLowerCase().startsWith("totale")) return false;
      // Salta righe senza account valido
      const acc = accountCol ? (r[accountCol] || "").trim() : "";
      if (!acc || acc === "--") return false;
      return true;
    })
    .map(r => {
      const account = accountCol ? (r[accountCol] || "").trim() : "";
      const campaign = (r["Campagna"] || "").trim();
      const azione = (r["Azione di conversione"] || "").trim();
      const spent = googleParseItNum((r["Costo"] || "0").trim());

      // Determina brand — check MyUsato su azione E account
      let brand: string;
      if (GOOGLE_MYUSATO.test(azione) || GOOGLE_MYUSATO.test(account)) {
        brand = "MyUsato";
      } else {
        brand = googleBrandFromAccount(account);
      }

      const model = googleModelFromCampaign(campaign);
      return { account, campaign, brand, model, spent };
    })
    .filter(r => r.spent > 0);

  // Raggruppa per account
  const map: Record<string, { account: string; brand: string; models: Set<string>; campaigns: string[]; total: number }> = {};
  items.forEach(r => {
    const key = r.account || r.brand;
    if (!map[key]) map[key] = { account: r.account, brand: r.brand, models: new Set(), campaigns: [], total: 0 };
    if (r.model) map[key].models.add(r.model);
    map[key].campaigns.push(r.campaign);
    map[key].total += r.spent;
  });

  return Object.values(map)
    .sort((a, b) => b.total - a.total)
    .map(g => ({
      brand: g.brand,
      soggetto: [...g.models].join(", "),
      descrizione: g.account + " — " + Array.from(new Set(g.campaigns)).join(", "),
      spesa: Math.round(g.total * 100) / 100,
      dataInizio: dateInfo.startISO,
      dataFine: dateInfo.endISO,
      selected: true,
      piattaforma: "Google",
    }));
}

// ============================
// ROUTER
// ============================
export default function App() {
  const validPages: PageType[] = ["marketing", "collettive", "piani-extra", "ooh", "timeline", "creativita", "lead-contratti", "budget", "reach"];
  const getPageFromHash = (): PageType => {
    const h = window.location.hash.replace("#", "") as PageType;
    return validPages.includes(h) ? h : "marketing";
  };
  const [page, setPage] = useState<PageType>(getPageFromHash());
  const [unlocked, setUnlocked] = useState(() => document.cookie.split("; ").some(c => c === "mc_auth=1"));

  const handleUnlock = (v: boolean) => {
    setUnlocked(v);
    if (v) {
      document.cookie = "mc_auth=1; path=/; max-age=31536000; SameSite=Lax"; // 1 anno
    } else {
      document.cookie = "mc_auth=; path=/; max-age=0";
    }
  };

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (p: PageType) => {
    window.location.hash = p;
    setPage(p);
  };
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform: translateX(-50%) translateY(-10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        input, select { font-family: 'DM Sans', sans-serif; }
        input:focus, select:focus { outline: none; border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,.15) !important; }
        .row-hover:hover { background: #f1f5f9 !important; }
        .btn { cursor:pointer; border:none; font-family:'DM Sans',sans-serif; font-weight:600; transition: all .15s ease; }
        .btn:active { transform: scale(.97); }
        .btn:disabled { opacity:.5; cursor:not-allowed; }
        ::-webkit-scrollbar { height: 6px; } ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .nav-link { cursor:pointer; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; border: none; font-family: 'DM Sans', sans-serif; transition: all .15s ease; }
        .nav-link:hover { opacity: .85; }
        .eye-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: .5; transition: opacity .15s; }
        .eye-btn:hover { opacity: 1; }
      `}</style>
      {page === "marketing" && <MarketingCostsPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "collettive" && <CollettivePage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "piani-extra" && <PianiExtraPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "ooh" && <OOHDetailPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "timeline" && <TimelinePage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "creativita" && <CreativitaPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "lead-contratti" && <LeadContrattiPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "budget" && <BudgetPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
      {page === "reach" && <ReachPage onNavigate={navigate} unlocked={unlocked} setUnlocked={handleUnlock} />}
    </>
  );
}

// ============================
// DUPLICATE MODAL
// ============================
function DuplicateModal({ entry, onClose, onSaved }: { entry: Entry; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    dataInizio: entry.dataInizio,
    dataFine: entry.dataFine,
    descrizione: entry.descrizione,
    tipologia: entry.tipologia,
    brand: entry.brand,
    soggetto: entry.soggetto,
    spesa: String(entry.spesa),
    rimborsoPct: String(entry.rimborso_pct),
    costoDichiarato: String(entry.costo_dichiarato),
    collettiva: entry.collettiva,
    nomeCollettiva: entry.nome_collettiva,
    numeroPartecipanti: String(entry.numero_partecipanti),
    pianoExtra: entry.piano_extra,
    daConfermare: entry.da_confermare,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const spesa = parseFloat(form.spesa) || 0;
      const rimbPct = parseFloat(form.rimborsoPct) || 0;
      const costoDich = parseFloat(form.costoDichiarato) || spesa;
      const mk = getMonthKey(form.dataInizio);
      await supabase.insert(TABLE, {
        mese_competenza: mk,
        data_inizio: form.dataInizio,
        data_fine: form.dataFine,
        descrizione: form.descrizione,
        tipologia: form.tipologia,
        brand: form.brand,
        soggetto: form.soggetto,
        spesa,
        rimborso_pct: rimbPct,
        costo_dichiarato: costoDich,
        numero_partecipanti: parseInt(form.numeroPartecipanti) || 2,
        piano_extra: form.pianoExtra,
        collettiva: form.collettiva,
        nome_collettiva: form.nomeCollettiva,
        da_confermare: form.daConfermare,
        date_singole: entry.date_singole,
        mappa_url: entry.mappa_url,
        poster_3x2: entry.poster_3x2,
        poster_altri: entry.poster_altri,
        poster_maxi: entry.poster_maxi,
        creativita_url: entry.creativita_url,
        creativita_nome: entry.creativita_nome,
        fattura_url: entry.fattura_url,
        fattura_nome: entry.fattura_nome,
      });
      await onSaved();
    } catch (err: unknown) { alert("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>📋 Duplica azione</h2>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>Verifica e correggi i dati prima di salvare la copia.</p>

        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#475569" }}>
          <strong>Originale:</strong> {entry.descrizione} · {entry.brand} · {getMonthLabel(entry.meseCompetenza)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Data inizio</label>
            <input type="date" value={form.dataInizio} onChange={e => setForm({ ...form, dataInizio: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Data fine</label>
            <input type="date" value={form.dataFine} min={form.dataInizio} onChange={e => setForm({ ...form, dataFine: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Descrizione</label>
          <input type="text" value={form.descrizione} onChange={e => setForm({ ...form, descrizione: e.target.value })} style={inputStyle} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Tipologia</label>
            <select value={form.tipologia} onChange={e => setForm({ ...form, tipologia: e.target.value })} style={inputStyle}>
              {TIPOLOGIE.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Brand</label>
            <select value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} style={inputStyle}>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Spesa (€)</label>
            <input type="number" min="0" step="1" value={form.spesa} onChange={e => setForm({ ...form, spesa: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Rimborso %</label>
            <input type="number" min="0" max="100" step="1" value={form.rimborsoPct} onChange={e => setForm({ ...form, rimborsoPct: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Soggetto</label>
            <input type="text" value={form.soggetto} onChange={e => setForm({ ...form, soggetto: e.target.value })} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.pianoExtra} onChange={e => setForm({ ...form, pianoExtra: e.target.checked })} style={{ accentColor: "#8b5cf6", width: 15, height: 15 }} /> 📌 Piano Extra
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.collettiva} onChange={e => setForm({ ...form, collettiva: e.target.checked })} style={{ accentColor: "#059669", width: 15, height: 15 }} /> 🤝 Collettiva
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
            <input type="checkbox" checked={form.daConfermare} onChange={e => setForm({ ...form, daConfermare: e.target.checked })} style={{ accentColor: "#10b981", width: 15, height: 15 }} /> ✓ Confermata
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 16px", borderRadius: 8, fontSize: 13 }}>Annulla</button>
          <button className="btn" onClick={handleSave} disabled={saving} style={{ background: "#059669", color: "#fff", padding: "9px 24px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            {saving ? "Salvataggio..." : "📋 Salva copia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================
// PAGINA 1 - Costi Marketing
// ============================
function MarketingCostsPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
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
  type SortField = "mese" | "descrizione" | "tipologia" | "brand" | "none";
  const [sortField, setSortField] = useState<SortField>("none");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); setError(null); }
    catch (e) { console.error(e); setError("Errore di connessione a Supabase."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;
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
    // Stampa: derive dataInizio/dataFine from selected dates
    let effDataInizio = form.dataInizio;
    let effDataFine = form.dataFine;
    let dateSingoleStr: string | null = null;

    if (isStampa) {
      if (form.dateSingole.length === 0) { showToast("⚠️ Seleziona almeno una data di uscita"); return; }
      const sorted = [...form.dateSingole].sort();
      effDataInizio = sorted[0];
      effDataFine = sorted[sorted.length - 1];
      dateSingoleStr = sorted.join(",");
    } else {
      if (!form.dataInizio || !form.dataFine) { showToast("⚠️ Compila le date"); return; }
      if (form.dataFine < form.dataInizio) { showToast("⚠️ Data fine prima di data inizio"); return; }
    }
    if (!form.descrizione.trim()) { showToast("⚠️ Compila la descrizione"); return; }
    if (form.collettiva && !form.nomeCollettiva.trim()) { showToast("⚠️ Inserisci il nome della collettiva"); return; }
    setSaving(true);
    try {
      let creativita_url: string | null = null, creativita_nome: string | null = null;
      let fattura_url_val: string | null = null, fattura_nome_val: string | null = null;
      // Collect existing files if editing
      const allUrls: string[] = [];
      const allNames: string[] = [];
      if (editingId) {
        const existing = entries.find(e => e.id === editingId);
        if (existing) {
          const parsed = parseCreativitaFiles(existing.creativita_url, existing.creativita_nome);
          parsed.forEach(f => { allUrls.push(f.url); allNames.push(f.nome); });
        }
      }
      // Upload new files
      for (const file of selectedFiles) {
        const ext = file.name.split(".").pop();
        const fn = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await supabase.uploadFile(STORAGE_BUCKET, fn, file);
        allUrls.push(supabase.getPublicUrl(STORAGE_BUCKET, fn));
        allNames.push(file.name);
      }
      if (allUrls.length > 0) {
        creativita_url = JSON.stringify(allUrls);
        creativita_nome = JSON.stringify(allNames);
      }
      if (fatturaFile) {
        const fn = `fattura_${Date.now()}_${Math.random().toString(36).slice(2,6)}.pdf`;
        await supabase.uploadFile(STORAGE_BUCKET, fn, fatturaFile);
        fattura_url_val = supabase.getPublicUrl(STORAGE_BUCKET, fn);
        fattura_nome_val = fatturaFile.name;
      }
      const spesaVal = parseFloat(form.spesa) || 0;
      const rimbPct = parseFloat(form.rimborsoPct) || 0;
      const costoDich = rimbPct > 0 && form.costoDichiarato !== "" ? (parseFloat(form.costoDichiarato) || spesaVal) : spesaVal;
      const isOOH = form.tipologia === "OOH";
      const row: any = {
        mese_competenza: getMonthKey(effDataInizio),
        data_inizio: effDataInizio, data_fine: effDataFine,
        descrizione: form.descrizione.trim(), tipologia: form.tipologia,
        brand: form.brand, soggetto: form.soggetto.trim(),
        spesa: spesaVal, rimborso_pct: rimbPct,
        costo_dichiarato: costoDich,
        numero_partecipanti: form.collettiva ? (parseInt(form.numeroPartecipanti) || 2) : 2,
        piano_extra: form.pianoExtra, collettiva: form.collettiva,
        nome_collettiva: form.collettiva ? form.nomeCollettiva.trim() : "",
        date_singole: dateSingoleStr,
        mappa_url: isOOH ? (form.mappaUrl.trim() || null) : null,
        poster_3x2: isOOH ? (parseInt(form.poster3x2) || 0) : 0,
        poster_altri: isOOH ? (parseInt(form.posterAltri) || 0) : 0,
        poster_maxi: isOOH ? (parseInt(form.posterMaxi) || 0) : 0,
        piattaforma: form.tipologia === "Digital Adv" ? (form.piattaforma || "") : "",
      };
      if (creativita_url) { row.creativita_url = creativita_url; row.creativita_nome = creativita_nome; }
      if (fattura_url_val) { row.fattura_url = fattura_url_val; row.fattura_nome = fattura_nome_val; }
      if (editingId) { await supabase.update(TABLE, editingId, row); showToast("✓ Aggiornata"); }
      else {
        if (!creativita_url) { row.creativita_url = null; row.creativita_nome = null; }
        if (!fattura_url_val) { row.fattura_url = null; row.fattura_nome = null; }
        row.da_confermare = true; await supabase.insert(TABLE, row); showToast("✓ Inserita");
      }
      const mk = row.mese_competenza;
      if (!selectedMonths.includes(mk)) setSelectedMonths(prev => [...prev, mk]);
      setForm({ ...emptyForm }); setEditingId(null); setSelectedFiles([]); setFatturaFile(null); setFileError(null);
      await loadEntries();
    } catch (e) { console.error(e); showToast("❌ Errore nel salvataggio"); }
    finally { setSaving(false); }
  };

  const handleEdit = (entry: Entry) => {
    setForm({
      dataInizio: entry.dataInizio, dataFine: entry.dataFine,
      descrizione: entry.descrizione, tipologia: entry.tipologia,
      brand: entry.brand, soggetto: entry.soggetto,
      spesa: entry.spesa.toString(), rimborsoPct: entry.rimborso_pct.toString(),
      costoDichiarato: entry.costo_dichiarato.toString(),
      numeroPartecipanti: entry.numero_partecipanti.toString(),
      pianoExtra: entry.piano_extra, collettiva: entry.collettiva,
      nomeCollettiva: entry.nome_collettiva,
      dateSingole: entry.date_singole ? entry.date_singole.split(",") : [],
      mappaUrl: entry.mappa_url || "",
      poster3x2: entry.poster_3x2 ? entry.poster_3x2.toString() : "",
      posterAltri: entry.poster_altri ? entry.poster_altri.toString() : "",
      posterMaxi: entry.poster_maxi ? entry.poster_maxi.toString() : "",
      piattaforma: entry.piattaforma || "",
    });
    setEditingId(entry.id); setSelectedFiles([]); setFatturaFile(null); setFileError(null); setFormVisible(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    try { await supabase.delete(TABLE, id); showToast("✓ Eliminata"); if (editingId === id) { setEditingId(null); setForm({ ...emptyForm }); } await loadEntries(); }
    catch (e) { showToast("❌ Errore"); }
  };
  const toggleDaConfermare = async (entry: Entry) => {
    try { await supabase.update(TABLE, entry.id, { da_confermare: !entry.da_confermare }); setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, da_confermare: !e.da_confermare } : e)); }
    catch (e) { showToast("❌ Errore"); }
  };
  const cancelEdit = () => { setEditingId(null); setForm({ ...emptyForm }); setSelectedFiles([]); setFatturaFile(null); setFileError(null); };

  // --- Meta Ads CSV Import ---
  const handleMetaCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = processMetaCSV(ev.target?.result as string);
        if (parsed.length === 0) { showToast("⚠️ Nessun dato trovato nel CSV"); return; }
        setMetaImportRows(parsed);
      } catch (err) { console.error(err); showToast("❌ Errore nel parsing del CSV"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleMetaConfirm = async (rows: CsvImportRow[]) => {
    setMetaImporting(true);
    let updated = 0, inserted = 0;
    try {
      for (const r of rows) {
        const mk = getMonthKey(r.dataInizio);
        if (r.mergeWithId) {
          // Aggiorna voce esistente mantenendo le creatività
          await supabase.update(TABLE, r.mergeWithId, {
            mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine,
            soggetto: r.soggetto, spesa: r.spesa, costo_dichiarato: r.spesa,
            piattaforma: "Meta",
          });
          updated++;
        } else {
          await supabase.insert(TABLE, {
            mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine,
            descrizione: r.descrizione, tipologia: "Digital Adv",
            brand: r.brand, soggetto: r.soggetto, spesa: r.spesa,
            rimborso_pct: 0, costo_dichiarato: r.spesa, numero_partecipanti: 2,
            piano_extra: false, collettiva: false, nome_collettiva: "",
            da_confermare: true, creativita_url: null, creativita_nome: null,
            piattaforma: "Meta",
          });
          inserted++;
        }
      }
      setMetaImportRows(null);
      showToast(`✓ Meta Ads: ${inserted} nuove, ${updated} aggiornate`);
      await loadEntries();
    } catch (err) { console.error(err); showToast("❌ Errore durante l'importazione"); }
    finally { setMetaImporting(false); }
  };

  // --- Google Ads CSV Import ---
  const handleGoogleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = processGoogleCSV(ev.target?.result as string);
        if (parsed.length === 0) { showToast("⚠️ Nessun dato trovato nel CSV"); return; }
        setGoogleImportRows(parsed);
      } catch (err) { console.error(err); showToast("❌ Errore nel parsing del CSV Google"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleGoogleConfirm = async (rows: CsvImportRow[]) => {
    setGoogleImporting(true);
    let updated = 0, inserted = 0;
    try {
      for (const r of rows) {
        const mk = getMonthKey(r.dataInizio);
        if (r.mergeWithId) {
          await supabase.update(TABLE, r.mergeWithId, {
            mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine,
            soggetto: r.soggetto, spesa: r.spesa, costo_dichiarato: r.spesa,
            piattaforma: "Google",
          });
          updated++;
        } else {
          await supabase.insert(TABLE, {
            mese_competenza: mk, data_inizio: r.dataInizio, data_fine: r.dataFine,
            descrizione: r.descrizione, tipologia: "Digital Adv",
            brand: r.brand, soggetto: r.soggetto, spesa: r.spesa,
            rimborso_pct: 0, costo_dichiarato: r.spesa, numero_partecipanti: 2,
            piano_extra: false, collettiva: false, nome_collettiva: "",
            da_confermare: true, creativita_url: null, creativita_nome: null,
            piattaforma: "Google",
          });
          inserted++;
        }
      }
      setGoogleImportRows(null);
      showToast(`✓ Google Ads: ${inserted} nuove, ${updated} aggiornate`);
      await loadEntries();
    } catch (err) { console.error(err); showToast("❌ Errore durante l'importazione"); }
    finally { setGoogleImporting(false); }
  };

  const availableMonths = Array.from(new Set(entries.map(e => e.meseCompetenza))).sort().reverse();
  const currentMonth = getCurrentMonthKey();
  if (!availableMonths.includes(currentMonth)) availableMonths.unshift(currentMonth);
  const toggleMonth = (m: string) => { setSelectedRows(new Set()); setSelectedMonths(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]); };
  const selectAllMonths = () => { setSelectedRows(new Set()); setSelectedMonths([...availableMonths]); };
  const clearMonths = () => { setSelectedRows(new Set()); setSelectedMonths([]); };

  const filtered = entries.filter(e => {
    if (selectedMonths.length > 0 && !selectedMonths.includes(e.meseCompetenza)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    if (filterTipologia !== "all" && e.tipologia !== filterTipologia) return false;
    return true;
  }).sort((a, b) => {
    let cmp = 0;
    if (sortField === "none") cmp = a.dataInizio.localeCompare(b.dataInizio);
    else if (sortField === "mese") cmp = a.meseCompetenza.localeCompare(b.meseCompetenza) || a.dataInizio.localeCompare(b.dataInizio);
    else if (sortField === "descrizione") cmp = a.descrizione.localeCompare(b.descrizione, "it");
    else if (sortField === "tipologia") cmp = a.tipologia.localeCompare(b.tipologia, "it");
    else if (sortField === "brand") cmp = a.brand.localeCompare(b.brand, "it");
    return sortDir === "asc" ? cmp : -cmp;
  });
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  const availableTipologie = Array.from(new Set(entries.map(e => e.tipologia))).sort();
  const toggleRow = (id: string) => { setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const toggleAllRows = () => { if (selectedRows.size === filtered.length) setSelectedRows(new Set()); else setSelectedRows(new Set(filtered.map(e => e.id))); };
  const clearSelection = () => setSelectedRows(new Set());

  const totalsBase = selectedRows.size > 0 ? filtered.filter(e => selectedRows.has(e.id)) : filtered;
  const totSpesa = totalsBase.reduce((s, e) => s + e.spesa, 0);
  const totSpesaNetta = totalsBase.reduce((s, e) => s + calcSpesaNetta(e), 0);
  const totOffline = totalsBase.filter(e => OFFLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);
  const totOnline = totalsBase.filter(e => ONLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);

  const showRimborsoFields = parseFloat(form.rimborsoPct) > 0;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}>
      <div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Connessione a Supabase...</div></div>
    </div>
  );

  return (
    <PageShell toast={toast}>
      <NavBar current="marketing" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📊 Costi Marketing</h1>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Gestione iniziative e monitoraggio spese</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {unlocked && <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(99,102,241,.3)", transition: "all .15s ease" }}>
              📊 Meta Ads CSV
              <input type="file" accept=".csv" onChange={handleMetaCSV} style={{ display: "none" }} />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #ea4335, #c5221f)", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", boxShadow: "0 2px 8px rgba(234,67,53,.3)", transition: "all .15s ease" }}>
              📈 Google Ads CSV
              <input type="file" accept=".csv" onChange={handleGoogleCSV} style={{ display: "none" }} />
            </label>
          </>}
          <div style={{ background: "#ecfdf5", color: "#059669", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block" }}></span>Connesso
          </div>
        </div>
      </div>

      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 20px", marginBottom: 20, color: "#dc2626", fontSize: 13 }}><strong>⚠️ {error}</strong></div>}

      {!unlocked && (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "10px 20px", marginBottom: 20, color: "#0369a1", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          🔒 <strong>Modalità sola lettura</strong> — clicca il lucchetto in alto a destra per sbloccare le modifiche
        </div>
      )}

      {/* Form — only visible when unlocked */}
      {unlocked && <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)", marginBottom: 24, border: "1px solid #e8ecf1", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 28px", cursor: "pointer", background: formVisible ? "transparent" : "#f8fafc" }} onClick={() => !editingId && setFormVisible(!formVisible)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{editingId ? "✏️ Modifica iniziativa" : "➕ Nuova iniziativa"}</span>
            {editingId && <button className="btn" onClick={e => { e.stopPropagation(); cancelEdit(); }} style={{ background: "#fef2f2", color: "#dc2626", fontSize: 12, padding: "4px 12px", borderRadius: 6 }}>Annulla modifica</button>}
          </div>
          <button className="btn" onClick={e => { e.stopPropagation(); setFormVisible(!formVisible); }} style={{ background: "#f1f5f9", color: "#475569", padding: "4px 12px", borderRadius: 6, fontSize: 12 }}>
            {formVisible ? "▲ Nascondi" : "▼ Mostra"}
          </button>
        </div>

        {formVisible && (
          <div style={{ padding: "0 28px 24px" }}>
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
                <option value="Altro">Altro</option>
              </select>
            </Field>
          )}
          <Field label="Soggetto"><input type="text" placeholder="Soggetto..." value={form.soggetto} onChange={e => setForm({ ...form, soggetto: e.target.value })} style={inputStyle} /></Field>
          <Field label="Spesa (€)"><input type="number" min="0" step="1" placeholder="0" value={form.spesa} onChange={e => setForm({ ...form, spesa: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></Field>
          <Field label="Rimborso (%)"><input type="number" min="0" max="100" step="1" placeholder="0" value={form.rimborsoPct} onChange={e => setForm({ ...form, rimborsoPct: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} /></Field>
        </div>

        {/* Stampa multi-date picker */}
        {form.tipologia === "Stampa" && (
          <div style={{ marginTop: 14 }}>
            <Field label="📰 Date uscite stampa (clicca i giorni)">
              <StampaCalendar selected={form.dateSingole} onChange={dates => setForm({ ...form, dateSingole: dates })} baseMonth={getCurrentMonthKey()} />
            </Field>
          </div>
        )}

        {/* Spesa dichiarata — visible if rimborso > 0 */}
        {showRimborsoFields && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
            <Field label="Spesa dichiarata (€)">
              <input type="number" min="0" step="1" placeholder={form.spesa || "0"}
                value={form.costoDichiarato}
                onChange={e => setForm({ ...form, costoDichiarato: e.target.value })}
                style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#f59e0b" }} />
              <span style={{ fontSize: 10, color: "#94a3b8" }}>Default = spesa</span>
            </Field>
          </div>
        )}

        {/* Checkboxes */}
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

        {/* Collettiva fields */}
        {form.collettiva && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
            <Field label="Nome Collettiva"><input type="text" placeholder="Nome..." value={form.nomeCollettiva} onChange={e => setForm({ ...form, nomeCollettiva: e.target.value })} style={{ ...inputStyle, borderColor: "#10b981" }} /></Field>
            <Field label="Numero partecipanti"><input type="number" min="1" step="1" value={form.numeroPartecipanti} onChange={e => setForm({ ...form, numeroPartecipanti: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace", borderColor: "#10b981" }} /></Field>
          </div>
        )}

        {/* OOH fields */}
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
                  {fatturaFile && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef3c7", color: "#92400e", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>✓ {fatturaFile.name}<span onClick={() => setFatturaFile(null)} style={{ cursor: "pointer", opacity: .6, fontSize: 14 }}>✕</span></span>}
                  {!fatturaFile && editingId && entries.find(e => e.id === editingId)?.fattura_nome && <span style={{ fontSize: 12, color: "#92400e" }}>Fattura: <strong>{entries.find(e => e.id === editingId)?.fattura_nome}</strong></span>}
                </div>
              </Field>
            </div>
          </div>
        )}

        {/* File */}
        <div style={{ marginTop: 14 }}>
          <Field label="Creatività (max 500 KB ciascuna)">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer" }}>
                📎 Aggiungi file<input type="file" multiple accept="image/*,.pdf,.ai,.psd,.eps,.svg" onChange={handleFileSelect} style={{ display: "none" }} />
              </label>
              {/* Existing files (when editing) */}
              {editingId && (() => {
                const existing = entries.find(e => e.id === editingId);
                const files = existing ? parseCreativitaFiles(existing.creativita_url, existing.creativita_nome) : [];
                return files.map((f, i) => (
                  <a key={"ex" + i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#dbeafe", color: "#2563eb", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500, textDecoration: "none" }}>📄 {f.nome || "File " + (i + 1)}</a>
                ));
              })()}
              {/* New files to upload */}
              {selectedFiles.map((f, i) => (
                <span key={"new" + i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ecfdf5", color: "#059669", padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                  ✓ {f.name} ({formatFileSize(f.size)})<span onClick={() => removeFile(i)} style={{ cursor: "pointer", opacity: .6, fontSize: 14 }}>✕</span>
                </span>
              ))}
              {fileError && <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 500 }}>❌ {fileError}</span>}
            </div>
          </Field>
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={handleSubmit} disabled={saving} style={{ background: saving ? "#94a3b8" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", padding: "10px 28px", borderRadius: 10, fontSize: 14, boxShadow: saving ? "none" : "0 2px 8px rgba(59,130,246,.3)" }}>
            {saving ? "Salvataggio..." : editingId ? "Salva modifiche" : "Inserisci"}
          </button>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>Mese: <strong>{form.dataInizio ? getMonthLabelShort(getMonthKey(form.dataInizio)) : "—"}</strong></span>
        </div>
          </div>
        )}
      </div>}

      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.04)", marginBottom: 20, border: "1px solid #e8ecf1", position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🔍 Filtri:</span>
          {/* Month */}
          <div style={{ position: "relative" }}>
            <button className="btn" onClick={() => setMonthDropdownOpen(!monthDropdownOpen)} style={{ background: "#f1f5f9", color: "#334155", padding: "6px 14px", borderRadius: 8, fontSize: 13, border: "1px solid #e2e8f0" }}>
              🗓 {selectedMonths.length === 0 ? "Tutti i mesi" : selectedMonths.length === availableMonths.length ? "Tutti" : `${selectedMonths.length} mes${selectedMonths.length === 1 ? "e" : "i"}`} <span style={{ marginLeft: 4, fontSize: 10 }}>▼</span>
            </button>
            {monthDropdownOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: "#fff", borderRadius: 10, padding: 8, boxShadow: "0 8px 30px rgba(0,0,0,.12)", border: "1px solid #e2e8f0", zIndex: 50, minWidth: 200 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, padding: "2px 4px" }}>
                  <button className="btn" onClick={selectAllMonths} style={{ fontSize: 11, color: "#3b82f6", background: "none", padding: 0 }}>Tutti</button>
                  <span style={{ color: "#cbd5e1" }}>|</span>
                  <button className="btn" onClick={clearMonths} style={{ fontSize: 11, color: "#3b82f6", background: "none", padding: 0 }}>Nessuno</button>
                </div>
                {availableMonths.map(m => (
                  <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: selectedMonths.includes(m) ? "#eff6ff" : "transparent", fontSize: 13 }}>
                    <input type="checkbox" checked={selectedMonths.includes(m)} onChange={() => toggleMonth(m)} style={{ accentColor: "#3b82f6" }} />{getMonthLabel(m)}
                  </label>
                ))}
                <div style={{ borderTop: "1px solid #e8ecf1", marginTop: 6, paddingTop: 6 }}>
                  <button className="btn" onClick={() => setMonthDropdownOpen(false)} style={{ width: "100%", background: "#3b82f6", color: "#fff", padding: "6px 0", borderRadius: 6, fontSize: 12 }}>Applica</button>
                </div>
              </div>
            )}
          </div>
          {/* Brand */}
          <select value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setSelectedRows(new Set()); }} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, background: filterBrand !== "all" ? "#eff6ff" : undefined }}>
            <option value="all">Tutti i brand</option>
            {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          {/* Tipologia */}
          <select value={filterTipologia} onChange={e => { setFilterTipologia(e.target.value); setSelectedRows(new Set()); }} style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontSize: 13, background: filterTipologia !== "all" ? "#eff6ff" : undefined }}>
            <option value="all">Tutte le tipologie</option>
            {availableTipologie.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Month tags */}
          {selectedMonths.length > 0 && selectedMonths.length < availableMonths.length && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {selectedMonths.map(m => (
                <span key={m} style={{ background: "#eff6ff", color: "#2563eb", padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 3 }}>
                  {getMonthLabelShort(m)}<span onClick={() => toggleMonth(m)} style={{ cursor: "pointer", opacity: .6, fontSize: 9 }}>✕</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <ExportBar
        onCSV={() => {
          const h = ["Mese", "Data Inizio", "Data Fine", "Descrizione", "Tipologia", "Brand", "Soggetto", "Spesa", "Imp. Rimborso", "Spesa Netta", "OK"];
          const r = filtered.map(e => [getMonthLabelShort(e.meseCompetenza), formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione, e.tipologia, e.brand, e.soggetto, Math.round(e.spesa).toString(), Math.round(calcImportoRimborso(e)).toString(), Math.round(calcSpesaNetta(e)).toString(), e.da_confermare ? "Sì" : "No"]);
          exportCSV("costi-marketing.csv", h, r);
        }}
        onPrint={() => window.print()}
      />

      {/* Table - Marketing */}
      <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)", marginBottom: 24, border: "1px solid #e8ecf1" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedRows.size === filtered.length} onChange={toggleAllRows} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                </th>
                {(["", "Mese", "Periodo", "Descrizione", "Tipo", "Brand", "Sogg.", "File", "Spesa", "Imp. Rimb.", "Sp. Netta"] as const).map((h, i) => {
                  const sfMap: Record<string, SortField> = { "Mese": "mese", "Descrizione": "descrizione", "Tipo": "tipologia", "Brand": "brand" };
                  const sf = sfMap[h];
                  const isActive = sf && sortField === sf;
                  return (
                    <th key={i} onClick={sf ? () => toggleSort(sf) : undefined}
                      style={{ padding: "10px 6px", textAlign: (i >= 8 && i <= 10) ? "right" : "left", fontWeight: 600, color: isActive ? "#2563eb" : "#475569", borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px", cursor: sf ? "pointer" : "default", userSelect: "none", background: isActive ? "#eff6ff" : undefined }}>
                      {h}{sf ? (isActive ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅") : ""}
                    </th>
                  );
                })}
                {unlocked && <>
                  <th style={{ padding: "10px 6px", textAlign: "center", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>OK</th>
                  <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1" }}></th>
                </>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={unlocked ? 14 : 12} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nessuna iniziativa</td></tr>
              ) : (
                <>
                  {filtered.map(e => {
                    const importoRimb = calcImportoRimborso(e);
                    const spesaN = calcSpesaNetta(e);
                    return (
                    <tr key={e.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9", background: selectedRows.has(e.id) ? "#eff6ff" : !e.da_confermare ? "#fffbeb" : "transparent" }}>
                      <td style={{ ...cellStyle, textAlign: "center", width: 36 }}>
                        <input type="checkbox" checked={selectedRows.has(e.id)} onChange={() => toggleRow(e.id)} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "4px 4px" }}><button className="eye-btn" onClick={() => setDetailEntry(e)} title="Dettaglio">👁</button></td>
                      <td style={cellStyle}>
                        <span style={{ fontSize: 11 }}>{getMonthLabelShort(e.meseCompetenza)}</span>
                        {(e.piano_extra || e.collettiva) && (
                          <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
                            {e.piano_extra && <span style={{ background: "#f3e8ff", color: "#7c3aed", padding: "0px 4px", borderRadius: 3, fontSize: 8, fontWeight: 700 }}>EX</span>}
                            {e.collettiva && <span style={{ background: "#ecfdf5", color: "#059669", padding: "0px 4px", borderRadius: 3, fontSize: 8, fontWeight: 700 }}>CO</span>}
                          </div>
                        )}
                      </td>
                      <td style={cellStyle}><span style={{ fontSize: 11 }}>{formatDate(e.dataInizio)}<br/>{formatDate(e.dataFine)}</span></td>
                      <td style={{ ...cellStyle, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>
                        {e.descrizione}
                        {e.collettiva && e.nome_collettiva && <div style={{ fontSize: 9, color: "#059669", fontWeight: 600 }}>🤝 {e.nome_collettiva}</div>}
                      </td>
                      <td style={cellStyle}><span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : ONLINE_TYPES.includes(e.tipologia) ? "#dbeafe" : "#f1f5f9", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : ONLINE_TYPES.includes(e.tipologia) ? "#1e40af" : "#475569", padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{e.tipologia}</span>{e.tipologia === "Digital Adv" && e.piattaforma && <span style={{ marginLeft: 3, background: e.piattaforma === "Google" ? "#fce7e6" : "#ede9fe", color: e.piattaforma === "Google" ? "#c5221f" : "#5b21b6", padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>{e.piattaforma}</span>}</td>
                      <td style={{ ...cellStyle, fontSize: 11 }}>{e.brand}</td>
                      <td style={{ ...cellStyle, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{e.soggetto || "—"}</td>
                      <td style={cellStyle}>
                        {(() => { const files = parseCreativitaFiles(e.creativita_url, e.creativita_nome); return files.length > 0 ? (
                          <span style={{ display: "inline-flex", background: "#eff6ff", color: "#2563eb", padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 600, gap: 2 }}>
                            📄 {files.length > 1 ? files.length : ""}
                          </span>
                        ) : <span style={{ color: "#cbd5e1", fontSize: 10 }}>—</span>; })()}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{formatEur(e.spesa)}</td>
                      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{importoRimb > 0 ? formatEur(importoRimb) : "—"}</td>
                      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: "#059669" }}>{formatEur(spesaN)}</td>
                      {unlocked && <>
                        <td style={{ ...cellStyle, textAlign: "center" }}>
                          <input type="checkbox" checked={e.da_confermare} onChange={() => toggleDaConfermare(e)} style={{ accentColor: "#10b981", width: 15, height: 15, cursor: "pointer" }} />
                        </td>
                        <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                          <button className="btn" onClick={() => setDuplicateEntry(e)} title="Duplica" style={{ background: "none", color: "#059669", fontSize: 11, padding: "2px 4px" }}>📋</button>
                          <button className="btn" onClick={() => handleEdit(e)} style={{ background: "none", color: "#3b82f6", fontSize: 11, padding: "2px 4px" }}>✏️</button>
                          <button className="btn" onClick={() => handleDelete(e.id)} style={{ background: "none", color: "#ef4444", fontSize: 11, padding: "2px 4px" }}>🗑</button>
                        </td>
                      </>}
                    </tr>
                  );})}
                  <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                    <td colSpan={9} style={{ ...cellStyle, fontWeight: 700, textAlign: "right", textTransform: "uppercase", fontSize: 10, letterSpacing: ".3px", color: "#475569" }}>
                      {selectedRows.size > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ background: "#dbeafe", color: "#2563eb", padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{selectedRows.size} sel.</span><span onClick={clearSelection} className="btn" style={{ background: "none", color: "#3b82f6", fontSize: 10, padding: 0 }}>✕</span>Tot.</span> : <>Tot. ({filtered.length})</>}
                    </td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>{formatEur(totSpesa)}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>{formatEur(totSpesa - totSpesaNetta)}</td>
                    <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: "#059669" }}>{formatEur(totSpesaNetta)}</td>
                    {unlocked && <td colSpan={2} style={cellStyle}></td>}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selection bar */}
      {selectedRows.size > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "#1e40af", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>📌 <strong>{selectedRows.size}</strong> selezionat{selectedRows.size === 1 ? "a" : "e"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(() => { const w = filtered.filter(e => selectedRows.has(e.id) && parseCreativitaFiles(e.creativita_url, e.creativita_nome).length > 0); return w.length > 0 ? <button className="btn" onClick={() => setGalleryOpen(true)} style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", padding: "4px 14px", borderRadius: 6, fontSize: 12 }}>🖼 Creatività ({w.length})</button> : null; })()}
            <button className="btn" onClick={clearSelection} style={{ background: "#2563eb", color: "#fff", padding: "4px 14px", borderRadius: 6, fontSize: 12 }}>Deseleziona</button>
          </div>
        </div>
      )}

      {/* Summary — Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
        <SummaryCard label="Totale Spesa" value={totSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
        <SummaryCard label="Totale Spesa Netta" value={totSpesaNetta} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" detail="Somma spese nette" />
      </div>
      {/* Summary — Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Spesa Offline" value={totOffline} icon="📻" gradient="linear-gradient(135deg, #fbbf24, #f59e0b)" textColor="#78350f" subColor="rgba(120,53,15,.6)" />
        <SummaryCard label="Spesa Online" value={totOnline} icon="🌐" gradient="linear-gradient(135deg, #60a5fa, #3b82f6)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
      </div>

      {monthDropdownOpen && <div onClick={() => setMonthDropdownOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />}

      {/* Gallery */}
      {galleryOpen && (() => {
        const giEntries = filtered.filter(e => selectedRows.has(e.id) && parseCreativitaFiles(e.creativita_url, e.creativita_nome).length > 0);
        const allFiles = giEntries.flatMap(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).map(f => ({ ...f, entry: e })));
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setGalleryOpen(false)}>
            <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, maxWidth: 900, width: "100%", maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #e8ecf1", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>🖼 Creatività ({allFiles.length} file)</span>
                <button className="btn" onClick={() => setGalleryOpen(false)} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
              </div>
              <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {allFiles.map((item, idx) => (
                  <div key={idx} style={{ border: "1px solid #e8ecf1", borderRadius: 12, overflow: "hidden", background: "#fafbfc" }}>
                    <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
                      {isImageUrl(item.url) ? <img src={item.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div style={{ fontSize: 40 }}>📄</div>}
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.entry.descrizione}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{item.nome}</div>
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", marginTop: 6, background: "#3b82f6", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: "none" }}>{isImageUrl(item.url) ? "🔍 Apri" : "📥 Scarica"}</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {detailEntry && <DetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />}

      {metaImportRows && (
        <CsvImportModal
          rows={metaImportRows}
          onConfirm={handleMetaConfirm}
          onClose={() => setMetaImportRows(null)}
          saving={metaImporting}
          title="📊 Importa Meta Ads"
          existingEntries={entries}
        />
      )}

      {googleImportRows && (
        <CsvImportModal
          rows={googleImportRows}
          onConfirm={handleGoogleConfirm}
          onClose={() => setGoogleImportRows(null)}
          saving={googleImporting}
          title="📈 Importa Google Ads"
          existingEntries={entries}
        />
      )}
      {duplicateEntry && (
        <DuplicateModal
          entry={duplicateEntry}
          onClose={() => setDuplicateEntry(null)}
          onSaved={async () => { setDuplicateEntry(null); showToast("✓ Azione duplicata con successo!"); await loadEntries(); }}
        />
      )}

    </PageShell>
  );
}
// ============================
function CollettivePage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterNome, setFilterNome] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mapEntry, setMapEntry] = useState<Entry | null>(null);

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "collettiva=eq.true&order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const availableYears = Array.from(new Set(entries.map(e => e.meseCompetenza.split("-")[0]))).sort().reverse();
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  const availableNomi = Array.from(new Set(entries.map(e => e.nome_collettiva || "Senza nome"))).sort();
  const filtered = entries.filter(e => {
    if (filterYear !== "all" && !e.meseCompetenza.startsWith(filterYear)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    if (filterNome !== "all" && (e.nome_collettiva || "Senza nome") !== filterNome) return false;
    return true;
  });
  const groups = Array.from(new Set(filtered.map(e => e.nome_collettiva || "Senza nome"))).sort();
  const toggleRow = (id: string) => { setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const toggleGroup = (g: string) => { setCollapsedGroups(prev => { const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n; }); };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  const totBase = selectedRows.size > 0 ? filtered.filter(e => selectedRows.has(e.id)) : filtered;
  const totSpesa = totBase.reduce((s, e) => s + e.spesa, 0);
  const totSpesaNetta = totBase.reduce((s, e) => s + calcSpesaNetta(e), 0);
  const totOffline = totBase.filter(e => OFFLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);
  const totOnline = totBase.filter(e => ONLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);
  const totSpesaLeonori = totBase.reduce((s, e) => s + (e.numero_partecipanti > 0 ? e.spesa / e.numero_partecipanti : 0), 0);

  return (
    <PageShell toast={toast}>
      <NavBar current="collettive" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>🤝 Collettive</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Iniziative raggruppate per Nome Collettiva</p>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 24, border: "1px solid #e8ecf1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🔍 Filtri:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>Collettiva:</span>
          <select value={filterNome} onChange={e => { setFilterNome(e.target.value); setSelectedRows(new Set()); }} style={{ ...inputStyle, width: "auto", padding: "5px 10px", fontSize: 13 }}><option value="all">Tutte</option>{availableNomi.map(n => <option key={n} value={n}>{n}</option>)}</select>
        </div>
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
          const h = ["Collettiva", "Mese", "Data Inizio", "Data Fine", "Descrizione", "Tipologia", "Brand", "Spesa", "Imp. Rimborso", "Spesa Netta"];
          const r = filtered.map(e => [e.nome_collettiva, getMonthLabelShort(e.meseCompetenza), formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione, e.tipologia, e.brand, Math.round(e.spesa).toString(), Math.round(calcImportoRimborso(e)).toString(), Math.round(calcSpesaNetta(e)).toString()]);
          exportCSV("collettive.csv", h, r);
        }}
        onPrint={() => window.print()}
      />

      {/* Map embed modal */}
      {mapEntry && mapEntry.mappa_url && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setMapEntry(null)}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 800, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 60px rgba(0,0,0,.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e8ecf1" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>📍 Mappa OOH — {mapEntry.descrizione}</h3>
                <span style={{ fontSize: 12, color: "#64748b" }}>{mapEntry.brand} · {formatDate(mapEntry.dataInizio)} → {formatDate(mapEntry.dataFine)}</span>
              </div>
              <button className="btn" onClick={() => setMapEntry(null)} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 13 }}>✕</button>
            </div>
            <div style={{ padding: 20 }}>
              <iframe src={getEmbedUrl(mapEntry.mappa_url!)} width="100%" height="450" style={{ border: 0, borderRadius: 10 }} allowFullScreen loading="lazy" />
              {(mapEntry.poster_3x2 > 0 || mapEntry.poster_altri > 0 || mapEntry.poster_maxi > 0) && (
                <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
                  <div style={{ background: "#f0f9ff", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}><strong>{mapEntry.poster_3x2}</strong> <span style={{ color: "#64748b", fontSize: 11 }}>Poster 3x2</span></div>
                  <div style={{ background: "#f0f9ff", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}><strong>{mapEntry.poster_altri}</strong> <span style={{ color: "#64748b", fontSize: 11 }}>Poster altri</span></div>
                  <div style={{ background: "#f0f9ff", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}><strong>{mapEntry.poster_maxi}</strong> <span style={{ color: "#64748b", fontSize: 11 }}>Poster maxi</span></div>
                  <div style={{ background: "#e0f2fe", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}><strong>{mapEntry.poster_3x2 + mapEntry.poster_altri + mapEntry.poster_maxi}</strong> <span style={{ color: "#64748b", fontSize: 11 }}>Totale</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center", color: "#94a3b8", border: "1px solid #e8ecf1" }}>Nessuna collettiva</div>
      ) : groups.map(groupName => {
        const ge = filtered.filter(e => (e.nome_collettiva || "Senza nome") === groupName);
        const gBase = selectedRows.size > 0 ? ge.filter(e => selectedRows.has(e.id)) : ge;
        const gSpesa = gBase.reduce((s, e) => s + e.spesa, 0);
        const gSpesaNetta = gBase.reduce((s, e) => s + calcSpesaNetta(e), 0);
        const isCollapsed = collapsedGroups.has(groupName);
        const groupMonths = Array.from(new Set(ge.map(e => e.meseCompetenza))).sort();
        return (
          <div key={groupName} style={{ marginBottom: 24 }}>
            {/* Collapsible group header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f8fafc", borderRadius: isCollapsed ? 12 : "12px 12px 0 0", border: "1px solid #e8ecf1", borderBottom: isCollapsed ? undefined : "none", userSelect: "none" }}>
              <span onClick={() => toggleGroup(groupName)} style={{ fontSize: 16, cursor: "pointer", transition: "transform .2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
              <span style={{ background: "#ecfdf5", color: "#059669", padding: "3px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>🤝</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0, flex: 1, cursor: "pointer" }} onClick={() => toggleGroup(groupName)}>{groupName}</h2>
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400, marginRight: 8 }}>{ge.length} azioni · {formatEur(gSpesa)}</span>
              <button className="btn" onClick={() => downloadPianoCollettiva(groupName, ge)} title="Scarica piano collettiva" style={{ background: "#7c3aed", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>📥 Piano</button>
            </div>

            {!isCollapsed && (
              <div style={{ background: "#fff", borderRadius: "0 0 16px 16px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 12, border: "1px solid #e8ecf1", borderTop: "none" }}>
                {/* Table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}>
                          <input type="checkbox" checked={ge.every(e => selectedRows.has(e.id))} onChange={() => { const a = ge.every(e => selectedRows.has(e.id)); setSelectedRows(prev => { const n = new Set(prev); ge.forEach(e => a ? n.delete(e.id) : n.add(e.id)); return n; }); }} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                        </th>
                        {["Mese", "Periodo", "Descrizione", "Tipo", "Brand", "Spesa", "Imp. Rimb.", "Sp. Netta", ""].map((h, i) => (
                          <th key={i} style={{ padding: "10px 8px", textAlign: i >= 5 && i < 8 ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ge.map(e => { const ir = calcImportoRimborso(e); const sn = calcSpesaNetta(e); return (
                        <tr key={e.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9", background: selectedRows.has(e.id) ? "#eff6ff" : "transparent" }}>
                          <td style={{ ...cellStyle, textAlign: "center", width: 36 }}><input type="checkbox" checked={selectedRows.has(e.id)} onChange={() => toggleRow(e.id)} style={{ accentColor: "#3b82f6", cursor: "pointer" }} /></td>
                          <td style={cellStyle}><span style={{ fontSize: 11 }}>{getMonthLabelShort(e.meseCompetenza)}</span></td>
                          <td style={cellStyle}><span style={{ fontSize: 11 }}>{formatDate(e.dataInizio)}<br/>{formatDate(e.dataFine)}</span></td>
                          <td style={{ ...cellStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>{e.descrizione}</td>
                          <td style={cellStyle}>
                            <span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : ONLINE_TYPES.includes(e.tipologia) ? "#dbeafe" : "#f1f5f9", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : ONLINE_TYPES.includes(e.tipologia) ? "#1e40af" : "#475569", padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{e.tipologia}</span>
                            {e.tipologia === "OOH" && <span style={{ marginLeft: 3, fontSize: 11 }} title="Campagna OOH">📍</span>}
                          </td>
                          <td style={{ ...cellStyle, fontSize: 11 }}>{e.brand}</td>
                          <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{formatEur(e.spesa)}</td>
                          <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{ir > 0 ? formatEur(ir) : "—"}</td>
                          <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: "#059669" }}>{formatEur(sn)}</td>
                          <td style={{ ...cellStyle, textAlign: "center" }}>
                            {e.tipologia === "OOH" && e.mappa_url && (
                              <button className="btn" onClick={() => setMapEntry(e)} title="Visualizza mappa" style={{ background: "#dbeafe", color: "#1e40af", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>📍</button>
                            )}
                            {e.fattura_url && <a href={e.fattura_url} target="_blank" rel="noopener noreferrer" title="Fattura PDF" style={{ marginLeft: 4, fontSize: 13 }}>📄</a>}
                          </td>
                        </tr>
                      );})}
                    </tbody>
                  </table>
                </div>

                {/* Mini Timeline per group */}
                <div style={{ padding: "8px 16px 16px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 2 }}>📅 Timeline</div>
                  {groupMonths.map(mk => <MiniGantt key={mk} entries={ge} monthKey={mk} />)}
                </div>

                {/* Group summary */}
                <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
                  <SummaryCard label="Totale Spesa" value={gSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
                  <SummaryCard label="Spesa Netta" value={gSpesaNetta} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {selectedRows.size > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 16px", marginBottom: 16, marginTop: 16, fontSize: 13, color: "#1e40af", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>📌 <strong>{selectedRows.size}</strong> selezionat{selectedRows.size === 1 ? "a" : "e"}</span>
          <button className="btn" onClick={() => setSelectedRows(new Set())} style={{ background: "#2563eb", color: "#fff", padding: "4px 14px", borderRadius: 6, fontSize: 12 }}>Deseleziona</button>
        </div>
      )}

      {/* Summary Row 1 */}
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 16 }}>
        <SummaryCard label="Totale Spesa" value={totSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
        <SummaryCard label="Totale Spesa Leonori" value={totSpesaLeonori} icon="🏢" gradient="linear-gradient(135deg, #a855f7, #7c3aed)" textColor="#fff" subColor="rgba(255,255,255,.6)" detail="Spesa / N. partecipanti" />
        <SummaryCard label="Totale Spesa Netta" value={totSpesaNetta} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" detail="Somma spese nette" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Spesa Offline" value={totOffline} icon="📻" gradient="linear-gradient(135deg, #fbbf24, #f59e0b)" textColor="#78350f" subColor="rgba(120,53,15,.6)" />
        <SummaryCard label="Spesa Online" value={totOnline} icon="🌐" gradient="linear-gradient(135deg, #60a5fa, #3b82f6)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
      </div>
    </PageShell>
  );
}

// ============================
// PAGINA - Piani Extra
// ============================
function PianiExtraPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "piano_extra=eq.true&order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const availableYears = Array.from(new Set(entries.map(e => e.meseCompetenza.split("-")[0]))).sort().reverse();
  const availableBrands = Array.from(new Set(entries.map(e => e.brand))).sort();
  const filtered = entries.filter(e => {
    if (filterYear !== "all" && !e.meseCompetenza.startsWith(filterYear)) return false;
    if (filterBrand !== "all" && e.brand !== filterBrand) return false;
    return true;
  });
  const groups = Array.from(new Set(filtered.map(e => e.brand))).sort();
  const toggleRow = (id: string) => { setSelectedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  const totBase = selectedRows.size > 0 ? filtered.filter(e => selectedRows.has(e.id)) : filtered;
  const totSpesa = totBase.reduce((s, e) => s + e.spesa, 0);
  const totSpesaNetta = totBase.reduce((s, e) => s + calcSpesaNetta(e), 0);
  const totOffline = totBase.filter(e => OFFLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);
  const totOnline = totBase.filter(e => ONLINE_TYPES.includes(e.tipologia)).reduce((s, e) => s + e.spesa, 0);

  return (
    <PageShell toast={toast}>
      <NavBar current="piani-extra" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📌 Piani Extra</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Iniziative piano extra raggruppate per Brand</p>
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
          const h = ["Brand", "Mese", "Data Inizio", "Data Fine", "Descrizione", "Tipologia", "Spesa", "Imp. Rimborso", "Spesa Netta"];
          const r = filtered.map(e => [e.brand, getMonthLabelShort(e.meseCompetenza), formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione, e.tipologia, Math.round(e.spesa).toString(), Math.round(calcImportoRimborso(e)).toString(), Math.round(calcSpesaNetta(e)).toString()]);
          exportCSV("piani-extra.csv", h, r);
        }}
        onPrint={() => window.print()}
      />

      {groups.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center", color: "#94a3b8", border: "1px solid #e8ecf1" }}>Nessuna iniziativa piano extra</div>
      ) : groups.map(brandName => {
        const ge = filtered.filter(e => e.brand === brandName);
        const gBase = selectedRows.size > 0 ? ge.filter(e => selectedRows.has(e.id)) : ge;
        const gSpesa = gBase.reduce((s, e) => s + e.spesa, 0);
        const gSpesaNetta = gBase.reduce((s, e) => s + calcSpesaNetta(e), 0);
        return (
          <div key={brandName} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "#f3e8ff", color: "#7c3aed", padding: "3px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>📌</span>{brandName}
              <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>({ge.length})</span>
            </h2>
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 12, border: "1px solid #e8ecf1" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={{ padding: "10px 6px", borderBottom: "2px solid #e8ecf1", width: 36, textAlign: "center" }}>
                        <input type="checkbox" checked={ge.every(e => selectedRows.has(e.id))} onChange={() => { const a = ge.every(e => selectedRows.has(e.id)); setSelectedRows(prev => { const n = new Set(prev); ge.forEach(e => a ? n.delete(e.id) : n.add(e.id)); return n; }); }} style={{ accentColor: "#3b82f6", cursor: "pointer" }} />
                      </th>
                      {["Mese", "Periodo", "Descrizione", "Tipo", "Spesa", "Imp. Rimb.", "Sp. Netta"].map((h, i) => (
                        <th key={i} style={{ padding: "10px 8px", textAlign: i >= 4 ? "right" : "left", fontWeight: 600, color: "#475569", borderBottom: "2px solid #e8ecf1", whiteSpace: "nowrap", fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ge.map(e => { const ir = calcImportoRimborso(e); const sn = calcSpesaNetta(e); return (
                      <tr key={e.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9", background: selectedRows.has(e.id) ? "#eff6ff" : "transparent" }}>
                        <td style={{ ...cellStyle, textAlign: "center", width: 36 }}><input type="checkbox" checked={selectedRows.has(e.id)} onChange={() => toggleRow(e.id)} style={{ accentColor: "#3b82f6", cursor: "pointer" }} /></td>
                        <td style={cellStyle}><span style={{ fontSize: 11 }}>{getMonthLabelShort(e.meseCompetenza)}</span></td>
                        <td style={cellStyle}><span style={{ fontSize: 11 }}>{formatDate(e.dataInizio)}<br/>{formatDate(e.dataFine)}</span></td>
                        <td style={{ ...cellStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.descrizione}>{e.descrizione}</td>
                        <td style={cellStyle}><span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : ONLINE_TYPES.includes(e.tipologia) ? "#dbeafe" : "#f1f5f9", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : ONLINE_TYPES.includes(e.tipologia) ? "#1e40af" : "#475569", padding: "2px 6px", borderRadius: 5, fontSize: 10, fontWeight: 600 }}>{e.tipologia}</span></td>
                        <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{formatEur(e.spesa)}</td>
                        <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 12 }}>{ir > 0 ? formatEur(ir) : "—"}</td>
                        <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 12, color: "#059669" }}>{formatEur(sn)}</td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <SummaryCard label="Totale Spesa" value={gSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
              <SummaryCard label="Spesa Netta" value={gSpesaNetta} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
            </div>
          </div>
        );
      })}

      {selectedRows.size > 0 && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 16px", marginBottom: 16, marginTop: 16, fontSize: 13, color: "#1e40af", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>📌 <strong>{selectedRows.size}</strong> selezionat{selectedRows.size === 1 ? "a" : "e"}</span>
          <button className="btn" onClick={() => setSelectedRows(new Set())} style={{ background: "#2563eb", color: "#fff", padding: "4px 14px", borderRadius: 6, fontSize: 12 }}>Deseleziona</button>
        </div>
      )}

      {/* Summary Row 1 */}
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
        <SummaryCard label="Totale Spesa" value={totSpesa} icon="💰" gradient="linear-gradient(135deg, #1e293b, #334155)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
        <SummaryCard label="Totale Spesa Netta" value={totSpesaNetta} icon="🧾" gradient="linear-gradient(135deg, #059669, #10b981)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
      </div>
      {/* Summary Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        <SummaryCard label="Spesa Offline" value={totOffline} icon="📻" gradient="linear-gradient(135deg, #fbbf24, #f59e0b)" textColor="#78350f" subColor="rgba(120,53,15,.6)" />
        <SummaryCard label="Spesa Online" value={totOnline} icon="🌐" gradient="linear-gradient(135deg, #60a5fa, #3b82f6)" textColor="#fff" subColor="rgba(255,255,255,.6)" />
      </div>
    </PageShell>
  );
}

// ============================
// PAGINA - Timeline
// ============================
function TimelinePage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(getCurrentMonthKey());

  const loadEntries = useCallback(async () => {
    try { const data = await supabase.select(TABLE, "order=data_inizio.asc"); setEntries(data.map(mapEntryFn)); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const availableMonths = Array.from(new Set(entries.map(e => e.meseCompetenza))).sort().reverse();
  if (!availableMonths.includes(getCurrentMonthKey())) availableMonths.unshift(getCurrentMonthKey());

  // Get days in selected month
  const [selYear, selMon] = filterMonth.split("-").map(Number);
  const daysInMonth = new Date(selYear, selMon, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Filter entries that overlap with selected month
  const monthStart = `${filterMonth}-01`;
  const monthEnd = `${filterMonth}-${String(daysInMonth).padStart(2, "0")}`;
  const filtered = entries.filter(e => e.dataInizio <= monthEnd && e.dataFine >= monthStart);

  // Get unique brands for legend
  const brandsInView = Array.from(new Set(filtered.map(e => e.brand))).sort();

  // Calculate active days for each entry
  function getActiveDays(e: Entry): Set<number> {
    const active = new Set<number>();
    // Stampa with date_singole: only individual days
    if (e.tipologia === "Stampa" && e.date_singole) {
      const dates = e.date_singole.split(",");
      for (const d of dates) {
        if (d.startsWith(filterMonth)) {
          active.add(new Date(d + "T00:00:00").getDate());
        }
      }
      return active;
    }
    // All others: continuous bar
    const s = new Date(e.dataInizio + "T00:00:00");
    const en = new Date(e.dataFine + "T00:00:00");
    const ms = new Date(monthStart + "T00:00:00");
    const me = new Date(monthEnd + "T00:00:00");
    const startDay = s < ms ? 1 : s.getDate();
    const endDay = en > me ? daysInMonth : en.getDate();
    for (let i = startDay; i <= endDay; i++) active.add(i);
    return active;
  }

  const ganttRef = useRef<HTMLDivElement>(null);

  const handleExportCSV = () => {
    const h = ["Tipologia", "Soggetto", "Brand", "Data Inizio", "Data Fine", "Descrizione"];
    const r = filtered.map(e => {
      return [e.tipologia, e.soggetto || "", e.brand, formatDate(e.dataInizio), formatDate(e.dataFine), e.descrizione];
    });
    exportCSV("timeline.csv", h, r);
  };

  const handleDownloadJPEG = async () => {
    if (!ganttRef.current) return;
    try {
      // Carica html2canvas da CDN solo al momento del click (nessun npm install)
      if (!(window as any).html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Impossibile caricare html2canvas"));
          document.head.appendChild(script);
        });
      }
      const h2c = (window as any).html2canvas;
      const el = ganttRef.current;
      const canvas = await h2c(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
      });
      const link = document.createElement("a");
      link.download = `timeline_${filterMonth}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } catch (e) {
      console.error("Errore export JPEG:", e);
      alert("Errore durante l'esportazione. Riprova.");
    }
  };

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#6b7280" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div><div>Caricamento...</div></div></div>;

  return (
    <PageShell toast={null}>
      <NavBar current="timeline" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" }}>📅 Timeline Iniziative</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#64748b" }}>Visualizzazione Gantt delle azioni marketing</p>
      </div>

      {/* Month selector */}
      <div style={{ background: "#fff", borderRadius: 14, padding: "14px 20px", marginBottom: 20, border: "1px solid #e8ecf1", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>🗓 Mese:</span>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 12px", fontSize: 13 }}>
          {availableMonths.map(m => <option key={m} value={m}>{getMonthLabel(m)}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{filtered.length} iniziative</span>
      </div>

      {/* Legend */}
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

      {/* Gantt Chart */}
      <div ref={ganttRef} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)", border: "1px solid #e8ecf1" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                <th style={{ padding: "8px 10px", textAlign: "left", color: "#fff", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".3px", position: "sticky", left: 0, background: "#1e293b", zIndex: 2, minWidth: 200 }}>Media / Soggetto</th>
                {days.map(d => (
                  <th key={d} style={{ padding: "8px 2px", textAlign: "center", color: "#cbd5e1", fontWeight: 500, fontSize: 10, minWidth: 28, borderLeft: "1px solid #334155" }}>{d}</th>
                ))}
                <th style={{ padding: "8px 10px", textAlign: "left", color: "#fff", fontWeight: 600, fontSize: 10, textTransform: "uppercase", minWidth: 160 }}>Descrizione</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={daysInMonth + 2} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nessuna iniziativa nel mese selezionato</td></tr>
              ) : filtered.map(e => {
                const activeDays = getActiveDays(e);
                const color = getBrandColor(e.brand);
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
                          {isActive && (
                            <div style={{ background: color, height: "100%", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 8, fontWeight: 700, letterSpacing: ".05em", borderRadius: isStampa ? 4 : 0 }}>
                              {abbr}
                            </div>
                          )}
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
    </PageShell>
  );
}

// ============================
// PAGINA - Creatività
// ============================
function CreativitaPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
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

  // Only entries with image creativita
  const imageEntries = entries.filter(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).some(f => isImageUrl(f.url)));
  const availableBrands = Array.from(new Set(imageEntries.map(e => e.brand))).sort();
  const availableMonths = Array.from(new Set(imageEntries.map(e => e.meseCompetenza))).sort().reverse();
  const availableTipologie = Array.from(new Set(imageEntries.map(e => e.tipologia))).sort();

  // If current month has no entries, auto-select "all" on first load
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
      // Sort: month desc, then brand asc
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

      {/* Filters */}
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

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 60, textAlign: "center", color: "#94a3b8", border: "1px solid #e8ecf1" }}>Nessuna creatività con immagine trovata</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {filtered.flatMap(e => parseCreativitaFiles(e.creativita_url, e.creativita_nome).filter(f => isImageUrl(f.url)).map((f, fi) => (
            <div key={e.id + "-" + fi} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e8ecf1", boxShadow: "0 2px 8px rgba(0,0,0,.04)", transition: "box-shadow .2s" }}>
              {/* Image */}
              <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", position: "relative", paddingBottom: "62%", background: "#f1f5f9", overflow: "hidden" }}>
                <img src={f.url} alt={e.descrizione} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              </a>
              {/* Badges */}
              <div style={{ padding: "12px 16px 0" }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ background: getBrandColor(e.brand), color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{e.brand}</span>
                  <span style={{ background: OFFLINE_TYPES.includes(e.tipologia) ? "#fef3c7" : "#dbeafe", color: OFFLINE_TYPES.includes(e.tipologia) ? "#92400e" : "#1e40af", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{e.tipologia}</span>
                  {e.piano_extra && <span style={{ background: "#f3e8ff", color: "#7c3aed", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>EXTRA</span>}
                  {e.collettiva && <span style={{ background: "#ecfdf5", color: "#059669", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600 }}>COLL</span>}
                </div>
                {/* Title */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 4px", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{e.descrizione}</h3>
                {f.nome && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 4px" }}>{f.nome}</p>}
                {e.soggetto && <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px" }}>{e.soggetto}</p>}
              </div>
              {/* Details row */}
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


// ============================
// PAGINA - Campagne OOH (legge da marketing_entries)
// ============================
function OOHDetailPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

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

      {/* Filters */}
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

      {/* Summary */}
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

      {/* Map modal */}
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

      {/* Table */}
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
                <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nessuna campagna OOH. Inseriscile dalla pagina Costi Marketing con tipologia "OOH".</td></tr>
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
// ============================
// PAGINA 7 - Lead <-> Contratti
// ============================

// ---- LC: Agenti esclusi ----
const LC_AGENTI_ESCLUSI = new Set([
  "DIREZIONE", "LEASEPLAN - MASSIMILIANO ROCCO", "DI SORA AGOSTINO",
  "VERSACE DOMENICO", "CEDRARO LUCA", "GIANNINI CRISTINA",
  "CENNAMO ROBERTO", "DI RITA FABIO", "CESARIA LARA",
  "TULLI MARCO", "ALU' GIULIANO", "LEROSE VITO",
]);
function lcIsExcluded(v: string | undefined): boolean {
  if (!v) return false;
  return LC_AGENTI_ESCLUSI.has(v.trim().toUpperCase());
}

// ---- LC: Normalization ----
function lcNormMobile(raw: string | null | undefined): string {
  if (!raw || raw === "" || raw === "null" || raw === "undefined") return "N/D";
  let p = String(raw).trim();
  if (p.startsWith("0039")) p = p.substring(4);
  else if (p.startsWith("+39")) p = p.substring(3);
  else if (p.startsWith("039") && p.length > 3) p = p.substring(3);
  p = p.replace(/[^0-9]/g, "");
  if (p === "") return "N/D";
  if (/3{5,}/.test(p)) return "N/D";
  if (p.startsWith("06")) return "N/D";
  return p;
}
function lcNormEmail(raw: string | null | undefined): string {
  if (!raw || raw === "" || raw === "null") return "";
  return String(raw).trim().toLowerCase();
}
function lcNormName(raw: string | null | undefined): string {
  if (!raw || raw === "" || raw === "null") return "";
  return String(raw).trim().toUpperCase().replace(/\s+/g, " ");
}

// ---- LC: Types ----
interface LCContratto {
  n_contratto: string; data_contratto: string; ragsoc_cliente: string;
  brand: string; modello: string; versione: string; sede_contratto: string;
  cap_cliente: string; provincia: string; tipo_contratto: string; status: string;
  venditore: string; importo: number;
  mobile_norm: string; email_norm: string; nome_norm: string;
}
interface LCLead {
  idx: number; first_name: string; last_name: string; created_date: string;
  mobile: string; email: string; lead_source: string; brand: string;
  mobile_norm: string; email_norm: string; nome_norm: string;
}
interface LCDashRow {
  n_contratto: string; data_contratto: string; ragsoc_cliente: string;
  brand: string; modello: string; versione: string; sede_contratto: string;
  cap_cliente: string; provincia: string; tipo_contratto: string; status: string;
  venditore: string; importo: number;
  lead_source: string; lead_date: string; match_type: string;
  attribuzione: number; origine_contratto: string;
  first_name: string; last_name: string;
}

// ---- LC: Parsing helpers ----
function lcParseDate(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().split("T")[0];
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}
function lcMapTipo(c: string): string { return c === "CN01" ? "Nuovo" : c === "CU01" ? "Usato" : c; }
function lcMapStatus(c: string): string { return c === "X" ? "Annullato" : c === "A" ? "Aperto" : c === "C" ? "Chiuso" : c; }
function lcGetMobile(cell: unknown, tel: unknown): string {
  const c = cell ? String(cell).trim() : "";
  const t = tel ? String(tel).trim() : "";
  if (c && c !== "NaN" && c !== "nan" && c !== "null") return c;
  return t;
}
function lcFmtCap(raw: unknown): string {
  if (!raw || raw === "NaN") return "";
  return String(raw).replace(/\.0$/, "").trim().padStart(5, "0");
}

function lcReadExcel(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[]);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function lcParseNuovo(rows: Record<string, unknown>[]): LCContratto[] {
  return rows.map(r => {
    const dc = lcParseDate(r["data_contratto"]);
    const anno = dc ? dc.substring(0, 4) : "";
    const num = String(r["numero_contratto"] ?? "");
    const rawM = lcGetMobile(r["cellulare"], r["telefono"]);
    return {
      n_contratto: anno + "-" + num, data_contratto: dc,
      ragsoc_cliente: String(r["ragsoc_clicontr"] ?? ""),
      brand: String(r["descrizione_marca"] ?? ""), modello: String(r["descrizione_modello"] ?? ""),
      versione: String(r["descrizione_versione"] ?? ""), sede_contratto: String(r["descr_sede"] ?? ""),
      cap_cliente: lcFmtCap(r["cap"]), provincia: String(r["provincia"] ?? ""),
      tipo_contratto: lcMapTipo(String(r["tipo_contratto"] ?? "")),
      status: lcMapStatus(String(r["status"] ?? "")),
      venditore: String(r["descr_agente"] ?? ""), importo: Number(r["importo"]) || 0,
      mobile_norm: lcNormMobile(rawM), email_norm: lcNormEmail(r["email"] as string),
      nome_norm: lcNormName(r["ragsoc_clicontr"] as string),
    };
  });
}

function lcParseUsato(rows: Record<string, unknown>[]): LCContratto[] {
  return rows.map(r => {
    const dc = lcParseDate(r["data_contratto"]);
    const anno = dc ? dc.substring(0, 4) : "";
    const num = String(r["numero_contratto"] ?? "");
    const rawM = lcGetMobile(r["cellulare"], r["telefono"]);
    return {
      n_contratto: anno + "-" + num, data_contratto: dc,
      ragsoc_cliente: String(r["cliente_contratto"] ?? ""),
      brand: String(r["descr_marca"] ?? ""), modello: String(r["descr_modello"] ?? ""),
      versione: String(r["descr_versione"] ?? ""), sede_contratto: String(r["descr_sede"] ?? ""),
      cap_cliente: lcFmtCap(r["cap"]), provincia: String(r["provincia"] ?? ""),
      tipo_contratto: lcMapTipo(String(r["tipo_contratto"] ?? "")),
      status: lcMapStatus(String(r["status"] ?? "")),
      venditore: String(r["descr_agente"] ?? ""), importo: Number(r["importo"]) || 0,
      mobile_norm: lcNormMobile(rawM), email_norm: lcNormEmail(r["email"] as string),
      nome_norm: lcNormName(r["cliente_contratto"] as string),
    };
  });
}

function lcParseLeads(rows: Record<string, unknown>[]): LCLead[] {
  return rows.map((r, i) => {
    const fn = String(r["First Name"] ?? "").trim();
    const ln = String(r["Last Name"] ?? "").trim();
    return {
      idx: i, first_name: fn, last_name: ln,
      created_date: lcParseDate(r["Created Date"]),
      mobile: String(r["Mobile"] ?? ""), email: String(r["Email"] ?? ""),
      lead_source: String(r["Lead Source"] ?? ""), brand: String(r["Brand"] ?? ""),
      mobile_norm: lcNormMobile(r["Mobile"] as string),
      email_norm: lcNormEmail(r["Email"] as string),
      nome_norm: lcNormName((fn + " " + ln).trim()),
    };
  });
}

// ---- LC: Matching ----
function lcMatch(contratti: LCContratto[], leads: LCLead[]): LCDashRow[] {
  const byMobile = new Map<string, LCLead[]>();
  const byEmail = new Map<string, LCLead[]>();
  const byNome = new Map<string, LCLead[]>();
  for (const l of leads) {
    if (l.mobile_norm && l.mobile_norm !== "N/D") {
      if (!byMobile.has(l.mobile_norm)) byMobile.set(l.mobile_norm, []);
      byMobile.get(l.mobile_norm)!.push(l);
    }
    if (l.email_norm) {
      if (!byEmail.has(l.email_norm)) byEmail.set(l.email_norm, []);
      byEmail.get(l.email_norm)!.push(l);
    }
    if (l.nome_norm) {
      if (!byNome.has(l.nome_norm)) byNome.set(l.nome_norm, []);
      byNome.get(l.nome_norm)!.push(l);
    }
  }

  const result: LCDashRow[] = [];

  for (const c of contratti) {
    const matchedIds = new Set<number>();
    const matches: { lead: LCLead; type: string }[] = [];
    const filterDate = (arr: LCLead[]) => arr.filter(l => l.created_date && l.created_date < c.data_contratto);

    // 1) Mobile
    if (c.mobile_norm && c.mobile_norm !== "N/D") {
      for (const l of filterDate(byMobile.get(c.mobile_norm) || [])) {
        if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "mobile" }); }
      }
    }
    // 2) Email
    if (c.email_norm) {
      for (const l of filterDate(byEmail.get(c.email_norm) || [])) {
        if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "email" }); }
      }
    }
    // 3) Nome
    if (c.nome_norm) {
      for (const l of filterDate(byNome.get(c.nome_norm) || [])) {
        if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "nome" }); }
      }
    }

    if (matches.length > 0) {
      const attr = 1 / matches.length;
      for (const m of matches) {
        const origSrc = m.lead.lead_source;
        const orig = origSrc === "Casa Madre" ? "Lead Casa Madre" : (!origSrc || origSrc.toLowerCase() === "walk in" ? "Walk In" : "Lead Interno");
        result.push({
          ...c, lead_source: origSrc, lead_date: m.lead.created_date,
          match_type: m.type, attribuzione: attr, origine_contratto: orig,
          first_name: m.lead.first_name, last_name: m.lead.last_name,
        });
      }
    } else {
      result.push({
        ...c, lead_source: "", lead_date: "", match_type: "", attribuzione: 0,
        origine_contratto: "Walk In", first_name: "", last_name: "",
      });
    }
  }
  return result;
}

// ---- LC: Colors ----
const LC_COLORS: Record<string, string> = {
  "Lead Casa Madre": "#2563eb", "Lead Interno": "#f59e0b", "Walk In": "#10b981",
};

function LeadContrattiPage({ onNavigate, unlocked, setUnlocked }: { onNavigate: (p: PageType) => void; unlocked: boolean; setUnlocked: (v: boolean) => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const refNuovo = useRef<HTMLInputElement>(null);
  const refUsato = useRef<HTMLInputElement>(null);
  const refLeads = useRef<HTMLInputElement>(null);

  const [fileNuovo, setFileNuovo] = useState<File | null>(null);
  const [fileUsato, setFileUsato] = useState<File | null>(null);
  const [fileLeads, setFileLeads] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [dashData, setDashData] = useState<LCDashRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ contratti: number; leads: number; matches: number; esclusi: number } | null>(null);

  // Filters
  const [fTipo, setFTipo] = useState<string[]>(["Nuovo", "Usato"]);
  const [fOrigine, setFOrigine] = useState<string[]>(["Lead Casa Madre", "Lead Interno", "Walk In"]);
  const [fMesi, setFMesi] = useState<string[]>([]);

  const availableMesi = useMemo(() => {
    const s = new Set<string>();
    dashData.forEach(r => { if (r.data_contratto) s.add(r.data_contratto.substring(0, 7)); });
    return Array.from(s).sort();
  }, [dashData]);

  useEffect(() => {
    if (availableMesi.length > 0 && fMesi.length === 0) setFMesi([...availableMesi]);
  }, [availableMesi]);

  // Deduplicate: one row per contract
  const dedup = useMemo(() => {
    const grp = new Map<string, LCDashRow[]>();
    dashData.forEach(r => { if (!grp.has(r.n_contratto)) grp.set(r.n_contratto, []); grp.get(r.n_contratto)!.push(r); });
    const out = new Map<string, LCDashRow>();
    grp.forEach((rows, nc) => {
      const wl = rows.filter((r: LCDashRow) => r.lead_date);
      if (wl.length > 0) { wl.sort((a: LCDashRow, b: LCDashRow) => a.lead_date < b.lead_date ? -1 : 1); out.set(nc, wl[0]); }
      else { out.set(nc, { ...rows[0], origine_contratto: "Walk In" }); }
    });
    return Array.from(out.values());
  }, [dashData]);

  const filtered = useMemo(() => {
    return dedup.filter(r => {
      if (!fTipo.includes(r.tipo_contratto)) return false;
      if (!fOrigine.includes(r.origine_contratto)) return false;
      const m = r.data_contratto ? r.data_contratto.substring(0, 7) : "";
      if (fMesi.length > 0 && !fMesi.includes(m)) return false;
      return true;
    });
  }, [dedup, fTipo, fOrigine, fMesi]);

  // Charts
  const chart1 = useMemo(() => {
    const c: Record<string, number> = { "Lead Casa Madre": 0, "Lead Interno": 0, "Walk In": 0 };
    filtered.forEach(r => { if (c[r.origine_contratto] !== undefined) c[r.origine_contratto]++; });
    return Object.entries(c).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const chart2 = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    filtered.forEach(r => {
      const b = r.brand || "N/D";
      if (!m.has(b)) m.set(b, { "Lead Casa Madre": 0, "Lead Interno": 0, "Walk In": 0 });
      const e = m.get(b)!; if (e[r.origine_contratto] !== undefined) e[r.origine_contratto]++;
    });
    return Array.from(m.entries()).map(([brand, v]) => ({ brand, ...v }))
      .sort((a: any, b: any) => ((b["Lead Casa Madre"]||0)+(b["Lead Interno"]||0)+(b["Walk In"]||0)) - ((a["Lead Casa Madre"]||0)+(a["Lead Interno"]||0)+(a["Walk In"]||0)));
  }, [filtered]);

  const chart3 = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    filtered.forEach(r => {
      const s = r.sede_contratto || "N/D";
      if (!m.has(s)) m.set(s, { "Lead Casa Madre": 0, "Lead Interno": 0, "Walk In": 0 });
      const e = m.get(s)!; if (e[r.origine_contratto] !== undefined) e[r.origine_contratto]++;
    });
    return Array.from(m.entries()).map(([sede, v]) => ({ sede, ...v }));
  }, [filtered]);

  const chart4 = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    filtered.forEach(r => {
      const me = r.data_contratto ? r.data_contratto.substring(0, 7) : "N/D";
      if (!m.has(me)) m.set(me, { "Lead Casa Madre": 0, "Lead Interno": 0, "Walk In": 0 });
      const e = m.get(me)!; if (e[r.origine_contratto] !== undefined) e[r.origine_contratto]++;
    });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([mese, v]) => ({ mese, ...v }));
  }, [filtered]);

  // Chart 5: NO Walk In
  const chart5 = useMemo(() => {
    const m = new Map<string, number>();
    filtered.forEach(r => {
      const src = r.lead_source || "";
      if (!src || src.toLowerCase() === "walk in") return;
      m.set(src, (m.get(src) || 0) + 1);
    });
    return Array.from(m.entries()).map(([source, value]) => ({ source, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // KPIs
  const totalContratti = filtered.length;
  const totalCM = filtered.filter(r => r.origine_contratto === "Lead Casa Madre").length;
  const totalInt = filtered.filter(r => r.origine_contratto === "Lead Interno").length;
  const totalWI = filtered.filter(r => r.origine_contratto === "Walk In").length;
  const matchRate = totalContratti > 0 ? (((totalCM + totalInt) / totalContratti) * 100).toFixed(1) : "0";

  // Process
  const handleProcess = async () => {
    if (!fileLeads) { showToast("Carica almeno il file Lead!"); return; }
    setProcessing(true); setError(null); setProgress(0); setProgressMsg("Inizio...");
    try {
      let allC: LCContratto[] = [];
      if (fileNuovo) {
        setProgressMsg("Lettura contratti Nuovo..."); setProgress(10);
        const rn = await lcReadExcel(fileNuovo);
        allC.push(...lcParseNuovo(rn));
        setProgressMsg("Contratti Nuovo: " + allC.length); setProgress(20);
      }
      if (fileUsato) {
        setProgressMsg("Lettura contratti Usato..."); setProgress(30);
        const ru = await lcReadExcel(fileUsato);
        allC.push(...lcParseUsato(ru));
        setProgressMsg("Contratti totali: " + allC.length); setProgress(40);
      }
      // Filtro agenti esclusi
      const validC = allC.filter(c => !lcIsExcluded(c.venditore));
      const esclusi = allC.length - validC.length;

      setProgressMsg("Lettura Lead..."); setProgress(50);
      const rl = await lcReadExcel(fileLeads);
      const leads = lcParseLeads(rl);
      setProgressMsg("Lead: " + leads.length); setProgress(60);

      setProgressMsg("Matching..."); setProgress(70);
      const dash = lcMatch(validC, leads);
      setProgressMsg("Match completato!"); setProgress(100);

      setDashData(dash);
      const uniqueMatched = new Set(dash.filter(r => r.match_type).map(r => r.n_contratto)).size;
      setStats({ contratti: validC.length, leads: leads.length, matches: uniqueMatched, esclusi });
      showToast("Elaborazione completata!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setProcessing(false);
    }
  };

  // Export
  const handleExport = () => {
    const grp = new Map<string, LCDashRow[]>();
    dashData.forEach(r => { if (!grp.has(r.n_contratto)) grp.set(r.n_contratto, []); grp.get(r.n_contratto)!.push(r); });
    const rows: Record<string, unknown>[] = [];
    grp.forEach((mr, nc) => {
      const base = mr[0];
      const sorted = mr.filter((r: LCDashRow) => r.lead_date).sort((a: LCDashRow, b: LCDashRow) => a.lead_date < b.lead_date ? -1 : 1);
      const fl = sorted.length > 0 ? sorted[0] : null;
      rows.push({
        "N. Contratto": nc, "Data Contratto": base.data_contratto,
        "Cognome Nome": base.ragsoc_cliente, "Brand": base.brand,
        "Modello": base.modello, "Versione": base.versione,
        "Sede Contratto": base.sede_contratto, "Venditore": base.venditore || "",
        "CAP Cliente": base.cap_cliente, "Provincia": base.provincia,
        "Tipo Contratto": base.tipo_contratto, "Status": base.status,
        "Origine Contratto": base.origine_contratto,
        "Lead Source": fl?.lead_source || "Walk In", "Lead Date": fl?.lead_date || "",
        "Match Type": fl?.match_type || "",
        "N. Match Totali": mr.filter((r: LCDashRow) => r.match_type).length,
        "Attribuzione": base.attribuzione,
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contratti-Lead");
    XLSX.writeFile(wb, "contratti_lead_export.xlsx");
    showToast("Excel scaricato!");
  };

  const toggleFilter = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const kpiCardStyle = (bg: string, col: string): React.CSSProperties => ({
    background: bg, borderRadius: 14, padding: "18px 20px", textAlign: "center" as const,
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid " + col + "22",
  });
  const chartCardStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 14, padding: "20px 16px",
    boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e8ecf1",
  };

  return (
    <PageShell toast={toast}>
      <NavBar current="lead-contratti" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          🔗 Lead ↔ Contratti Matcher
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: "6px 0 0" }}>Abbinamento lead a contratti sottoscritti con dashboard analitica</p>
      </div>

      {/* UPLOAD SECTION */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,.06)", border: "1px solid #e8ecf1", marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>📁 Carica File</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { label: "Contratti Nuovo", ref: refNuovo, file: fileNuovo, set: setFileNuovo, color: "#2563eb", icon: "📄" },
            { label: "Contratti Usato", ref: refUsato, file: fileUsato, set: setFileUsato, color: "#f59e0b", icon: "📄" },
            { label: "Lead (obbligatorio)", ref: refLeads, file: fileLeads, set: setFileLeads, color: "#10b981", icon: "📋" },
          ].map((f) => (
            <div key={f.label} style={{ border: "2px dashed " + (f.file ? f.color : "#e2e8f0"), borderRadius: 12, padding: 16, textAlign: "center", cursor: "pointer", transition: "all .15s", background: f.file ? f.color + "08" : "#fafbfc" }}
              onClick={() => f.ref.current?.click()}>
              <input ref={f.ref} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={e => f.set(e.target.files?.[0] || null)} />
              <div style={{ fontSize: 28, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{f.label}</div>
              {f.file ? (
                <div style={{ fontSize: 12, color: f.color, fontWeight: 600 }}>{f.file.name}</div>
              ) : (
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Clicca per caricare (.xlsx)</div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={handleProcess} disabled={processing || !fileLeads}
            style={{ background: "#1e293b", color: "#fff", padding: "10px 24px", borderRadius: 10, fontSize: 14, fontWeight: 700 }}>
            {processing ? "⏳ Elaborazione..." : "🚀 Avvia Matching"}
          </button>
          {processing && (
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ background: "#e2e8f0", borderRadius: 8, height: 8, overflow: "hidden" }}>
                <div style={{ background: "#2563eb", height: "100%", width: progress + "%", transition: "width .3s", borderRadius: 8 }} />
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{progressMsg}</div>
            </div>
          )}
          {error && <div style={{ color: "#ef4444", fontSize: 13, fontWeight: 600 }}>⚠️ {error}</div>}
        </div>

        {stats && (
          <div style={{ marginTop: 14, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ background: "#f0f9ff", color: "#0369a1", padding: "4px 12px", borderRadius: 8, fontWeight: 600 }}>📋 {stats.contratti} contratti</span>
            <span style={{ background: "#fef9c3", color: "#a16207", padding: "4px 12px", borderRadius: 8, fontWeight: 600 }}>📨 {stats.leads} lead</span>
            <span style={{ background: "#dcfce7", color: "#16a34a", padding: "4px 12px", borderRadius: 8, fontWeight: 600 }}>🔗 {stats.matches} contratti abbinati</span>
            {stats.esclusi > 0 && <span style={{ background: "#fef2f2", color: "#dc2626", padding: "4px 12px", borderRadius: 8, fontWeight: 600 }}>🚫 {stats.esclusi} esclusi (blacklist)</span>}
          </div>
        )}
      </div>

      {/* DASHBOARD */}
      {dashData.length > 0 && (
        <>
          {/* Filters */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "16px 20px", boxShadow: "0 2px 8px rgba(0,0,0,.04)", border: "1px solid #e8ecf1", marginBottom: 20, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tipo Contratto</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Nuovo", "Usato"].map(t => (
                  <button key={t} className="btn" onClick={() => toggleFilter(fTipo, t, setFTipo)}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: fTipo.includes(t) ? "#1e293b" : "#f1f5f9", color: fTipo.includes(t) ? "#fff" : "#64748b" }}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Origine</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Lead Casa Madre", "Lead Interno", "Walk In"].map(t => (
                  <button key={t} className="btn" onClick={() => toggleFilter(fOrigine, t, setFOrigine)}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: fOrigine.includes(t) ? (LC_COLORS[t] || "#1e293b") : "#f1f5f9", color: fOrigine.includes(t) ? "#fff" : "#64748b" }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mesi</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setFMesi(fMesi.length === availableMesi.length ? [] : [...availableMesi])}
                  style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: fMesi.length === availableMesi.length ? "#1e293b" : "#f1f5f9", color: fMesi.length === availableMesi.length ? "#fff" : "#64748b" }}>Tutti</button>
                {availableMesi.map(m => (
                  <button key={m} className="btn" onClick={() => toggleFilter(fMesi, m, setFMesi)}
                    style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: fMesi.includes(m) ? "#475569" : "#f1f5f9", color: fMesi.includes(m) ? "#fff" : "#64748b" }}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Export bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className="btn" onClick={handleExport} style={{ background: "#059669", color: "#fff", padding: "7px 16px", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 5, fontWeight: 600 }}>📥 Scarica Excel</button>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
            <div style={kpiCardStyle("#f8fafc", "#64748b")}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1e293b" }}>{totalContratti}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>Contratti Totali</div>
            </div>
            <div style={kpiCardStyle("#eff6ff", "#2563eb")}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb" }}>{totalCM}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>Lead Casa Madre</div>
            </div>
            <div style={kpiCardStyle("#fffbeb", "#f59e0b")}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b" }}>{totalInt}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>Lead Interno</div>
            </div>
            <div style={kpiCardStyle("#ecfdf5", "#10b981")}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#10b981" }}>{totalWI}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981" }}>Walk In</div>
            </div>
            <div style={kpiCardStyle("#faf5ff", "#7c3aed")}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#7c3aed" }}>{matchRate}%</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7c3aed" }}>Match Rate</div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20, marginBottom: 24 }}>
            {/* Chart 1: Riepilogo Origine */}
            <div style={chartCardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Riepilogo per Origine</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chart1}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Contratti" radius={[6, 6, 0, 0]}>
                    {chart1.map((e, i) => (
                      <rect key={i} fill={LC_COLORS[e.name] || "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 2: Brand stacked */}
            <div style={chartCardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Contratti per Brand</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chart2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="brand" tick={{ fontSize: 11 }} height={50} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Lead Casa Madre" stackId="a" fill={LC_COLORS["Lead Casa Madre"]} />
                  <Bar dataKey="Lead Interno" stackId="a" fill={LC_COLORS["Lead Interno"]} />
                  <Bar dataKey="Walk In" stackId="a" fill={LC_COLORS["Walk In"]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 3: Sede */}
            <div style={chartCardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Contratti per Sede</h3>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={chart3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="sede" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="Lead Casa Madre" fill={LC_COLORS["Lead Casa Madre"]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Lead Interno" fill={LC_COLORS["Lead Interno"]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Walk In" fill={LC_COLORS["Walk In"]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 4: Monthly */}
            <div style={chartCardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Andamento Mensile</h3>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={chart4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mese" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip /><Legend />
                  <Line type="monotone" dataKey="Lead Casa Madre" stroke={LC_COLORS["Lead Casa Madre"]} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Lead Interno" stroke={LC_COLORS["Lead Interno"]} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="Walk In" stroke={LC_COLORS["Walk In"]} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Chart 5: Lead Sources (NO Walk In) */}
            <div style={chartCardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Dettaglio Fonti Lead Originali</h3>
              {chart5.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(280, chart5.length * 32)}>
                  <BarChart data={chart5} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="source" type="category" width={150} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Contratti" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: 30, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nessun lead source trovato (esclusi Walk In)</div>
              )}
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}

// ============================
// PAGINA 8 - Budget Planner
// ============================

const BUDGET_TABLE = "budget_records";

function bgParseCSV(text: string): { azione: string; brand: string; costo: number; rimborso: number; note: string }[] {
  const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h: string) => h.trim().toLowerCase());
  const colMap: Record<string, number> = {};
  const mapping: Record<string, string> = { azione: "azione", brand: "brand", "costo previsto": "costo", rimborso: "rimborso", note: "note" };
  headers.forEach((h, i) => {
    Object.entries(mapping).forEach(([key, field]) => {
      if (h.includes(key)) colMap[field] = i;
    });
  });
  const rows: { azione: string; brand: string; costo: number; rimborso: number; note: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c: string) => c.trim().replace(/^"|"$/g, ""));
    const azione = cells[colMap.azione ?? 0] || "";
    if (!azione || azione.toLowerCase() === "totale") continue;
    const parseNum = (s: string) => { if (!s) return 0; const n = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."); return parseFloat(n) || 0; };
    rows.push({
      azione,
      brand: cells[colMap.brand ?? 1] || "",
      costo: parseNum(cells[colMap.costo ?? 2]),
      rimborso: parseNum(cells[colMap.rimborso ?? 3]),
      note: cells[colMap.note ?? 4] || "",
    });
  }
  return rows;
}

interface BudgetRow {
  id: string;
  month_key: string;
  azione: string;
  brand: string;
  costo: number;
  rimborso: number;
  note: string;
}

function BudgetPage({ onNavigate, unlocked, setUnlocked }: { onNavigate: (p: PageType) => void; unlocked: boolean; setUnlocked: (v: boolean) => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const [plans, setPlans] = useState<Record<string, BudgetRow[]>>({});
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importMonth, setImportMonth] = useState(new Date().getMonth() + 1);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline add row
  const [showAddRow, setShowAddRow] = useState<string | null>(null);
  const emptyRow = { azione: "", brand: "", costo: "", rimborso: "", note: "" };
  const [newRow, setNewRow] = useState(emptyRow);

  // Inline edit
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});

  const groupByMonth = (records: BudgetRow[]) => {
    const map: Record<string, BudgetRow[]> = {};
    for (const r of records) {
      if (!map[r.month_key]) map[r.month_key] = [];
      map[r.month_key].push(r);
    }
    return map;
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await supabase.select(BUDGET_TABLE, "order=month_key.desc,id.asc&select=*");
      setPlans(groupByMonth(data));
    } catch (err: unknown) {
      showToast("Errore caricamento: " + (err instanceof Error ? err.message : ""));
    } finally { setLoaded(true); setLoading(false); }
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
        // Delete existing month
        await fetch(supabase.url(`${BUDGET_TABLE}?month_key=eq.${key}`), { method: "DELETE", headers: supabase.headers });
        // Insert new
        await supabase.insert(BUDGET_TABLE, rows.map(r => ({ ...r, month_key: key })));
        await loadData();
        setOpenMonths(prev => ({ ...prev, [key]: true }));
        setShowImport(false);
        if (fileRef.current) fileRef.current.value = "";
        showToast(`Importati ${rows.length} record per ${getMonthLabel(key)}`);
      } catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
      finally { setLoading(false); }
    };
    reader.readAsText(file);
  };

  const handleAddRow = async (key: string) => {
    if (!newRow.azione.trim()) return;
    try {
      setLoading(true);
      await supabase.insert(BUDGET_TABLE, [{ month_key: key, azione: newRow.azione, brand: newRow.brand, costo: parseFloat(newRow.costo) || 0, rimborso: parseFloat(newRow.rimborso) || 0, note: newRow.note }]);
      await loadData();
      setNewRow(emptyRow); setShowAddRow(null);
      showToast("Record aggiunto");
    } catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setLoading(false); }
  };

  const deleteRow = async (id: string) => {
    try { setLoading(true); await supabase.delete(BUDGET_TABLE, id); await loadData(); }
    catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setLoading(false); }
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
      await loadData(); setEditingRow(null);
      showToast("Record modificato");
    } catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setLoading(false); }
  };

  const deleteMonth = async (key: string) => {
    if (!confirm(`Eliminare il piano di ${getMonthLabel(key)}?`)) return;
    try {
      setLoading(true);
      await fetch(supabase.url(`${BUDGET_TABLE}?month_key=eq.${key}`), { method: "DELETE", headers: supabase.headers });
      await loadData();
      showToast(`Piano di ${getMonthLabel(key)} eliminato`);
    } catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setLoading(false); }
  };

  const sortedKeys = Object.keys(plans).sort((a, b) => b.localeCompare(a));

  // Sort
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

  // Convert to marketing state
  const [convertRow, setConvertRow] = useState<BudgetRow | null>(null);
  const [convertForm, setConvertForm] = useState({
    dataInizio: today, dataFine: today, tipologia: TIPOLOGIE[0], soggetto: "", rimborsoPct: "0", costoDichiarato: "",
    dateSingole: [] as string[], piattaforma: "",
  });
  const [convertSaving, setConvertSaving] = useState(false);
  const [convertFiles, setConvertFiles] = useState<File[]>([]);
  const convertFileRef = useRef<HTMLInputElement>(null);

  const openConvert = (row: BudgetRow) => {
    const rimbPct = row.costo > 0 ? Math.round((row.rimborso / row.costo) * 100) : 0;
    const matchedTipo = TIPOLOGIE.find(t => t.toLowerCase() === row.azione.trim().toLowerCase()) || TIPOLOGIE[0];
    // Estrae piattaforma dal campo note per voci Digital Adv
    let piattaforma = "";
    if (matchedTipo === "Digital Adv" && row.note) {
      const noteL = row.note.toLowerCase();
      if (noteL.includes("google")) piattaforma = "Google";
      else if (noteL.includes("meta") || noteL.includes("facebook")) piattaforma = "Meta";
    }
    setConvertRow(row);
    setConvertFiles([]);
    setConvertForm({
      dataInizio: today, dataFine: today, tipologia: matchedTipo,
      soggetto: "", rimborsoPct: String(rimbPct), costoDichiarato: "",
      dateSingole: [], piattaforma,
    });
  };

  const handleConvert = async () => {
    if (!convertRow) return;
    const isStampa = convertForm.tipologia === "Stampa";
    // Validazione Stampa
    if (isStampa && convertForm.dateSingole.length === 0) { showToast("Seleziona almeno una data di uscita"); return; }
    if (!isStampa && (!convertForm.dataInizio || !convertForm.dataFine)) { showToast("Compila le date"); return; }
    try {
      setConvertSaving(true);
      const spesa = convertRow.costo || 0;
      const rimbPct = parseFloat(convertForm.rimborsoPct) || 0;
      const costoDich = convertForm.costoDichiarato !== "" ? (parseFloat(convertForm.costoDichiarato) || spesa) : spesa;
      // Per Stampa: deriva dataInizio/dataFine dalle date singole
      let effDataInizio = convertForm.dataInizio;
      let effDataFine = convertForm.dataFine;
      let dateSingoleStr: string | null = null;
      if (isStampa) {
        const sorted = [...convertForm.dateSingole].sort();
        effDataInizio = sorted[0];
        effDataFine = sorted[sorted.length - 1];
        dateSingoleStr = sorted.join(",");
      }
      // Upload creativita files
      let creativita_url: string | null = null;
      let creativita_nome: string | null = null;
      if (convertFiles.length > 0) {
        const urls: string[] = [];
        const names: string[] = [];
        for (const file of convertFiles) {
          const ext = file.name.split(".").pop();
          const fn = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          await supabase.uploadFile(STORAGE_BUCKET, fn, file);
          urls.push(supabase.getPublicUrl(STORAGE_BUCKET, fn));
          names.push(file.name);
        }
        creativita_url = JSON.stringify(urls);
        creativita_nome = JSON.stringify(names);
      }
      const entry: any = {
        mese_competenza: getMonthKey(effDataInizio),
        data_inizio: effDataInizio,
        data_fine: effDataFine,
        descrizione: convertRow.note || convertRow.azione,
        tipologia: convertForm.tipologia,
        brand: convertRow.brand || BRANDS[0],
        soggetto: convertForm.soggetto.trim(),
        spesa: spesa,
        rimborso_pct: rimbPct,
        costo_dichiarato: costoDich,
        numero_partecipanti: 2,
        piano_extra: false,
        collettiva: false,
        nome_collettiva: "",
        date_singole: dateSingoleStr,
        mappa_url: null,
        poster_3x2: 0, poster_altri: 0, poster_maxi: 0,
        creativita_url: creativita_url, creativita_nome: creativita_nome,
        fattura_url: null, fattura_nome: null,
        da_confermare: true,
        piattaforma: convertForm.tipologia === "Digital Adv" ? (convertForm.piattaforma || "") : "",
      };
      await supabase.insert(TABLE, entry);
      showToast("Azione inserita nei Costi Marketing!");
      setConvertRow(null);
      setConvertFiles([]);
    } catch (err: unknown) { showToast("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setConvertSaving(false); }
  };

  // Grand totals
  const allRows = sortedKeys.flatMap(k => sortedPlans[k] || []);
  const grandCosto = allRows.reduce((s, r) => s + (r.costo || 0), 0);
  const grandRimborso = allRows.reduce((s, r) => s + (r.rimborso || 0), 0);

  return (
    <PageShell toast={toast}>
      <NavBar current="budget" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      {loading && <div style={{ height: 3, background: "#e2e8f0", borderRadius: 2, marginBottom: 8, overflow: "hidden" }}><div style={{ height: "100%", width: "40%", background: "linear-gradient(90deg, #3b82f6, #6366f1)", borderRadius: 2, animation: "loadBar 1s ease infinite" }} /></div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>💰 Budget Planner</h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: "6px 0 0" }}>
            {sortedKeys.length} {sortedKeys.length === 1 ? "mese caricato" : "mesi caricati"}
            {allRows.length > 0 && <span style={{ marginLeft: 12 }}>• Costo totale: <strong style={{ color: "#ea580c" }}>{formatEur(grandCosto)}</strong> • Rimborso totale: <strong style={{ color: "#059669" }}>{formatEur(grandRimborso)}</strong> • Spesa netta: <strong style={{ color: "#7c3aed" }}>{formatEur(grandCosto - grandRimborso)}</strong></span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadData} disabled={loading} style={{ background: "#f1f5f9", color: "#475569", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>🔄</button>
          <button className="btn" onClick={toggleBudgetSort} style={{ background: "#f1f5f9", color: "#475569", padding: "8px 14px", borderRadius: 8, fontSize: 13 }}>
            {budgetSort === "brand" ? "🔤 Per Brand" : "📋 Per Azione"}
          </button>
          <button className="btn" onClick={() => setShowImport(true)} disabled={loading} style={{ background: "#1e293b", color: "#fff", padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>📤 Importa CSV</button>
        </div>
      </div>

      {/* IMPORT MODAL */}
      {showImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowImport(false)}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>📤 Importa Piano Budget</h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>Seleziona mese/anno e carica il CSV. Se esiste un piano per quel mese, verrà sovrascritto.</p>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Mese</label>
                <select value={importMonth} onChange={e => setImportMonth(+e.target.value)} style={inputStyle}>
                  {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Anno</label>
                <select value={importYear} onChange={e => setImportYear(+e.target.value)} style={inputStyle}>
                  {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>File CSV</label>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" style={{ ...inputStyle, padding: 10, marginBottom: 20 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setShowImport(false)} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 16px", borderRadius: 8, fontSize: 13 }}>Annulla</button>
              <button className="btn" onClick={handleImport} disabled={loading} style={{ background: "#1e293b", color: "#fff", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>{loading ? "..." : "Importa"}</button>
            </div>
          </div>
        </div>
      )}

      {/* MONTHS */}
      {!loaded ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Caricamento...</div>
      ) : sortedKeys.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
          <div style={{ fontSize: 48, marginBottom: 10, opacity: .4 }}>📊</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#64748b" }}>Nessun piano caricato</p>
          <p style={{ fontSize: 13 }}>Clicca "Importa CSV" per iniziare</p>
        </div>
      ) : sortedKeys.map(key => {
        const rows = sortedPlans[key] || [];
        const isOpen = openMonths[key];
        const totalCosto = rows.reduce((s, r) => s + (r.costo || 0), 0);
        const totalRimborso = rows.reduce((s, r) => s + (r.rimborso || 0), 0);
        // Brand breakdown
        const brandMap = new Map<string, { costo: number; rimborso: number; count: number }>();
        rows.forEach(r => {
          const b = r.brand || "N/D";
          const cur = brandMap.get(b) || { costo: 0, rimborso: 0, count: 0 };
          cur.costo += r.costo || 0; cur.rimborso += r.rimborso || 0; cur.count++;
          brandMap.set(b, cur);
        });
        const brandBreakdown = Array.from(brandMap.entries()).sort((a, b) => b[1].costo - a[1].costo);
        return (
          <div key={key} style={{ marginBottom: 16, background: "#fff", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", border: "1px solid #e8ecf1" }}>
            {/* Header */}
            <div onClick={() => setOpenMonths(prev => ({ ...prev, [key]: !prev[key] }))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", userSelect: "none", background: isOpen ? "#f8fafc" : "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "#94a3b8", transform: isOpen ? "rotate(90deg)" : "rotate(0)", transition: "transform .2s", display: "inline-block" }}>▶</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: "#1e293b" }}>{getMonthLabel(key)}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 10px", borderRadius: 20 }}>{rows.length} voci</span>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                <span style={{ color: "#64748b" }}>Costo: <strong style={{ color: "#ea580c" }}>{formatEur(totalCosto)}</strong></span>
                <span style={{ color: "#64748b" }}>Rimborso: <strong style={{ color: "#059669" }}>{formatEur(totalRimborso)}</strong></span>
                <span style={{ color: "#64748b" }}>Netta: <strong style={{ color: "#7c3aed" }}>{formatEur(totalCosto - totalRimborso)}</strong></span>
              </div>
            </div>

            {/* Table */}
            {isOpen && (
              <div style={{ borderTop: "1px solid #e8ecf1" }}>
                {/* Brand Overview */}
                <div style={{ padding: "12px 20px", background: "#fafbfc", borderBottom: "1px solid #e8ecf1", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginRight: 4 }}>Per brand:</span>
                  {brandBreakdown.map(([brand, data]) => (
                    <div key={brand} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e8ecf1", borderRadius: 10, padding: "5px 12px", fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: "#1e293b" }}>{brand}</span>
                      <span style={{ color: "#ea580c", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{formatEur(data.costo)}</span>
                      {data.rimborso > 0 && <span style={{ color: "#059669", fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>rimb. {formatEur(data.rimborso)}</span>}
                      <span style={{ color: "#7c3aed", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>netta {formatEur(data.costo - data.rimborso)}</span>
                      <span style={{ color: "#cbd5e1", fontSize: 10 }}>({data.count})</span>
                    </div>
                  ))}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Azione", "Brand", "Costo Previsto", "Rimborso", "Spesa Netta", "Note", ""].map((h, i) => (
                          <th key={i} onClick={() => { if (h === "Azione") setBudgetSort("azione"); else if (h === "Brand") setBudgetSort("brand"); }}
                            style={{ padding: "10px 14px", textAlign: i >= 2 && i <= 4 ? "right" : "left", fontSize: 10, fontWeight: 700, color: (h === "Azione" && budgetSort === "azione") || (h === "Brand" && budgetSort === "brand") ? "#2563eb" : "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #e8ecf1", cursor: h === "Azione" || h === "Brand" ? "pointer" : "default" }}>
                            {h}{h === "Azione" && budgetSort === "azione" ? " ▲" : ""}{h === "Brand" && budgetSort === "brand" ? " ▲" : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={row.id} className="row-hover" style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {editingRow === row.id ? (<>
                            <td style={cellStyle}><input value={editData.azione} onChange={e => setEditData({ ...editData, azione: e.target.value })} style={inputStyle} /></td>
                            <td style={cellStyle}><input value={editData.brand} onChange={e => setEditData({ ...editData, brand: e.target.value })} style={inputStyle} /></td>
                            <td style={cellStyle}><input type="number" value={editData.costo} onChange={e => setEditData({ ...editData, costo: e.target.value })} style={{ ...inputStyle, width: 100, textAlign: "right" }} /></td>
                            <td style={cellStyle}><input type="number" value={editData.rimborso} onChange={e => setEditData({ ...editData, rimborso: e.target.value })} style={{ ...inputStyle, width: 100, textAlign: "right" }} /></td>
                            <td style={{ ...cellStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>{formatEur((parseFloat(editData.costo) || 0) - (parseFloat(editData.rimborso) || 0))}</td>
                            <td style={cellStyle}><input value={editData.note} onChange={e => setEditData({ ...editData, note: e.target.value })} style={inputStyle} /></td>
                            <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                              <button className="btn" onClick={saveEdit} disabled={loading} style={{ background: "#059669", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, marginRight: 4 }}>Salva</button>
                              <button className="btn" onClick={() => setEditingRow(null)} style={{ background: "#f1f5f9", color: "#475569", padding: "4px 10px", borderRadius: 6, fontSize: 11 }}>✕</button>
                            </td>
                          </>) : (<>
                            <td style={{ ...cellStyle, fontWeight: 500, color: "#1e293b" }}>{row.azione}</td>
                            <td style={cellStyle}><span style={{ fontSize: 11, fontWeight: 600, background: "#f1f5f9", padding: "2px 10px", borderRadius: 20, color: "#64748b" }}>{row.brand}</span></td>
                            <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#ea580c", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatEur(row.costo)}</td>
                            <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600, color: "#059669", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatEur(row.rimborso)}</td>
                            <td style={{ ...cellStyle, textAlign: "right", fontWeight: 700, color: "#7c3aed", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{formatEur((row.costo || 0) - (row.rimborso || 0))}</td>
                            <td style={{ ...cellStyle, color: "#94a3b8", fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row.note || "—"}</td>
                            <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>
                              {unlocked && <>
                                <button className="btn" onClick={() => openConvert(row)} title="Inserisci nei Costi Marketing" style={{ background: "#eff6ff", color: "#2563eb", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, marginRight: 4 }}>→ MKT</button>
                                <button className="btn" onClick={() => startEdit(row)} title="Modifica" style={{ background: "none", color: "#94a3b8", padding: 4, fontSize: 13 }}>✏️</button>
                                <button className="btn" onClick={() => deleteRow(row.id)} title="Elimina" style={{ background: "none", color: "#94a3b8", padding: 4, fontSize: 13 }}>🗑</button>
                              </>}
                            </td>
                          </>)}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #e8ecf1" }}>
                        <td colSpan={2} style={{ padding: "10px 14px", fontWeight: 700, fontSize: 12, color: "#64748b", textTransform: "uppercase" }}>Totale</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#ea580c", fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{formatEur(totalCosto)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#059669", fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{formatEur(totalRimborso)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: "#7c3aed", fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>{formatEur(totalCosto - totalRimborso)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Actions */}
                {unlocked && (
                  <>
                    {showAddRow === key ? (
                      <div style={{ padding: 16, borderTop: "1px solid #e8ecf1", background: "#fafbfc" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                          {[
                            { label: "Azione", field: "azione", type: "text", flex: 2 },
                            { label: "Brand", field: "brand", type: "text", flex: 1 },
                            { label: "Costo", field: "costo", type: "number", flex: 1 },
                            { label: "Rimborso", field: "rimborso", type: "number", flex: 1 },
                            { label: "Note", field: "note", type: "text", flex: 2 },
                          ].map(f => (
                            <div key={f.field} style={{ flex: f.flex, minWidth: 80 }}>
                              <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase" }}>{f.label}</label>
                              <input type={f.type} value={(newRow as any)[f.field]} onChange={e => setNewRow({ ...newRow, [f.field]: e.target.value })} placeholder={f.label} style={{ ...inputStyle, padding: "7px 10px" }} onKeyDown={e => e.key === "Enter" && handleAddRow(key)} />
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn" onClick={() => handleAddRow(key)} disabled={loading} style={{ background: "#059669", color: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 12 }}>Aggiungi</button>
                            <button className="btn" onClick={() => { setShowAddRow(null); setNewRow(emptyRow); }} style={{ background: "#f1f5f9", color: "#475569", padding: "7px 12px", borderRadius: 8, fontSize: 12 }}>✕</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: "10px 16px", borderTop: "1px solid #e8ecf1", display: "flex", gap: 8 }}>
                        <button className="btn" onClick={() => { setShowAddRow(key); setNewRow(emptyRow); }} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 12, border: "1px dashed #cbd5e1" }}>➕ Aggiungi record</button>
                        <button className="btn" onClick={() => { setImportMonth(parseInt(key.split("-")[1])); setImportYear(parseInt(key.split("-")[0])); setShowImport(true); }} style={{ background: "#f1f5f9", color: "#475569", padding: "6px 14px", borderRadius: 8, fontSize: 12, border: "1px dashed #cbd5e1" }}>📤 Reimporta CSV</button>
                        <button className="btn" onClick={() => deleteMonth(key)} style={{ background: "#fef2f2", color: "#dc2626", padding: "6px 14px", borderRadius: 8, fontSize: 12, border: "1px dashed #fca5a5", marginLeft: "auto" }}>🗑 Elimina mese</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* CONVERT TO MARKETING MODAL */}
      {convertRow && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setConvertRow(null)}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 500, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>📊 Inserisci nei Costi Marketing</h2>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>Completa i campi mancanti per creare una voce nei costi marketing.</p>

            {/* Pre-filled fields (read-only overview) */}
            <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Azione:</span> <strong>{convertRow.azione}</strong></div>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Brand:</span> <strong>{convertRow.brand}</strong></div>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Spesa:</span> <strong style={{ color: "#ea580c" }}>{formatEur(convertRow.costo)}</strong></div>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Rimborso:</span> <strong style={{ color: "#059669" }}>{formatEur(convertRow.rimborso)}</strong></div>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Spesa netta:</span> <strong style={{ color: "#7c3aed" }}>{formatEur((convertRow.costo || 0) - (convertRow.rimborso || 0))}</strong></div>
              <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Rimborso %:</span> <strong>{convertRow.costo > 0 ? Math.round((convertRow.rimborso / convertRow.costo) * 100) : 0}%</strong></div>
              {convertRow.note && <div><span style={{ color: "#94a3b8", fontSize: 11 }}>Descrizione:</span> <strong>{convertRow.note}</strong></div>}
            </div>

            {/* Editable fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Tipologia <span style={{ color: "#2563eb", fontWeight: 400, textTransform: "none" }}>(da: {convertRow.azione})</span></label>
                <select value={convertForm.tipologia} onChange={e => setConvertForm({ ...convertForm, tipologia: e.target.value, dateSingole: e.target.value === "Stampa" ? convertForm.dateSingole : [], piattaforma: e.target.value !== "Digital Adv" ? "" : convertForm.piattaforma })} style={inputStyle}>
                  {TIPOLOGIE.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Soggetto</label>
                <input type="text" placeholder="Soggetto..." value={convertForm.soggetto} onChange={e => setConvertForm({ ...convertForm, soggetto: e.target.value })} style={inputStyle} />
              </div>
              {convertForm.tipologia === "Digital Adv" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 4, textTransform: "uppercase" }}>Piattaforma</label>
                  <select value={convertForm.piattaforma} onChange={e => setConvertForm({ ...convertForm, piattaforma: e.target.value })} style={{ ...inputStyle, borderColor: "#7c3aed" }}>
                    <option value="">— Non specificata —</option>
                    <option value="Google">Google</option>
                    <option value="Meta">Meta</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
              )}
            </div>

            {/* Date: Stampa → calendario multi-date, altrimenti → date normali */}
            {convertForm.tipologia === "Stampa" ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>📰 Date uscite stampa (clicca i giorni)</label>
                <StampaCalendar selected={convertForm.dateSingole} onChange={dates => setConvertForm({ ...convertForm, dateSingole: dates })} baseMonth={getCurrentMonthKey()} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Data inizio</label>
                  <input type="date" value={convertForm.dataInizio} onChange={e => setConvertForm({ ...convertForm, dataInizio: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Data fine</label>
                  <input type="date" value={convertForm.dataFine} min={convertForm.dataInizio} onChange={e => setConvertForm({ ...convertForm, dataFine: e.target.value })} style={inputStyle} />
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Rimborso %</label>
                <input type="number" min="0" max="100" step="1" placeholder="0" value={convertForm.rimborsoPct} onChange={e => setConvertForm({ ...convertForm, rimborsoPct: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 4, textTransform: "uppercase" }}>Costo dichiarato (€)</label>
                <input type="number" min="0" step="1" placeholder={String(convertRow.costo)} value={convertForm.costoDichiarato} onChange={e => setConvertForm({ ...convertForm, costoDichiarato: e.target.value })} style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }} />
              </div>
            </div>

            {/* Creatività upload */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase" }}>Creatività (opzionale)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#f1f5f9", border: "1px solid #e2e8f0", cursor: "pointer" }}>
                  📎 Aggiungi file<input ref={convertFileRef} type="file" multiple accept="image/*,.pdf,.ai,.psd,.eps,.svg" onChange={e => {
                    const files = e.target.files;
                    if (!files) return;
                    const arr: File[] = [];
                    for (let i = 0; i < files.length; i++) {
                      if (files[i].size > MAX_FILE_SIZE) continue;
                      arr.push(files[i]);
                    }
                    setConvertFiles(prev => [...prev, ...arr]);
                    e.target.value = "";
                  }} style={{ display: "none" }} />
                </label>
                {convertFiles.map((f, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#ecfdf5", color: "#059669", padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 500 }}>
                    ✓ {f.name}<span onClick={() => setConvertFiles(prev => prev.filter((_, idx) => idx !== i))} style={{ cursor: "pointer", opacity: .6, fontSize: 13 }}>✕</span>
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setConvertRow(null)} style={{ background: "#f1f5f9", color: "#475569", padding: "9px 16px", borderRadius: 8, fontSize: 13 }}>Annulla</button>
              <button className="btn" onClick={handleConvert} disabled={convertSaving} style={{ background: "#2563eb", color: "#fff", padding: "9px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>{convertSaving ? "..." : "📊 Inserisci nei Costi Marketing"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes loadBar { 0% { margin-left: -30%; } 100% { margin-left: 100%; } }`}</style>
    </PageShell>
  );
}
