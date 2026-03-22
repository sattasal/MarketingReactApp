import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// Il database principale dell'app è su Supabase.
// Questo file serve solo per il template originale di Replit (messages).
// Se DATABASE_URL non è configurato, usiamo un client dummy che non crasha il server.

let pool: pg.Pool;
let db: any;

if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db   = drizzle(pool, { schema });
} else {
  console.warn("[db] DATABASE_URL non configurato — funzioni storage disabilitate (app usa Supabase)");
  // Client dummy — non verrà mai chiamato perché seedDatabase() è disabilitato
  pool = null as any;
  db   = null as any;
}

export { pool, db };
