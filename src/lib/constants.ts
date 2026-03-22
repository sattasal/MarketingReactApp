export const MAX_FILE_SIZE = 500 * 1024;
export const STORAGE_BUCKET = "creativita";
export const TABLE = "marketing_entries";
export const BUDGET_TABLE = "budget_records";
export const today = new Date().toISOString().slice(0, 10);

export const TIPOLOGIE = ["Radio", "OOH", "Stampa", "Digital Adv", "Evento", "Sponsor", "Partner", "Servizio", "Altro online", "Altro offline"];
export const BRANDS = ["Fiat", "Jeep", "Alfa Romeo", "Lancia", "Leapmotor", "Opel", "Peugeot", "Citroen", "DS", "Honda", "Skoda", "BYD", "Dongfeng", "Hurba", "MyUsato", "Post Vendita", "Commerciali", "Vaigo", "Leonori", "Veicoli nuovi"];
export const OFFLINE_TYPES = ["Radio", "OOH", "Stampa", "Evento", "Sponsor", "Altro offline"];
export const ONLINE_TYPES = ["Digital Adv", "Altro online"];
export const MEDIA_COLORS: Record<string, string> = {
  "Radio": "#e11d48", "OOH": "#ea580c", "Stampa": "#0284c7", "Digital Adv": "#7c3aed",
  "Evento": "#059669", "Sponsor": "#d97706", "Partner": "#8b5cf6", "Servizio": "#0891b2",
  "Altro online": "#6366f1", "Altro offline": "#78716c",
};
export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
export const MESI_SHORT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

export const BRAND_COLORS: Record<string, string> = {
  "Fiat": "#d32f2f", "Jeep": "#2e7d32", "Alfa Romeo": "#8b0000", "Lancia": "#1565c0",
  "Leapmotor": "#0097a7", "Opel": "#f9a825", "Peugeot": "#1a237e", "Citroen": "#c62828",
  "DS": "#6a1b9a", "Honda": "#e64a19", "Skoda": "#388e3c", "BYD": "#0d47a1",
  "Dongfeng": "#4e342e", "Hurba": "#ff6f00", "MyUsato": "#e65100", "Post Vendita": "#546e7a",
  "Commerciali": "#37474f", "Vaigo": "#00838f", "Leonori": "#795548", "Veicoli nuovi": "#455a64",
};

export const META_KNOWN_BRANDS = [
  "Alfa Romeo","Abarth","BYD","Citroen","Dacia","Fiat",
  "Ford","Jeep","Kia","Lancia","Opel","Peugeot","Renault",
  "Skoda","Smart","Toyota","Volkswagen","Volvo","Honda","Nissan",
];
export const META_CLEANUP = /[_\s]*(nov|gen|v\d+|\d{4,}[\w_]*)$/gi;
export const META_MYUSATO = /\b(usato|myusato|outlet)\b/i;
export const GOOGLE_MYUSATO = /\b(usato|myusato|outlet)\b/i;
export const GOOGLE_CLEANUP_CAMPAIGN = /\b(dsa|search|nuova|nuovo|nuovi|nuove|hybrid|gpl|discovery|suv|lead|dinamica|dinamici|dinamico|pmax|performance\s*max|rem|retargeting|display|awareness|video|competitors|test|promo|agosto|settembre|ottobre|novembre|dicembre|gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|landing|rt|ab|rent|privati|società|evento|rottamazione|voucher|ecobonus|wible|drive|generica|multibrand)\b/gi;

export const IT_MONTHS_MAP: Record<string, number> = {
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
  luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
};

export const LC_AGENTI_ESCLUSI = new Set([
  "DIREZIONE", "LEASEPLAN - MASSIMILIANO ROCCO", "DI SORA AGOSTINO",
  "VERSACE DOMENICO", "CEDRARO LUCA", "GIANNINI CRISTINA",
  "CENNAMO ROBERTO", "DI RITA FABIO", "CESARIA LARA",
  "TULLI MARCO", "ALU' GIULIANO", "LEROSE VITO",
]);

export const LC_COLORS: Record<string, string> = {
  "Lead Casa Madre": "#2563eb", "Lead Interno": "#f59e0b", "Walk In": "#10b981",
};

export const emptyForm = {
  dataInizio: today, dataFine: today, descrizione: "", tipologia: TIPOLOGIE[0],
  brand: BRANDS[0], soggetto: "", spesa: "", rimborsoPct: "",
  costoDichiarato: "", numeroPartecipanti: "2",
  pianoExtra: false, collettiva: false, nomeCollettiva: "",
  dateSingole: [] as string[],
  mappaUrl: "", poster3x2: "", posterAltri: "", posterMaxi: "",
  piattaforma: "",
};