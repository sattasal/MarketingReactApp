// ============================================================
// ⚠️ CONFIGURA QUI LE TUE CREDENZIALI SUPABASE
// ============================================================
export const SUPABASE_URL = "https://rlgfdsvqintkibxrxdaw.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsZ2Zkc3ZxaW50a2lieHJ4ZGF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MTk0ODEsImV4cCI6MjA4NjI5NTQ4MX0.vGsri3DXyd7B-eCzZv7S7asDMOzMOR1zi-ncikq1baQ";
// ============================================================

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