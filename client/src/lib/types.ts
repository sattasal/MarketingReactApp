export type PageType = "marketing" | "ooh" | "collettive" | "piani-extra" | "timeline" | "creativita" | "lead-contratti" | "budget" | "reach";

export interface PageProps {
  onNavigate: (p: PageType) => void;
  unlocked: boolean;
  setUnlocked: (v: boolean) => void;
}

export interface Entry {
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

export interface CsvImportRow {
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

export interface LCContratto {
  n_contratto: string; data_contratto: string; ragsoc_cliente: string;
  brand: string; modello: string; versione: string; sede_contratto: string;
  cap_cliente: string; provincia: string; tipo_contratto: string; status: string;
  venditore: string; importo: number;
  mobile_norm: string; email_norm: string; nome_norm: string;
}

export interface LCLead {
  idx: number; first_name: string; last_name: string; created_date: string;
  mobile: string; email: string; lead_source: string; brand: string;
  mobile_norm: string; email_norm: string; nome_norm: string;
}

export interface LCDashRow {
  n_contratto: string; data_contratto: string; ragsoc_cliente: string;
  brand: string; modello: string; versione: string; sede_contratto: string;
  cap_cliente: string; provincia: string; tipo_contratto: string; status: string;
  venditore: string; importo: number;
  lead_source: string; lead_date: string; match_type: string;
  attribuzione: number; origine_contratto: string;
  first_name: string; last_name: string;
}

export interface BudgetRow {
  id: string;
  month_key: string;
  azione: string;
  brand: string;
  costo: number;
  rimborso: number;
  note: string;
}