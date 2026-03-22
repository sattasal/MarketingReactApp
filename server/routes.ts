import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

// ── Variabili d'ambiente Meta + Supabase ──────────────────────────────────────
const META_TOKEN   = process.env.META_ACCESS_TOKEN   ?? "";
const META_ACCOUNT = process.env.META_AD_ACCOUNT_ID     ?? ""; // es. act_123456789
const SB_URL       = process.env.SUPABASE_URL        ?? "";
const SB_KEY       = process.env.SUPABASE_SERVICE_KEY ?? ""; // service_role key

// ── Variabili d'ambiente Google Ads ──────────────────────────────────────────
const G_DEVELOPER_TOKEN = process.env.GOOGLE_DEVELOPER_TOKEN ?? "";
const G_CLIENT_ID       = process.env.GOOGLE_CLIENT_ID       ?? "";
const G_CLIENT_SECRET   = process.env.GOOGLE_CLIENT_SECRET   ?? "";
const G_REFRESH_TOKEN   = process.env.GOOGLE_REFRESH_TOKEN   ?? "";
const G_MCC_ID          = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/-/g, "");

// ── Helper: ottieni Access Token Google (scade ogni ora, si rinnova automaticamente) ──
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

// ── Helper: lista tutti i sotto-account accessibili dall'MCC ─────────────────
async function getGoogleChildAccounts(accessToken: string): Promise<string[]> {
  // Usa customer_client per ottenere tutta la gerarchia sotto l'MCC
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

// ── Helper: esegui query GAQL su un singolo account ──────────────────────────
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
  // Ignora errori su singoli account (es. account sospesi) e restituisce array vuoto
  if (json.error || !json.results) return [];
  return json.results.map((r: any) => ({
    account_name:   r.customer?.descriptiveName ?? customerId,
    campaign_name:  r.campaign?.name ?? "",
    cost:           (r.metrics?.costMicros ?? 0) / 1_000_000,
    customer_id:    customerId,
  }));
}

