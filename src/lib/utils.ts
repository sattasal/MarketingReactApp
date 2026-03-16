import * as XLSX from "xlsx";
import { STAGE_ID, MEDIA_COLORS, MESI, MESI_SHORT, BRAND_COLORS, OFFLINE_TYPES, META_KNOWN_BRANDS, META_CLEANUP, META_MYUSATO, GOOGLE_MYUSATO, GOOGLE_CLEANUP_CAMPAIGN, IT_MONTHS_MAP, LC_AGENTI_ESCLUSI } from "./constants";
import { Entry, CsvImportRow, LCContratto, LCLead, LCDashRow } from "./types";

export async function verifyPin(pin: string): Promise<boolean> {
  const enc = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === STAGE_ID;
}

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
export function getMediaColor(tip: string) { return MEDIA_COLORS[tip] || "#64748b"; }
export function getMonthKey(dateStr: string) { const d = new Date(dateStr); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
export function getMonthLabel(key: string) { const [y, m] = key.split("-"); return `${MESI[parseInt(m, 10) - 1]} ${y}`; }
export function getMonthLabelShort(key: string) { const [y, m] = key.split("-"); return `${MESI_SHORT[parseInt(m, 10) - 1]} ${y.slice(2)}`; }
export function getCurrentMonthKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
export function formatEur(n: number) { return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n)); }
export function formatDate(dateStr: string) { return new Date(dateStr + "T00:00:00").toLocaleDateString("it-IT"); }
export function formatFileSize(bytes: number) { return bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(1) + " KB"; }
export function daysBetween(d1: string, d2: string) { const a = new Date(d1+"T00:00:00"); const b = new Date(d2+"T00:00:00"); return Math.max(1, Math.round((b.getTime()-a.getTime())/86400000)+1); }
export function getBrandColor(brand: string): string { return BRAND_COLORS[brand] || "#607d8b"; }

export function calcImportoRimborso(e: Entry) {
  return e.costo_dichiarato * e.rimborso_pct / 100;
}
export function calcSpesaNetta(e: Entry) {
  const netta = e.spesa - calcImportoRimborso(e);
  return e.collettiva && e.numero_partecipanti > 0 ? netta / e.numero_partecipanti : netta;
}

