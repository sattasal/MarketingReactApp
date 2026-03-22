import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

// ── Variabili d'ambiente Meta + Supabase ──────────────────────────────────────
const META_TOKEN   = process.env.META_ACCESS_TOKEN   ?? "";
const META_ACCOUNT = process.env.META_AD_ACCOUNT_ID  ?? "";
const SB_URL       = process.env.SUPABASE_URL        ?? "";
const SB_KEY       = process.env.SUPABASE_SERVICE_KEY ?? "";

// ── Variabili d'ambiente Google Ads ──────────────────────────────────────────
const G_DEVELOPER_TOKEN = process.env.GOOGLE_DEVELOPER_TOKEN ?? "";
const G_CLIENT_ID       = process.env.GOOGLE_CLIENT_ID       ?? "";
const G_CLIENT_SECRET   = process.env.GOOGLE_CLIENT_SECRET   ?? "";
const G_REFRESH_TOKEN   = process.env.GOOGLE_REFRESH_TOKEN   ?? "";
const G_MCC_ID          = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/-/g, "");

// ── Variabili d'ambiente Search Console + GA4 ────────────────────────────────
const GSC_SITE_URL    = process.env.GSC_SITE_URL    ?? "";
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID ?? "";
const GOOGLE_API_KEY  = process.env.GOOGLE_API_KEY  ?? "";

// ── Variabili d'ambiente Salesforce ──────────────────────────────────────────
const SF_CLIENT_ID     = process.env.SF_CLIENT_ID     ?? "";
const SF_CLIENT_SECRET = process.env.SF_CLIENT_SECRET ?? "";
const SF_USERNAME      = process.env.SF_USERNAME      ?? "";
const SF_PASSWORD      = process.env.SF_PASSWORD      ?? "";
const SF_SECURITY_TOKEN = process.env.SF_SECURITY_TOKEN ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS GOOGLE
// ─────────────────────────────────────────────────────────────────────────────

// Ottieni Access Token Google (riutilizzato da Ads, Search Console e GA4)
async function getGoogleAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     G_CLIENT_ID,
      client_secret: G_CLIENT_SECRET,
      refresh_token: G_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const json = await res.json() as any;
  if (json.error) throw new Error(`Google OAuth error: ${json.error_description ?? json.error}`);
  return json.access_token;
}

// Lista tutti i sotto-account dell'MCC Google Ads
async function getGoogleChildAccounts(accessToken: string): Promise<string[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/v20/customers/${G_MCC_ID}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Authorization":     `Bearer ${accessToken}`,
        "developer-token":   G_DEVELOPER_TOKEN,
        "login-customer-id": G_MCC_ID,
        "Content-Type":      "application/json",
      },
      body: JSON.stringify({
        query: "SELECT customer_client.client_customer, customer_client.descriptive_name, customer_client.manager, customer_client.level FROM customer_client WHERE customer_client.level = 1 AND customer_client.manager = false"
      }),
    }
  );
  const text = await res.text();
  console.log("[google/list] status:", res.status, "accounts:", text.slice(0, 200));
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`Google list error ${res.status}: ${text.slice(0, 200)}`); }
  if (json.error) throw new Error(`Google Ads error: ${JSON.stringify(json.error)}`);
  return (json.results ?? []).map((r: any) => r.customerClient.clientCustomer.replace("customers/", ""));
}