// ── Helper: inserisce righe in Supabase via REST ──────────────────────────────
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── list messages (originale) ─────────────────────────────────────────────
  app.get(api.messages.list.path, async (req, res) => {
    const messages = await storage.getMessages();
    res.json(messages);
  });

  // ── create message (originale) ────────────────────────────────────────────
  app.post(api.messages.create.path, async (req, res) => {
    try {
      const input = api.messages.create.input.parse(req.body);
      const message = await storage.createMessage(input);
      res.status(201).json(message);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      } else {
        throw err;
      }
    }
  });

  // ── GET /api/meta/insights ────────────────────────────────────────────────
  // Chiama Meta Ads API e restituisce i dati al frontend per la review.
  // Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
  // Esempio: /api/meta/insights?from=2025-03-01&to=2025-03-31
  app.get("/api/meta/insights", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };

      if (!from || !to) {
        return res.status(400).json({ error: "Parametri 'from' e 'to' obbligatori (YYYY-MM-DD)" });
      }
      if (!META_TOKEN || !META_ACCOUNT) {
        return res.status(500).json({ error: "META_ACCESS_TOKEN o META_ACCOUNT_ID non configurati nel .env" });
      }

      // Chiamata a Meta Marketing API v19
      // Raggruppa per adset per mantenere la granularità che il parser brand già usa
      const fields = "campaign_name,adset_name,spend,impressions,date_start,date_stop";
      const url = new URL(`https://graph.facebook.com/v19.0/${META_ACCOUNT}/insights`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("time_range", JSON.stringify({ since: from, until: to }));
      url.searchParams.set("level", "adset");
      url.searchParams.set("limit", "500");
      url.searchParams.set("access_token", META_TOKEN);

      const metaRes = await fetch(url.toString());
      const metaJson = await metaRes.json() as any;

      if (metaJson.error) {
        return res.status(400).json({ error: metaJson.error.message });
      }

      const data: object[] = metaJson.data ?? [];

      // Gestisce paginazione Meta (cursor-based)
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
  // Riceve le righe selezionate dal frontend e le salva in meta_spese_raw.
  // Body: { rows: Array<{ campaign_name, adset_name, spend, impressions, date_start, date_stop }> }
  app.post("/api/meta/save", async (req, res) => {
    try {
      const { rows } = req.body as { rows: any[] };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "Nessuna riga da salvare" });
      }
      if (!SB_URL || !SB_KEY) {
        return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY non configurati nel .env" });
      }

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

  // ── GET /api/google/insights ─────────────────────────────────────────────
  // Chiama Google Ads API su tutti i sotto-account dell'MCC e aggrega per account.
  // Query params: from (YYYY-MM-DD), to (YYYY-MM-DD)
  // Esempio: /api/google/insights?from=2025-03-01&to=2025-03-31
  app.get("/api/google/insights", async (req, res) => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };

      if (!from || !to) {
        return res.status(400).json({ error: "Parametri 'from' e 'to' obbligatori (YYYY-MM-DD)" });
      }
      if (!G_DEVELOPER_TOKEN || !G_CLIENT_ID || !G_CLIENT_SECRET || !G_REFRESH_TOKEN || !G_MCC_ID) {
        return res.status(500).json({ error: "Credenziali Google Ads non configurate nei Secrets" });
      }

      // 1. Ottieni access token fresco
      const accessToken = await getGoogleAccessToken();

      // 2. Lista tutti i sotto-account dell'MCC
      const customerIds = await getGoogleChildAccounts(accessToken);

      // 3. Interroga ogni account in parallelo (max 10 alla volta per non sovraccaricare)
      const allRows: any[] = [];
      const chunkSize = 10;
      for (let i = 0; i < customerIds.length; i += chunkSize) {
        const chunk = customerIds.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map(id => queryGoogleAccount(accessToken, id, from, to))
        );
        results.forEach(rows => allRows.push(...rows));
      }

      // 4. Aggrega per account (come fa il CSV: una riga per account con totale spesa)
      const accountMap: Record<string, {
        account_name: string;
        campaigns: string[];
        total: number;
        customer_id: string;
      }> = {};

      for (const row of allRows) {
        const key = row.customer_id;
        if (!accountMap[key]) {
          accountMap[key] = {
            account_name: row.account_name,
            campaigns: [],
            total: 0,
            customer_id: row.customer_id,
          };
        }
        accountMap[key].campaigns.push(row.campaign_name);
        accountMap[key].total += row.cost;
      }

      const data = Object.values(accountMap)
        .filter(a => a.total > 0)
        .sort((a, b) => b.total - a.total)
        .map(a => ({
          account_name:  a.account_name,
          customer_id:   a.customer_id,
          campaigns:     [...new Set(a.campaigns)].join(", "),
          cost:          Math.round(a.total * 100) / 100,
          date_start:    from,
          date_stop:     to,
        }));

      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error("[google/insights]", err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/google/save ─────────────────────────────────────────────────
  // Riceve le righe confermate dal frontend e le salva in meta_spese_raw
  // (stessa tabella di Meta, distinguibile dal campo account_id).
  app.post("/api/google/save", async (req, res) => {
    try {
      const { rows } = req.body as { rows: any[] };

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: "Nessuna riga da salvare" });
      }
      if (!SB_URL || !SB_KEY) {
        return res.status(500).json({ error: "SUPABASE_URL o SUPABASE_SERVICE_KEY non configurati" });
      }

      const toInsert = rows.map(r => ({
        periodo_inizio: r.date_start,
        periodo_fine:   r.date_stop,
        campaign_name:  r.campaigns ?? "",
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

  await seedDatabase();
  // ── POST /api/verify-pin ──────────────────────────────────────────────────────
// Verifica il PIN lato server leggendolo dai Secrets di Replit (APP_PIN)
app.post("/api/verify-pin", (req, res) => {
  const { pin } = req.body as { pin?: string };
  if (!pin) return res.status(400).json({ ok: false });
  const correct = process.env.APP_PIN ?? "";
  res.json({ ok: pin === correct });
});
  return httpServer;
}

// ── Seed iniziale (originale) ─────────────────────────────────────────────────
export async function seedDatabase() {
  const existing = await storage.getMessages();
  if (existing.length === 0) {
    await storage.createMessage({ content: "Welcome to your new app!" });
    await storage.createMessage({ content: "This is a fullstack template." });
    await storage.createMessage({ content: "Go ahead and build something amazing!" });
  }
}