export function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const bom = "\uFEFF";
  const csv = bom + [headers.join(";"), ...rows.map(r => r.map(c => `"${(c||"").replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

export function getEmbedUrl(raw: string): string {
  if (raw.includes("/embed")) return raw;
  const midMatch = raw.match(/mid=([^&"]+)/);
  if (midMatch) return `http://googleusercontent.com/maps.google.com/maps?q=loc:0,0&mid=${midMatch[1]}`;
  return raw;
}

export function mapEntryFn(row: any): Entry {
  return {
    id: row.id, meseCompetenza: row.mese_competenza, dataInizio: row.data_inizio, dataFine: row.data_fine,
    descrizione: row.descrizione, tipologia: row.tipologia, brand: row.brand, soggetto: row.soggetto || "",
    spesa: parseFloat(row.spesa) || 0, rimborso_pct: parseFloat(row.rimborso_pct) || 0, costo_dichiarato: parseFloat(row.costo_dichiarato) || 0,
    numero_partecipanti: parseInt(row.numero_partecipanti) || 2,
    creativita_url: row.creativita_url || null, creativita_nome: row.creativita_nome || null,
    piano_extra: !!row.piano_extra, collettiva: !!row.collettiva, nome_collettiva: row.nome_collettiva || "",
    da_confermare: row.da_confermare === undefined ? true : !!row.da_confermare,
    date_singole: row.date_singole || null, mappa_url: row.mappa_url || null,
    poster_3x2: parseInt(row.poster_3x2) || 0, poster_altri: parseInt(row.poster_altri) || 0, poster_maxi: parseInt(row.poster_maxi) || 0,
    fattura_url: row.fattura_url || null, fattura_nome: row.fattura_nome || null,
    piattaforma: row.piattaforma || "",
  };
}

// ============================
// META ADS & GOOGLE ADS PARSERS
// ============================
export function metaExtractBrand(str: string): string | null {
  if (!str?.trim()) return null;
  const n = str.trim();
  const uIdx = n.indexOf("_");
  if (uIdx > 0) { const p = n.slice(0, uIdx).trim(); const b = META_KNOWN_BRANDS.find(b => b.toLowerCase() === p.toLowerCase()); if (b) return b; }
  const sorted = [...META_KNOWN_BRANDS].sort((a, b) => b.length - a.length);
  for (const b of sorted) { if (n.toLowerCase().startsWith(b.toLowerCase())) return b; }
  if (/citro[eë]n/i.test(n)) return "Citroen";
  if (/[sš]koda/i.test(n)) return "Skoda";
  return null;
}
export function metaExtractModel(str: string, brand: string): string {
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
export function metaParseBrandModel(campaign: string, adset: string) {
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
export function parseCSVText(text: string): Record<string, string>[] {
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
export function processMetaCSV(csvText: string): CsvImportRow[] {
  const data = parseCSVText(csvText);
  const items = data
    .filter(r => r["Ad set name"]?.trim())
    .map(r => {
      const spent = parseFloat(r["Amount spent (EUR)"] || "0");
      const campaign = r["Campaign name"] || r["campaign name"] || "";
      const { brand, model } = metaParseBrandModel(campaign, r["Ad set name"]);
      return { adset: r["Ad set name"].trim(), brand, model, spent, start: r["Reporting starts"] || "", end: r["Reporting ends"] || "" };
    })
    .filter(r => r.spent > 0);

  const map: Record<string, { brand: string; models: Set<string>; adsets: string[]; total: number; start: string; end: string }> = {};
  items.forEach(r => {
    if (!map[r.brand]) map[r.brand] = { brand: r.brand, models: new Set(), adsets: [], total: 0, start: r.start, end: r.end };
    map[r.brand].models.add(r.model);
    map[r.brand].adsets.push(r.adset);
    map[r.brand].total += r.spent;
  });

  return Object.values(map).sort((a, b) => b.total - a.total).map(g => ({
    brand: g.brand, soggetto: [...g.models].join(", "), descrizione: g.adsets.join(", "),
    spesa: Math.round(g.total * 100) / 100, dataInizio: g.start, dataFine: g.end,
    selected: true, piattaforma: "Meta",
  }));
}
export function googleParseItNum(str: string): number {
  if (!str || str.trim() === "--" || str.trim() === "") return 0;
  const n = parseFloat(str.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
export function googleBrandFromAccount(account: string): string {
  if (!account) return "Leonori";
  const dash = account.indexOf("-");
  if (dash === -1) return account.trim();
  const raw = account.slice(dash + 1).trim();
  if (GOOGLE_MYUSATO.test(raw)) return "MyUsato";
  return raw;
}
export function googleModelFromCampaign(name: string): string {
  if (!name || name.trim() === "--") return "";
  let cleaned = name.trim().replace(GOOGLE_CLEANUP_CAMPAIGN, " ").replace(/\s{2,}/g, " ").trim();
  cleaned = cleaned.replace(/\s+v\d+$/i, "").trim();
  return cleaned || name.trim();
}
export function googleParseDateRange(rangeStr: string) {
  const match = rangeStr.match(/(\d+)\s+(\w+)\s+(\d{4})/i);
  if (!match) return { startISO: "", endISO: "" };
  const monthIdx = IT_MONTHS_MAP[match[2].toLowerCase()] ?? 0;
  const year = parseInt(match[3]);
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  const mm = String(monthIdx + 1).padStart(2, "0");
  return { startISO: `${year}-${mm}-01`, endISO: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}
export function processGoogleCSV(text: string): CsvImportRow[] {
  const lines = text.split("\n");
  const dateInfo = googleParseDateRange(lines[1] || "");
  const csvData = parseCSVText(lines.slice(2).join("\n"));
  if (!csvData.length) return [];
  const accountCol = "Nome account" in csvData[0] ? "Nome account" : "Account" in csvData[0] ? "Account" : null;

  const items = csvData
    .filter(r => {
      const campaign = (r["Campagna"] || "").trim();
      if (!campaign || campaign === "--" || campaign.toLowerCase().startsWith("totale")) return false;
      const acc = accountCol ? (r[accountCol] || "").trim() : "";
      if (!acc || acc === "--") return false;
      return true;
    })
    .map(r => {
      const account = accountCol ? (r[accountCol] || "").trim() : "";
      const campaign = (r["Campagna"] || "").trim();
      const azione = (r["Azione di conversione"] || "").trim();
      const spent = googleParseItNum((r["Costo"] || "0").trim());
      let brand = GOOGLE_MYUSATO.test(azione) || GOOGLE_MYUSATO.test(account) ? "MyUsato" : googleBrandFromAccount(account);
      return { account, campaign, brand, model: googleModelFromCampaign(campaign), spent };
    })
    .filter(r => r.spent > 0);

  const map: Record<string, { account: string; brand: string; models: Set<string>; campaigns: string[]; total: number }> = {};
  items.forEach(r => {
    const key = r.account || r.brand;
    if (!map[key]) map[key] = { account: r.account, brand: r.brand, models: new Set(), campaigns: [], total: 0 };
    if (r.model) map[key].models.add(r.model);
    map[key].campaigns.push(r.campaign);
    map[key].total += r.spent;
  });

  return Object.values(map).sort((a, b) => b.total - a.total).map(g => ({
    brand: g.brand, soggetto: [...g.models].join(", "), descrizione: g.account + " — " + Array.from(new Set(g.campaigns)).join(", "),
    spesa: Math.round(g.total * 100) / 100, dataInizio: dateInfo.startISO, dataFine: dateInfo.endISO,
    selected: true, piattaforma: "Google",
  }));
}

// ============================
// LEAD <-> CONTRATTI UTILS
// ============================
export function lcIsExcluded(v: string | undefined): boolean { return !v ? false : LC_AGENTI_ESCLUSI.has(v.trim().toUpperCase()); }
export function lcNormMobile(raw: string | null | undefined): string {
  if (!raw || raw === "" || raw === "null" || raw === "undefined") return "N/D";
  let p = String(raw).trim();
  if (p.startsWith("0039")) p = p.substring(4);
  else if (p.startsWith("+39")) p = p.substring(3);
  else if (p.startsWith("039") && p.length > 3) p = p.substring(3);
  p = p.replace(/[^0-9]/g, "");
  if (p === "" || /3{5,}/.test(p) || p.startsWith("06")) return "N/D";
  return p;
}
export function lcNormEmail(raw: string | null | undefined): string { return (!raw || raw === "" || raw === "null") ? "" : String(raw).trim().toLowerCase(); }
export function lcNormName(raw: string | null | undefined): string { return (!raw || raw === "" || raw === "null") ? "" : String(raw).trim().toUpperCase().replace(/\s+/g, " "); }
export function lcParseDate(raw: unknown): string {
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().split("T")[0];
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return s;
}
export function lcMapTipo(c: string): string { return c === "CN01" ? "Nuovo" : c === "CU01" ? "Usato" : c; }
export function lcMapStatus(c: string): string { return c === "X" ? "Annullato" : c === "A" ? "Aperto" : c === "C" ? "Chiuso" : c; }
export function lcGetMobile(cell: unknown, tel: unknown): string {
  const c = cell ? String(cell).trim() : "";
  const t = tel ? String(tel).trim() : "";
  if (c && c !== "NaN" && c !== "nan" && c !== "null") return c;
  return t;
}
export function lcFmtCap(raw: unknown): string { return (!raw || raw === "NaN") ? "" : String(raw).replace(/\.0$/, "").trim().padStart(5, "0"); }
export function lcReadExcel(file: File): Promise<Record<string, unknown>[]> {
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
export function lcParseNuovo(rows: Record<string, unknown>[]): LCContratto[] {
  return rows.map(r => {
    const dc = lcParseDate(r["data_contratto"]);
    const anno = dc ? dc.substring(0, 4) : "";
    const num = String(r["numero_contratto"] ?? "");
    return {
      n_contratto: anno + "-" + num, data_contratto: dc, ragsoc_cliente: String(r["ragsoc_clicontr"] ?? ""),
      brand: String(r["descrizione_marca"] ?? ""), modello: String(r["descrizione_modello"] ?? ""),
      versione: String(r["descrizione_versione"] ?? ""), sede_contratto: String(r["descr_sede"] ?? ""),
      cap_cliente: lcFmtCap(r["cap"]), provincia: String(r["provincia"] ?? ""),
      tipo_contratto: lcMapTipo(String(r["tipo_contratto"] ?? "")), status: lcMapStatus(String(r["status"] ?? "")),
      venditore: String(r["descr_agente"] ?? ""), importo: Number(r["importo"]) || 0,
      mobile_norm: lcNormMobile(lcGetMobile(r["cellulare"], r["telefono"])), email_norm: lcNormEmail(r["email"] as string),
      nome_norm: lcNormName(r["ragsoc_clicontr"] as string),
    };
  });
}
export function lcParseUsato(rows: Record<string, unknown>[]): LCContratto[] {
  return rows.map(r => {
    const dc = lcParseDate(r["data_contratto"]);
    const anno = dc ? dc.substring(0, 4) : "";
    const num = String(r["numero_contratto"] ?? "");
    return {
      n_contratto: anno + "-" + num, data_contratto: dc, ragsoc_cliente: String(r["cliente_contratto"] ?? ""),
      brand: String(r["descr_marca"] ?? ""), modello: String(r["descr_modello"] ?? ""),
      versione: String(r["descr_versione"] ?? ""), sede_contratto: String(r["descr_sede"] ?? ""),
      cap_cliente: lcFmtCap(r["cap"]), provincia: String(r["provincia"] ?? ""),
      tipo_contratto: lcMapTipo(String(r["tipo_contratto"] ?? "")), status: lcMapStatus(String(r["status"] ?? "")),
      venditore: String(r["descr_agente"] ?? ""), importo: Number(r["importo"]) || 0,
      mobile_norm: lcNormMobile(lcGetMobile(r["cellulare"], r["telefono"])), email_norm: lcNormEmail(r["email"] as string),
      nome_norm: lcNormName(r["cliente_contratto"] as string),
    };
  });
}
export function lcParseLeads(rows: Record<string, unknown>[]): LCLead[] {
  return rows.map((r, i) => {
    const fn = String(r["First Name"] ?? "").trim();
    const ln = String(r["Last Name"] ?? "").trim();
    return {
      idx: i, first_name: fn, last_name: ln, created_date: lcParseDate(r["Created Date"]),
      mobile: String(r["Mobile"] ?? ""), email: String(r["Email"] ?? ""),
      lead_source: String(r["Lead Source"] ?? ""), brand: String(r["Brand"] ?? ""),
      mobile_norm: lcNormMobile(r["Mobile"] as string), email_norm: lcNormEmail(r["Email"] as string),
      nome_norm: lcNormName((fn + " " + ln).trim()),
    };
  });
}
export function lcMatch(contratti: LCContratto[], leads: LCLead[]): LCDashRow[] {
  const byMobile = new Map<string, LCLead[]>(); const byEmail = new Map<string, LCLead[]>(); const byNome = new Map<string, LCLead[]>();
  for (const l of leads) {
    if (l.mobile_norm && l.mobile_norm !== "N/D") { if (!byMobile.has(l.mobile_norm)) byMobile.set(l.mobile_norm, []); byMobile.get(l.mobile_norm)!.push(l); }
    if (l.email_norm) { if (!byEmail.has(l.email_norm)) byEmail.set(l.email_norm, []); byEmail.get(l.email_norm)!.push(l); }
    if (l.nome_norm) { if (!byNome.has(l.nome_norm)) byNome.set(l.nome_norm, []); byNome.get(l.nome_norm)!.push(l); }
  }
  const result: LCDashRow[] = [];
  for (const c of contratti) {
    const matchedIds = new Set<number>();
    const matches: { lead: LCLead; type: string }[] = [];
    const filterDate = (arr: LCLead[]) => arr.filter(l => l.created_date && l.created_date < c.data_contratto);
    if (c.mobile_norm && c.mobile_norm !== "N/D") { for (const l of filterDate(byMobile.get(c.mobile_norm) || [])) { if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "mobile" }); } } }
    if (c.email_norm) { for (const l of filterDate(byEmail.get(c.email_norm) || [])) { if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "email" }); } } }
    if (c.nome_norm) { for (const l of filterDate(byNome.get(c.nome_norm) || [])) { if (!matchedIds.has(l.idx)) { matchedIds.add(l.idx); matches.push({ lead: l, type: "nome" }); } } }
    if (matches.length > 0) {
      const attr = 1 / matches.length;
      for (const m of matches) {
        const origSrc = m.lead.lead_source;
        const orig = origSrc === "Casa Madre" ? "Lead Casa Madre" : (!origSrc || origSrc.toLowerCase() === "walk in" ? "Walk In" : "Lead Interno");
        result.push({ ...c, lead_source: origSrc, lead_date: m.lead.created_date, match_type: m.type, attribuzione: attr, origine_contratto: orig, first_name: m.lead.first_name, last_name: m.lead.last_name });
      }
    } else {
      result.push({ ...c, lead_source: "", lead_date: "", match_type: "", attribuzione: 0, origine_contratto: "Walk In", first_name: "", last_name: "" });
    }
  }
  return result;
}

// ============================
// BUDGET PARSERS
// ============================
export function bgParseCSV(text: string): { azione: string; brand: string; costo: number; rimborso: number; note: string }[] {
  const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h: string) => h.trim().toLowerCase());
  const colMap: Record<string, number> = {};
  const mapping: Record<string, string> = { azione: "azione", brand: "brand", "costo previsto": "costo", rimborso: "rimborso", note: "note" };
  headers.forEach((h, i) => { Object.entries(mapping).forEach(([key, field]) => { if (h.includes(key)) colMap[field] = i; }); });
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c: string) => c.trim().replace(/^"|"$/g, ""));
    const azione = cells[colMap.azione ?? 0] || "";
    if (!azione || azione.toLowerCase() === "totale") continue;
    const parseNum = (s: string) => { if (!s) return 0; const n = s.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."); return parseFloat(n) || 0; };
    rows.push({ azione, brand: cells[colMap.brand ?? 1] || "", costo: parseNum(cells[colMap.costo ?? 2]), rimborso: parseNum(cells[colMap.rimborso ?? 3]), note: cells[colMap.note ?? 4] || "" });
  }
  return rows;
}