// Esegui query GAQL su un singolo account Google Ads
async function queryGoogleAccount(
  accessToken: string,
  customerId: string,
  from: string,
  to: string
): Promise<any[]> {
  const query = `
    SELECT
      customer.descriptive_name,
      campaign.name,
      metrics.cost_micros
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND metrics.cost_micros > 0
      AND campaign.status != 'REMOVED'
  `;
  const res = await fetch(
    `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        "Authorization":      `Bearer ${accessToken}`,
        "developer-token":    G_DEVELOPER_TOKEN,
        "login-customer-id":  G_MCC_ID,
        "Content-Type":       "application/json",
      },
      body: JSON.stringify({ query: query.trim() }),
    }
  );
  const json = await res.json() as any;
  if (json.error || !json.results) return [];
  return json.results.map((r: any) => ({
    account_name:   r.customer?.descriptiveName ?? customerId,
    campaign_name:  r.campaign?.name ?? "",
    cost:           (r.metrics?.costMicros ?? 0) / 1_000_000,
    customer_id:    customerId,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

async function sbInsertMany(table: string, rows: object[]) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error: ${res.status} ${text}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS SALESFORCE
// ─────────────────────────────────────────────────────────────────────────────

// Cache token Salesforce in memoria (dura ~2 ore)
let _sfToken: { accessToken: string; instanceUrl: string; expiresAt: number } | null = null;

async function getSalesforceToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  // Restituisce il token in cache se ancora valido (con 5 min di margine)
  if (_sfToken && Date.now() < _sfToken.expiresAt - 5 * 60 * 1000) {
    return _sfToken;
  }

  const passwordWithToken = SF_PASSWORD + SF_SECURITY_TOKEN;
  const params = new URLSearchParams({
    grant_type:    "password",
    client_id:     SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    username:      SF_USERNAME,
    password:      passwordWithToken,
  });

  const res = await fetch("https://login.salesforce.com/services/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const json = await res.json() as any;
  if (json.error) throw new Error(`Salesforce auth error: ${json.error}: ${json.error_description}`);

  _sfToken = {
    accessToken: json.access_token,
    instanceUrl: json.instance_url,
    expiresAt:   Date.now() + 2 * 60 * 60 * 1000,
  };
  return _sfToken;
}

async function sfQuery(soql: string): Promise<any> {
  const { accessToken, instanceUrl } = await getSalesforceToken();
  const url = `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json() as any;
  if (json.errorCode) throw new Error(`Salesforce query error: ${json.message}`);
  return json;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS UTILS
// ─────────────────────────────────────────────────────────────────────────────

// Data N giorni fa in formato YYYY-MM-DD
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

// Risolve date relative tipo "28daysAgo", "today", "yesterday"
function resolveDate(d: string): string {
  if (d === "today")     return new Date().toISOString().split("T")[0];
  if (d === "yesterday") return daysAgo(1);
  const m = d.match(/^(\d+)daysAgo$/);
  if (m) return daysAgo(parseInt(m[1]));
  return d; // già in formato YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER ROUTES
// ─────────────────────────────────────────────────────────────────────────────

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── list messages ─────────────────────────────────────────────────────────
  app.get(api.messages.list.path, async (req, res) => {
    const messages = await storage.getMessages();
    res.json(messages);
  });

  // ── create message ────────────────────────────────────────────────────────
  app.post(api.messages.create.path, async (req, res) => {
    try {
      const input = api.messages.create.input.parse(req.body);
      const message = await storage.createMessage(input);
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join(".") });
      } else {
        throw err;
      }
    }
  });

  // ── POST /api/verify-pin ──────────────────────────────────────────────────
  // Verifica il PIN lato server leggendolo dal Secret APP_PIN di Replit
  app.post("/api/verify-pin", (req, res) => {
    const { pin } = req.body as { pin?: string };
    if (!pin) return res.status(400).json({ ok: false });
    const correct = process.env.APP_PIN ?? "";
    res.json({ ok: pin === correct });
  });

  // ── GET /api/meta/insights ────────────────────────────────────────────────
  app.get("/api/meta/insights", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      if (!from || !to) return res.status(400).json({ error: "Parametri 'from' e 'to' obbligatori (YYYY-MM-DD)" });
      if (!META_TOKEN || !META_ACCOUNT) return res.status(500).json({ error: "META_ACCESS_TOKEN o META_ACCOUNT_ID non configurati" });

      const fields = "campaign_name,adset_name,spend,impressions,date_start,date_stop";
      const url = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT}/insights`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
      url.searchParams.set("level", "adset");
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", META_TOKEN);

      const metaRes = await fetch(url.toString());
      const metaJson = await metaRes.json() as any;
      if (metaJson.error) return res.status(400).json({ error: metaJson.error.message });

      const data: object[] = metaJson.data ?? [];
      let next = metaJson.paging?.next;
      while (next) {
        const pageRes  = await fetch(next);
        const pageJson = await pageRes.json() as any;
        data.push(...(pageJson.data ?? []));
        next = pageJson.paging?.next;
      }

      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error("[meta/insights]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/meta/save ───────────────────────────────────────────────────
  app.post("/api/meta/save", async (req, res) => {
    try {
      const { rows } = req.body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "Nessuna riga da salvare" });
      if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY non configurati" });

      const toInsert = rows.map(r => ({
        periodo_inizio: r.date_start,
        periodo_fine:   r.date_stop,
        campaign_name:  r.campaign_name ?? "",
        adset_name:     r.adset_name    ?? "",
        spend:          parseFloat(r.spend) || 0,
        impressions:    parseInt(r.impressions) || 0,
        account_id:     META_ACCOUNT,
        processato:     false,
      }));

      await sbInsertMany("meta_spese_raw", toInsert);
      res.json({ saved: toInsert.length });
    } catch (err: any) {
      console.error("[meta/save]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/google/insights ──────────────────────────────────────────────
  app.get("/api/google/insights", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      if (!from || !to) return res.status(400).json({ error: "Parametri 'from' e 'to' obbligatori (YYYY-MM-DD)" });
      if (!G_DEVELOPER_TOKEN || !G_CLIENT_ID || !G_CLIENT_SECRET || !G_REFRESH_TOKEN || !G_MCC_ID) {
        return res.status(500).json({ error: "Credenziali Google Ads non configurate nei Secrets" });
      }

      const accessToken = await getGoogleAccessToken();
      const customerIds = await getGoogleChildAccounts(accessToken);

      const allRows: any[] = [];
      const chunkSize = 10;
      for (let i = 0; i < customerIds.length; i += chunkSize) {
        const chunk = customerIds.slice(i, i + chunkSize);
        const results = await Promise.all(chunk.map(id => queryGoogleAccount(accessToken, id, from, to)));
        results.forEach(rows => allRows.push(...rows));
      }

      const accountMap: Record<string, { account_name: string; campaigns: string[]; total: number; customer_id: string }> = {};
      for (const row of allRows) {
        const key = row.customer_id;
        if (!accountMap[key]) accountMap[key] = { account_name: row.account_name, campaigns: [], total: 0, customer_id: row.customer_id };
        accountMap[key].campaigns.push(row.campaign_name);
        accountMap[key].total += row.cost;
      }

      const data = Object.values(accountMap)
        .filter(a => a.total > 0)
        .sort((a, b) => b.total - a.total)
        .map(a => ({
          account_name: a.account_name,
          customer_id:  a.customer_id,
          campaigns:    [...new Set(a.campaigns)].join(", "),
          cost:         Math.round(a.total * 100) / 100,
          date_start:   from,
          date_stop:    to,
        }));

      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error("[google/insights]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/google/save ─────────────────────────────────────────────────
  app.post("/api/google/save", async (req, res) => {
    try {
      const { rows } = req.body as { rows: any[] };
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "Nessuna riga da salvare" });
      if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY non configurati" });

      const toInsert = rows.map(r => ({
        periodo_inizio: r.date_start,
        periodo_fine:   r.date_stop,
        campaign_name:  r.campaigns  ?? "",
        adset_name:     r.account_name ?? "",
        spend:          parseFloat(r.cost) || 0,
        impressions:    0,
        account_id:     r.customer_id ?? G_MCC_ID,
        processato:     false,
      }));

      await sbInsertMany("meta_spese_raw", toInsert);
      res.json({ saved: toInsert.length });
    } catch (err: any) {
      console.error("[google/save]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH CONSOLE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/search-console/overview ─────────────────────────────────────
  // Trend giornaliero click e impressioni
  // ?startDate=28daysAgo  &endDate=today
  app.get("/api/search-console/overview", async (req, res) => {
    try {
      const startDate = resolveDate((req.query.startDate as string) || "28daysAgo");
      const endDate   = resolveDate((req.query.endDate   as string) || "today");

      const accessToken = await getGoogleAccessToken();
      const gscRes = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 90 }),
        }
      );
      const json = await gscRes.json() as any;
      if (json.error) throw new Error(json.error.message);

      const rows = (json.rows ?? []) as any[];
      const totals = rows.reduce((acc: any, r: any) => ({
        clicks:      acc.clicks      + r.clicks,
        impressions: acc.impressions + r.impressions,
        ctr:         acc.ctr         + r.ctr,
        position:    acc.position    + r.position,
      }), { clicks: 0, impressions: 0, ctr: 0, position: 0 });

      if (rows.length > 0) {
        totals.avgCtr      = totals.ctr      / rows.length;
        totals.avgPosition = totals.position / rows.length;
      }

      res.json({
        success: true,
        period:  { startDate, endDate },
        totals,
        daily: rows.map((r: any) => ({
          date:        r.keys[0],
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         +((r.ctr * 100).toFixed(2)),
          position:    +(r.position.toFixed(1)),
        })),
      });
    } catch (err: any) {
      console.error("[gsc/overview]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/search-console/performance ──────────────────────────────────
  // Top pagine per click
  app.get("/api/search-console/performance", async (req, res) => {
    try {
      const startDate = resolveDate((req.query.startDate as string) || "28daysAgo");
      const endDate   = resolveDate((req.query.endDate   as string) || "today");
      const rowLimit  = parseInt((req.query.rowLimit as string) || "25");

      const accessToken = await getGoogleAccessToken();
      const gscRes = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit }),
        }
      );
      const json = await gscRes.json() as any;
      if (json.error) throw new Error(json.error.message);

      res.json({
        success: true,
        period:  { startDate, endDate },
        data: (json.rows ?? []).map((r: any) => ({
          page:        r.keys[0],
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         +((r.ctr * 100).toFixed(2)),
          position:    +(r.position.toFixed(1)),
        })),
      });
    } catch (err: any) {
      console.error("[gsc/performance]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/search-console/queries ──────────────────────────────────────
  // Top query di ricerca
  app.get("/api/search-console/queries", async (req, res) => {
    try {
      const startDate = resolveDate((req.query.startDate as string) || "28daysAgo");
      const endDate   = resolveDate((req.query.endDate   as string) || "today");
      const rowLimit  = parseInt((req.query.rowLimit as string) || "20");

      const accessToken = await getGoogleAccessToken();
      const gscRes = await fetch(
        `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit }),
        }
      );
      const json = await gscRes.json() as any;
      if (json.error) throw new Error(json.error.message);

      res.json({
        success: true,
        period:  { startDate, endDate },
        data: (json.rows ?? []).map((r: any) => ({
          query:       r.keys[0],
          clicks:      r.clicks,
          impressions: r.impressions,
          ctr:         +((r.ctr * 100).toFixed(2)),
          position:    +(r.position.toFixed(1)),
        })),
      });
    } catch (err: any) {
      console.error("[gsc/queries]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/search-console/cwv ───────────────────────────────────────────
  // Core Web Vitals via PageSpeed Insights
  // ?url=https://... &strategy=mobile|desktop
  app.get("/api/search-console/cwv", async (req, res) => {
    try {
      const url      = (req.query.url      as string) || GSC_SITE_URL;
      const strategy = (req.query.strategy as string) || "mobile";

      const psiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      psiUrl.searchParams.set("url", url);
      psiUrl.searchParams.set("strategy", strategy);
      psiUrl.searchParams.set("category", "PERFORMANCE");
      if (GOOGLE_API_KEY) psiUrl.searchParams.set("key", GOOGLE_API_KEY);

      const psiRes = await fetch(psiUrl.toString());
      const json   = await psiRes.json() as any;

      const audits     = json.lighthouseResult?.audits     ?? {};
      const categories = json.lighthouseResult?.categories?.performance ?? {};

      res.json({
        success: true,
        data: {
          score:    Math.round((categories.score ?? 0) * 100),
          strategy, url,
          lcp: { value: audits["largest-contentful-paint"]?.numericValue, displayValue: audits["largest-contentful-paint"]?.displayValue, score: audits["largest-contentful-paint"]?.score },
          fid: { value: audits["max-potential-fid"]?.numericValue,         displayValue: audits["max-potential-fid"]?.displayValue,         score: audits["max-potential-fid"]?.score },
          cls: { value: audits["cumulative-layout-shift"]?.numericValue,   displayValue: audits["cumulative-layout-shift"]?.displayValue,   score: audits["cumulative-layout-shift"]?.score },
          fcp: { value: audits["first-contentful-paint"]?.numericValue,    displayValue: audits["first-contentful-paint"]?.displayValue,    score: audits["first-contentful-paint"]?.score },
          tbt: { value: audits["total-blocking-time"]?.numericValue,       displayValue: audits["total-blocking-time"]?.displayValue,       score: audits["total-blocking-time"]?.score },
          fieldData: json.loadingExperience?.metrics ?? null,
        },
      });
    } catch (err: any) {
      console.error("[gsc/cwv]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/search-console/weekly ───────────────────────────────────────
  // Dati settimanali: click organici totali + click brand (query con 'leonori')
  // ?weeks=12  &brandKeyword=leonori
  app.get("/api/search-console/weekly", async (req, res) => {
    try {
      const weeks        = parseInt((req.query.weeks        as string) || "12");
      const brandKeyword = (req.query.brandKeyword as string) || "leonori";

      const endDate   = resolveDate("today");
      const startDate = daysAgo(weeks * 7 + 7); // settimana extra per sicurezza

      const accessToken = await getGoogleAccessToken();
      const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
      const gscUrl  = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE_URL)}/searchAnalytics/query`;

      // Due chiamate in parallelo: totale per data + brand per data
      const [totalRes, brandRes] = await Promise.all([
        fetch(gscUrl, {
          method: "POST", headers,
          body: JSON.stringify({ startDate, endDate, dimensions: ["date"], rowLimit: 500 }),
        }),
        fetch(gscUrl, {
          method: "POST", headers,
          body: JSON.stringify({
            startDate, endDate,
            dimensions: ["date"],
            dimensionFilterGroups: [{
              filters: [{ dimension: "query", operator: "contains", expression: brandKeyword }]
            }],
            rowLimit: 500,
          }),
        }),
      ]);

      const totalJson = await totalRes.json() as any;
      const brandJson = await brandRes.json() as any;
      if (totalJson.error) throw new Error(totalJson.error.message);

      // Mappa giornaliera
      const totalByDate: Record<string, number> = {};
      const brandByDate: Record<string, number> = {};
      (totalJson.rows || []).forEach((r: any) => { totalByDate[r.keys[0]] = r.clicks; });
      (brandJson.rows  || []).forEach((r: any) => { brandByDate[r.keys[0]] = r.clicks; });

      // Raggruppa per settimana (lunedì come inizio)
      function getWeekKey(dateStr: string): string {
        const d = new Date(dateStr + "T00:00:00");
        const day = d.getDay(); // 0=domenica
        const diff = day === 0 ? -6 : 1 - day; // porta a lunedì
        const monday = new Date(d);
        monday.setDate(d.getDate() + diff);
        return monday.toISOString().split("T")[0]; // es. "2024-01-08"
      }

      const weekMap: Record<string, { organic: number; brand: number }> = {};
      Object.entries(totalByDate).forEach(([date, clicks]) => {
        const wk = getWeekKey(date);
        if (!weekMap[wk]) weekMap[wk] = { organic: 0, brand: 0 };
        weekMap[wk].organic += clicks;
        weekMap[wk].brand   += brandByDate[date] || 0;
      });

      // Ordina e prende le ultime N settimane
      const weekly = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-weeks)
        .map(([weekStart, data]) => ({
          weekStart,
          organicClicks: data.organic,
          brandClicks:   data.brand,
        }));

      res.json({ success: true, data: weekly });
    } catch (err: any) {
      console.error("[gsc/weekly]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE ANALYTICS 4
  // ═══════════════════════════════════════════════════════════════════════════

  // Helper interno: chiama GA4 Data API
  async function ga4Report(body: object): Promise<any> {
    const accessToken = await getGoogleAccessToken();
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const json = await res.json() as any;
    if (json.error) throw new Error(json.error.message);
    return json;
  }

  // Converte risposta GA4 in array di oggetti leggibili
  function parseGA4(response: any): any[] {
    if (!response?.rows?.length) return [];
    const dimH = (response.dimensionHeaders ?? []).map((h: any) => h.name);
    const metH = (response.metricHeaders   ?? []).map((h: any) => h.name);
    return response.rows.map((row: any) => {
      const obj: any = {};
      (row.dimensionValues ?? []).forEach((v: any, i: number) => { obj[dimH[i]] = v.value; });
      (row.metricValues    ?? []).forEach((v: any, i: number) => { obj[metH[i]] = v.value; });
      return obj;
    });
  }

  // ── GET /api/analytics/overview ───────────────────────────────────────────
  // Trend giornaliero sessioni, utenti, engagement
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const startDate = (req.query.startDate as string) || "28daysAgo";
      const endDate   = (req.query.endDate   as string) || "today";

      const data = await ga4Report({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics:    [
          { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" },
          { name: "engagementRate" }, { name: "averageSessionDuration" }, { name: "bounceRate" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      });

      const rows = parseGA4(data);
      const totals = rows.reduce((acc: any, r: any) => ({
        sessions:  acc.sessions  + parseInt(r.sessions  || 0),
        totalUsers: acc.totalUsers + parseInt(r.totalUsers || 0),
        newUsers:  acc.newUsers  + parseInt(r.newUsers  || 0),
        sumEng:    acc.sumEng    + parseFloat(r.engagementRate || 0),
        sumDur:    acc.sumDur    + parseFloat(r.averageSessionDuration || 0),
      }), { sessions: 0, totalUsers: 0, newUsers: 0, sumEng: 0, sumDur: 0 });

      const n = rows.length || 1;
      totals.avgEngagementRate  = +((totals.sumEng / n) * 100).toFixed(1);
      totals.avgSessionDuration = +(totals.sumDur / n).toFixed(0);
      delete totals.sumEng; delete totals.sumDur;

      res.json({
        success: true,
        period:  { startDate, endDate },
        totals,
        daily: rows.map((r: any) => ({
          date:               r.date,
          sessions:           parseInt(r.sessions),
          totalUsers:         parseInt(r.totalUsers),
          newUsers:           parseInt(r.newUsers),
          engagementRate:     +((parseFloat(r.engagementRate) * 100).toFixed(1)),
          avgSessionDuration: +parseFloat(r.averageSessionDuration).toFixed(0),
          bounceRate:         +((parseFloat(r.bounceRate) * 100).toFixed(1)),
        })),
      });
    } catch (err: any) {
      console.error("[ga4/overview]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/analytics/channels ───────────────────────────────────────────
  // Traffico per canale
  app.get("/api/analytics/channels", async (req, res) => {
    try {
      const startDate = (req.query.startDate as string) || "28daysAgo";
      const endDate   = (req.query.endDate   as string) || "today";

      const data = await ga4Report({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "engagementRate" }, { name: "conversions" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
      });

      res.json({
        success: true,
        period:  { startDate, endDate },
        data: parseGA4(data).map((r: any) => ({
          channel:        r.sessionDefaultChannelGroup,
          sessions:       parseInt(r.sessions),
          users:          parseInt(r.totalUsers),
          newUsers:       parseInt(r.newUsers),
          engagementRate: +((parseFloat(r.engagementRate) * 100).toFixed(1)),
          conversions:    parseInt(r.conversions),
        })),
      });
    } catch (err: any) {
      console.error("[ga4/channels]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/analytics/pages ──────────────────────────────────────────────
  // Top pagine per sessioni
  app.get("/api/analytics/pages", async (req, res) => {
    try {
      const startDate = (req.query.startDate as string) || "28daysAgo";
      const endDate   = (req.query.endDate   as string) || "today";
      const limit     = parseInt((req.query.limit as string) || "25");

      const data = await ga4Report({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics:    [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagementRate" }, { name: "averageSessionDuration" }, { name: "screenPageViews" }],
        orderBys:   [{ metric: { metricName: "sessions" }, desc: true }],
        limit,
      });

      res.json({
        success: true,
        period:  { startDate, endDate },
        data: parseGA4(data).map((r: any) => ({
          path:           r.pagePath,
          title:          r.pageTitle,
          sessions:       parseInt(r.sessions),
          users:          parseInt(r.totalUsers),
          pageViews:      parseInt(r.screenPageViews),
          engagementRate: +((parseFloat(r.engagementRate) * 100).toFixed(1)),
          avgDuration:    +parseFloat(r.averageSessionDuration).toFixed(0),
        })),
      });
    } catch (err: any) {
      console.error("[ga4/pages]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/analytics/conversions ────────────────────────────────────────
  // Conversioni per evento
  app.get("/api/analytics/conversions", async (req, res) => {
    try {
      const startDate = (req.query.startDate as string) || "28daysAgo";
      const endDate   = (req.query.endDate   as string) || "today";

      const data = await ga4Report({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "eventName" }],
        metrics:    [{ name: "conversions" }, { name: "totalUsers" }, { name: "sessions" }],
        orderBys:   [{ metric: { metricName: "conversions" }, desc: true }],
      });

      res.json({
        success: true,
        period:  { startDate, endDate },
        data: parseGA4(data).map((r: any) => ({
          event:       r.eventName,
          conversions: parseInt(r.conversions),
          users:       parseInt(r.totalUsers),
          sessions:    parseInt(r.sessions),
        })),
      });
    } catch (err: any) {
      console.error("[ga4/conversions]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/analytics/summary ────────────────────────────────────────────
  // KPI con confronto periodo precedente (dinamico — segue il selettore)
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      const startDate = (req.query.startDate as string) || "28daysAgo";
      const endDate   = (req.query.endDate   as string) || "today";

      // Calcola il periodo precedente della stessa durata
      const start = new Date(resolveDate(startDate));
      const end   = new Date(resolveDate(endDate));
      const days  = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const prevEnd   = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const data = await ga4Report({
        dateRanges: [
          { startDate: resolveDate(startDate), endDate: resolveDate(endDate), name: "current"  },
          { startDate: fmt(prevStart),          endDate: fmt(prevEnd),         name: "previous" },
        ],
        metrics: [
          { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" },
          { name: "conversions" }, { name: "engagementRate" },
        ],
      });

      const rows = data.rows ?? [];
      const get = (row: any) => ({
        sessions:       parseInt(row.metricValues[0]?.value || 0),
        users:          parseInt(row.metricValues[1]?.value || 0),
        newUsers:       parseInt(row.metricValues[2]?.value || 0),
        conversions:    parseInt(row.metricValues[3]?.value || 0),
        engagementRate: +((parseFloat(row.metricValues[4]?.value || 0) * 100).toFixed(1)),
      });
      const chg = (c: number, p: number) => p === 0 ? null : +((c - p) / p * 100).toFixed(1);

      const current  = rows[0] ? get(rows[0]) : {};
      const previous = rows[1] ? get(rows[1]) : {};

      res.json({
        success: true, current, previous,
        changes: {
          sessions:       chg((current as any).sessions,       (previous as any).sessions),
          users:          chg((current as any).users,          (previous as any).users),
          newUsers:       chg((current as any).newUsers,       (previous as any).newUsers),
          conversions:    chg((current as any).conversions,    (previous as any).conversions),
          engagementRate: chg((current as any).engagementRate, (previous as any).engagementRate),
        },
      });
    } catch (err: any) {
      console.error("[ga4/summary]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALESFORCE
  // ═══════════════════════════════════════════════════════════════════════════

  // ── GET /api/salesforce/summary ───────────────────────────────────────────
  // KPI compatti per dashboard
  app.get("/api/salesforce/summary", async (req, res) => {
    try {
      const [leadsMonth, leadsTotal, oppsData, wonData] = await Promise.all([
        sfQuery("SELECT COUNT(Id) cnt FROM Lead WHERE CreatedDate = THIS_MONTH"),
        sfQuery("SELECT COUNT(Id) cnt FROM Lead"),
        sfQuery("SELECT COUNT(Id) cnt, SUM(Amount) total FROM Opportunity WHERE IsClosed = false"),
        sfQuery("SELECT COUNT(Id) cnt, SUM(Amount) total FROM Opportunity WHERE IsWon = true AND CloseDate = THIS_MONTH"),
      ]);
      res.json({
        success: true,
        data: {
          leadsThisMonth:    leadsMonth.records[0]?.cnt   || 0,
          leadsTotal:        leadsTotal.records[0]?.cnt   || 0,
          openOpportunities: oppsData.records[0]?.cnt     || 0,
          pipelineValue:     oppsData.records[0]?.total   || 0,
          wonThisMonth:      wonData.records[0]?.cnt      || 0,
          wonValueThisMonth: wonData.records[0]?.total    || 0,
        },
      });
    } catch (err: any) {
      console.error("[sf/summary]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/leads ─────────────────────────────────────────────
  app.get("/api/salesforce/leads", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50");
      const data  = await sfQuery(`SELECT Id, Name, Email, Company, LeadSource, Status, Rating, Owner.Name, CreatedDate FROM Lead ORDER BY CreatedDate DESC LIMIT ${limit}`);
      res.json({ success: true, total: data.totalSize, data: data.records.map(cleanSF) });
    } catch (err: any) {
      console.error("[sf/leads]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/leads/by-source ──────────────────────────────────
  app.get("/api/salesforce/leads/by-source", async (req, res) => {
    try {
      const period = (req.query.period as string) || "THIS_MONTH";
      const data   = await sfQuery(`SELECT LeadSource, COUNT(Id) leadCount FROM Lead WHERE CreatedDate = ${period} GROUP BY LeadSource ORDER BY COUNT(Id) DESC`);
      res.json({
        success: true,
        data: data.records.map((r: any) => ({ source: r.LeadSource || "Non specificato", count: r.leadCount })),
      });
    } catch (err: any) {
      console.error("[sf/leads/by-source]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/leads/monthly ────────────────────────────────────
  app.get("/api/salesforce/leads/monthly", async (req, res) => {
    try {
      const data = await sfQuery("SELECT Id, CreatedDate FROM Lead WHERE CreatedDate = LAST_N_MONTHS:6 ORDER BY CreatedDate DESC");
      const byMonth: Record<string, number> = {};
      data.records.forEach((r: any) => {
        const d   = new Date(r.CreatedDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      });
      res.json({
        success: true,
        data: Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
      });
    } catch (err: any) {
      console.error("[sf/leads/monthly]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/opportunities ────────────────────────────────────
  app.get("/api/salesforce/opportunities", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "50");
      const data  = await sfQuery(`SELECT Id, Name, StageName, Amount, Probability, CloseDate, Account.Name, Owner.Name, LeadSource FROM Opportunity WHERE IsClosed = false ORDER BY CloseDate ASC LIMIT ${limit}`);
      res.json({ success: true, total: data.totalSize, data: data.records.map(cleanSF) });
    } catch (err: any) {
      console.error("[sf/opportunities]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/pipeline-summary ─────────────────────────────────
  app.get("/api/salesforce/pipeline-summary", async (req, res) => {
    try {
      const data   = await sfQuery("SELECT StageName, COUNT(Id) dealCount, SUM(Amount) totalAmount FROM Opportunity WHERE IsClosed = false GROUP BY StageName ORDER BY SUM(Amount) DESC");
      const stages = data.records.map((r: any) => ({ stage: r.StageName, deals: r.dealCount, totalAmount: r.totalAmount || 0 }));
      res.json({
        success: true,
        totalPipeline: stages.reduce((s: number, r: any) => s + r.totalAmount, 0),
        totalDeals:    stages.reduce((s: number, r: any) => s + r.deals, 0),
        stages,
      });
    } catch (err: any) {
      console.error("[sf/pipeline]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ── GET /api/salesforce/accounts ─────────────────────────────────────────
  app.get("/api/salesforce/accounts", async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "30");
      const data  = await sfQuery(`SELECT Id, Name, Industry, Type, AnnualRevenue, BillingCity, Phone, Website, Owner.Name, CreatedDate FROM Account ORDER BY CreatedDate DESC LIMIT ${limit}`);
      res.json({ success: true, total: data.totalSize, data: data.records.map(cleanSF) });
    } catch (err: any) {
      console.error("[sf/accounts]", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  await seedDatabase();
  return httpServer;
}

// ── Rimuove campi tecnici Salesforce (attributes, relazioni nested) ───────────
function cleanSF(record: any): any {
  const r = { ...record };
  delete r.attributes;
  Object.keys(r).forEach(k => {
    if (r[k] && typeof r[k] === "object" && !Array.isArray(r[k])) {
      const nested = { ...r[k] };
      delete nested.attributes;
      Object.keys(nested).forEach(nk => { r[`${k.toLowerCase()}_${nk}`] = nested[nk]; });
      delete r[k];
    }
  });
  return r;
}

// ── Seed iniziale ─────────────────────────────────────────────────────────────
export async function seedDatabase() {
  const existing = await storage.getMessages();
  if (existing.length === 0) {
    await storage.createMessage({ content: "Welcome to your new app!" });
    await storage.createMessage({ content: "This is a fullstack template." });
    await storage.createMessage({ content: "Go ahead and build something amazing!" });
  }
}