export function downloadPianoCollettiva(groupName: string, groupEntries: Entry[]) {
  const totSpesa = groupEntries.reduce((s, e) => s + e.spesa, 0);
  const totNetta = groupEntries.reduce((s, e) => s + calcSpesaNetta(e), 0);
  const oohEntries = groupEntries.filter(e => e.tipologia === "OOH" && e.mappa_url);
  const allMonths = Array.from(new Set(groupEntries.map(e => e.meseCompetenza))).sort();

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

  const mapsHtml = oohEntries.map(e => {
    const url = getEmbedUrl(e.mappa_url!);
    return `<div style="margin:16px 0"><h3 style="font-size:14px">📍 ${e.descrizione} — ${e.brand}</h3><p style="font-size:12px;color:#64748b">${formatDate(e.dataInizio)} → ${formatDate(e.dataFine)} · Poster: ${e.poster_3x2 + e.poster_altri + e.poster_maxi}</p><iframe src="${url}" width="100%" height="400" style="border:0;border-radius:8px" allowfullscreen loading="lazy"></iframe></div>`;
  }).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Piano Collettiva — ${groupName}</title><style>body{font-family:'DM Sans',sans-serif;max-width:1100px;margin:0 auto;padding:24px;color:#1e293b}table{border-collapse:collapse}th,td{border-bottom:1px solid #e8ecf1}h1{font-size:22px}h2{font-size:18px;margin-top:28px;border-bottom:2px solid #e8ecf1;padding-bottom:6px}.sum{display:inline-block;background:#f1f5f9;padding:6px 14px;border-radius:8px;margin:4px 6px 4px 0;font-size:13px;font-weight:600}</style></head><body>
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