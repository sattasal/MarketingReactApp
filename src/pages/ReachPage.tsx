import { useState, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from "recharts";
import {
  supabase, TABLE, TIPOLOGIE, BRANDS, STORAGE_BUCKET, MAX_FILE_SIZE,
  formatEur, getMonthKey, getCurrentMonthKey, today, inputStyle,
  PageShell, NavBar, parseCreativitaFiles, isImageUrl,
  type PageType, type PageProps
} from "../App";

// ═══════════════════════════════════════════════════════════════
// ABBREVIAZIONI
// ═══════════════════════════════════════════════════════════════
const RADIO_ABBR: Record<string, string> = {
  "Radio Subasio": "Sub", "RAM Power": "RAM", "Dimensione Suono Soft": "Soft",
  "Dimensione Suono Roma": "Roma", "Radio Rock": "Rock", "Sport Network": "Sport",
  "Tele Radio Stereo": "TRS", "Centro Suono Sport": "Css", "Radio Romanista": "Roman",
  "Globo Vintage": "Vint", "Radio Globo": "Globo", "Radio Core de Roma": "Core",
  "Radio Roma Capitale": "RRC", "Radio Olympia": "Oly",
};
const STAMPA_ABBR: Record<string, string> = {
  "Il Messaggero": "Mess", "Corriere dello Sport": "CdS",
  "Leggo": "Leggo", "La Repubblica": "Rep",
};
const FORMAT_LABELS: Record<string, string> = {
  doppia: "doppie", palco: "palco", junior: "junior", intera: "intere", mezza: "mezze",
};

// ═══════════════════════════════════════════════════════════════
// MODELLO RADIO
// ═══════════════════════════════════════════════════════════════
const P_RADIO = 3744000;
const H_RADIO = 1080;
const RADIOS = [
  { id:1,  name:"Radio Subasio",         D:426000, W:1148000, T:104, costSpot:33,  unverified:false },
  { id:2,  name:"Dimensione Suono Soft", D:382000, W:963000,  T:86,  costSpot:25,  unverified:false },
  { id:3,  name:"Radio Globo",           D:295000, W:833000,  T:78,  costSpot:29,  unverified:false },
  { id:4,  name:"RAM Power",             D:246000, W:758000,  T:64,  costSpot:25,  unverified:false },
  { id:5,  name:"Dimensione Suono Roma", D:230000, W:741000,  T:60,  costSpot:23,  unverified:false },
  { id:6,  name:"Radio Rock",            D:145000, W:439000,  T:38,  costSpot:13,  unverified:false },
  { id:7,  name:"Tele Radio Stereo",     D:96000,  W:312000,  T:90,  costSpot:12,  unverified:false },
  { id:8,  name:"Radio Roma Capitale",   D:54000,  W:329000,  T:40,  costSpot:6,   unverified:true  },
  { id:9,  name:"Radio Romanista",       D:68000,  W:209000,  T:93,  costSpot:9,   unverified:false },
  { id:10, name:"Sport Network",         D:138000, W:310000,  T:76,  costSpot:10,  unverified:false },
  { id:11, name:"Centro Suono Sport",    D:33000,  W:130000,  T:88,  costSpot:10,  unverified:true  },
  { id:12, name:"Globo Vintage",         D:65000,  W:230000,  T:65,  costSpot:9,   unverified:false },
  { id:13, name:"Radio Core de Roma",    D:14000,  W:64000,   T:79,  costSpot:2.5, unverified:false },
  { id:14, name:"Radio Olympia",         D:12000,  W:53000,   T:61,  costSpot:6,   unverified:false },
];

function radioReachCampaign(radio: typeof RADIOS[0], days: number, spots: number): number {
  const r = Math.pow(1 - radio.W / P_RADIO, 1 / 7);
  const reachDays = P_RADIO * (1 - Math.pow(r, days));
  const pSpot = 1 - Math.pow(1 - radio.T / H_RADIO, spots);
  return reachDays * pSpot;
}
function radioCombinedReach(radios: typeof RADIOS, paramsMap: Record<number, {giorni: number; spots: number}>): number {
  if (!radios.length) return 0;
  const p0 = paramsMap[radios[0].id] || {giorni:13, spots:12};
  let total = radioReachCampaign(radios[0], p0.giorni, p0.spots);
  for (let i = 1; i < radios.length; i++) {
    const pi = paramsMap[radios[i].id] || {giorni:13, spots:12};
    const rB = radioReachCampaign(radios[i], pi.giorni, pi.spots);
    total = total + rB - (total / P_RADIO) * rB;
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════
// MODELLO STAMPA
// ═══════════════════════════════════════════════════════════════
const P_STAMPA = 3744000;
const STAMPA_ALPHA = 0.59;
const PA_S = 5.5/7, PO_S = 2.0/7;
const DAILY_PROB_S = STAMPA_ALPHA * PA_S + (1-STAMPA_ALPHA) * PO_S;

const P_DIG_S = 6.0/7;
const S_DAYS = ["lun","mar","mer","gio","ven","sab","dom"] as const;
type SDay = typeof S_DAYS[number];
const S_DAY_LABELS: Record<SDay,string> = { lun:"Lun", mar:"Mar", mer:"Mer", gio:"Gio", ven:"Ven", sab:"Sab", dom:"Dom" };

const STAMPA_FORMATS = [
  { key:"doppia", label:"Doppia Pagina", shortLabel:"Doppia", icon:"◼◼", visWeight:0.90, color:"#34D399",
    desc:"Impatto massimo, nessuna piega possibile." },
  { key:"palco",  label:"Palco",         shortLabel:"Palco",  icon:"◧◨", visWeight:0.85, color:"#60A5FA",
    desc:"Massima integrazione editoriale." },
  { key:"junior", label:"Junior Page",   shortLabel:"Junior", icon:"▮",  visWeight:0.78, color:"#a78bfa",
    desc:"Verticale, buona prossimità editoriale." },
  { key:"intera", label:"Pagina Intera", shortLabel:"Intera", icon:"▪",  visWeight:0.72, color:"#F59E0B",
    desc:"Grande ma senza articoli vicini." },
  { key:"mezza",  label:"½ Bassa",       shortLabel:"½ Bassa",icon:"▬",  visWeight:0.45, color:"#F472B6",
    desc:"Il formato più penalizzato dalla piega." },
];
type SFormatKey = "doppia"|"palco"|"junior"|"intera"|"mezza";
const S_FORMAT_MAP = Object.fromEntries(STAMPA_FORMATS.map(f=>[f.key,f])) as Record<SFormatKey, typeof STAMPA_FORMATS[0]>;

const STAMPA_TESTATE = [
  { id:1, name:"La Repubblica", shortName:"Repubblica", copieRoma:18000, moltiplicatoreC:3.5, copieDigRoma:4500, alpha:STAMPA_ALPHA,
    dayWeights:{lun:0.85,mar:1.00,mer:1.00,gio:1.00,ven:1.00,sab:1.10,dom:1.25} as Record<SDay,number>,
    costPerUscita:{doppia:null,palco:null,intera:500,mezza:250,junior:null} as Record<SFormatKey,number|null>,
    color:"#F59E0B", note:"Nazionale. Forte Roma. Domenica picco." },
  { id:2, name:"Il Messaggero", shortName:"Messaggero", copieRoma:43000, moltiplicatoreC:3.0, copieDigRoma:5000, alpha:STAMPA_ALPHA,
    dayWeights:{lun:0.90,mar:1.00,mer:1.00,gio:1.00,ven:1.00,sab:1.05,dom:1.20} as Record<SDay,number>,
    costPerUscita:{doppia:null,palco:null,intera:600,mezza:400,junior:400} as Record<SFormatKey,number|null>,
    color:"#34D399", note:"Quotidiano della Capitale. 8 edizioni laziali." },
  { id:3, name:"Corriere dello Sport", shortName:"Corsport", copieRoma:31500, moltiplicatoreC:4.5, copieDigRoma:8000, alpha:0.55,
    dayWeights:{lun:1.60,mar:0.90,mer:0.90,gio:0.90,ven:0.90,sab:1.05,dom:1.10} as Record<SDay,number>,
    costPerUscita:{doppia:null,palco:400,intera:300,mezza:200,junior:200} as Record<SFormatKey,number|null>,
    color:"#60A5FA", note:"Lunedì +60%. Edizione Roma-Lazio." },
  { id:4, name:"Leggo", shortName:"Leggo", copieRoma:8500, moltiplicatoreC:1.8, copieDigRoma:300, alpha:0.45,
    dayWeights:{lun:0.95,mar:1.00,mer:1.00,gio:1.00,ven:1.05,sab:0.40,dom:0.00} as Record<SDay,number>,
    costPerUscita:{doppia:null,palco:null,intera:300,mezza:200,junior:null} as Record<SFormatKey,number|null>,
    color:"#F472B6", note:"Free press metro/stazioni. Non esce domenica." },
];
type STestata = typeof STAMPA_TESTATE[0];
type SDfc = Record<SDay, Record<SFormatKey, number>>;
function sEmptyDfc(): SDfc {
  const dfc = {} as SDfc;
  S_DAYS.forEach(d => { dfc[d] = {} as Record<SFormatKey,number>; STAMPA_FORMATS.forEach(f => { dfc[d][f.key as SFormatKey]=0; }); });
  return dfc;
}
function sTotalN(dfc: SDfc): number {
  return S_DAYS.reduce((s,d)=>s+STAMPA_FORMATS.reduce((ss,f)=>ss+(dfc[d]?.[f.key as SFormatKey]||0),0),0);
}
function sUsciteGiorno(dfc: SDfc, day: SDay): number {
  return STAMPA_FORMATS.reduce((s,f)=>s+(dfc[day]?.[f.key as SFormatKey]||0),0);
}
function sAvgVisWeight(dfc: SDfc): number {
  const N=sTotalN(dfc); if(!N) return 1;
  let sum=0;
  S_DAYS.forEach(d=>STAMPA_FORMATS.forEach(f=>{ sum+=(dfc[d]?.[f.key as SFormatKey]||0)*(S_FORMAT_MAP[f.key as SFormatKey]?.visWeight||1); }));
  return sum/N;
}
function sAvgDayWeight(testata: STestata, dfc: SDfc): number {
  const N=sTotalN(dfc); if(!N) return 1;
  let sum=0;
  S_DAYS.forEach(d=>{ sum+=sUsciteGiorno(dfc,d)*(testata.dayWeights[d]||0); });
  return sum/N;
}
function stampaReachCartaDfc(testata: STestata, dfc: SDfc): number {
  const N=sTotalN(dfc); if(!N) return 0;
  const w=sAvgDayWeight(testata,dfc), vis=sAvgVisWeight(dfc);
  const L=testata.copieRoma*testata.moltiplicatoreC, U=L/DAILY_PROB_S;
  const pA=Math.min(PA_S*w,1), pO=Math.min(PO_S*w,1);
  return (U*testata.alpha*(1-Math.pow(1-pA,N))+U*(1-testata.alpha)*(1-Math.pow(1-pO,N)))*vis;
}
function stampaReachDigitaleDfc(testata: STestata, dfc: SDfc): number {
  const N=sTotalN(dfc); if(!N) return 0;
  return testata.copieDigRoma*(1-Math.pow(1-P_DIG_S,N));
}
function stampaReachTotaleDfc(testata: STestata, dfc: SDfc): number {
  const rC=stampaReachCartaDfc(testata,dfc), rD=stampaReachDigitaleDfc(testata,dfc);
  return rC+rD-(rC/P_STAMPA)*rD;
}
function stampaCostoTestata(testata: STestata, dfc: SDfc): {value:number;known:number;hasUnknown:boolean} {
  let tot=0, hasUnknown=false;
  S_DAYS.forEach(d=>STAMPA_FORMATS.forEach(f=>{ const cnt=dfc[d]?.[f.key as SFormatKey]||0; if(!cnt) return; const c=testata.costPerUscita[f.key as SFormatKey]; if(c===null||c===undefined) return; tot+=c*cnt; }));
  return {value:tot,known:tot,hasUnknown};
}
function sAvailFormats(testata: STestata) {
  return STAMPA_FORMATS.filter(f=>testata.costPerUscita[f.key as SFormatKey]!==null);
}
function sUniformDfc(days: SDay[], nPerDay: number, formatKey: SFormatKey): SDfc {
  const dfc=sEmptyDfc();
  days.forEach(d=>{ if(dfc[d]) dfc[d][formatKey]=nPerDay; });
  return dfc;
}
function sCombinedReachUniform(testate: STestata[], dfc: SDfc, withDigital: boolean): number {
  if(!testate.length) return 0;
  const fn=(t: STestata)=>withDigital?stampaReachTotaleDfc(t,dfc):stampaReachCartaDfc(t,dfc);
  let tot=fn(testate[0]);
  for(let i=1;i<testate.length;i++){const rB=fn(testate[i]);tot=tot+rB-(tot/P_STAMPA)*rB;}
  return tot;
}
function sCpp100(reach: number, cost: number): number { return reach>0&&cost>0?(cost/reach)*100:0; }
function stampaHeatColor(v: number, mn: number, mx: number): string {
  if(mx===mn) return "#131d35";
  const t=(v-mn)/(mx-mn);
  return `rgb(${Math.round(10+t*5)},${Math.round(20+t*191)},${Math.round(30+t*123)})`;
}

// Legacy compat (used by OOH import modal)
function stampaReachCarta(testata: typeof STAMPA_TESTATE[0], N: number, visWeight: number): number {
  if(N===0) return 0;
  const L=testata.copieRoma*testata.moltiplicatoreC, U=L/DAILY_PROB_S;
  const pA=Math.min(PA_S,1), pO=Math.min(PO_S,1);
  return (U*testata.alpha*(1-Math.pow(1-pA,N))+U*(1-testata.alpha)*(1-Math.pow(1-pO,N)))*visWeight;
}

// ═══════════════════════════════════════════════════════════════
// MODELLO OOH
// ═══════════════════════════════════════════════════════════════
const P_OOH = 3744000;
const OOH_SEG = {
  pendolari:   { quota: 0.35, pF: 0.80, pW: 0.05 },
  residenti:   { quota: 0.30, pF: 0.45, pW: 0.35 },
  occasionali: { quota: 0.35, pF: 0.12, pW: 0.10 },
};
const OOH_FLUSSO_BASE: Record<string, number> = {
  motorway:50000, trunk:40000, primary:25000, secondary:12000, tertiary:5000,
  unclassified:2500, residential:1200, pedestrian:18000, living_street:800, service:600, _default:3000,
};
const OOH_P_VIS: Record<string, number> = {
  motorway:0.22, trunk:0.28, primary:0.38, secondary:0.45, tertiary:0.50,
  unclassified:0.52, residential:0.55, pedestrian:0.68, living_street:0.60, service:0.48, _default:0.45,
};
const OOH_ROAD_LABEL: Record<string, string> = {
  motorway:"Autostrada", trunk:"Arteria", primary:"Via primaria", secondary:"Via secondaria",
  tertiary:"Via terziaria", residential:"Residenziale", pedestrian:"Zona pedonale",
  living_street:"ZTL", unclassified:"Non classificata", service:"Servizio", _default:"N/D",
};

function oohCalcReach(flussoEff: number) {
  const dp = OOH_SEG.pendolari.quota*(OOH_SEG.pendolari.pF*10+OOH_SEG.pendolari.pW*4)/14
    + OOH_SEG.residenti.quota*(OOH_SEG.residenti.pF*10+OOH_SEG.residenti.pW*4)/14
    + OOH_SEG.occasionali.quota*(OOH_SEG.occasionali.pF*10+OOH_SEG.occasionali.pW*4)/14;
  const U = flussoEff / dp;
  const pN = (s: {pF:number;pW:number}) => Math.pow(1-s.pF,10)*Math.pow(1-s.pW,4);
  const reach = U*OOH_SEG.pendolari.quota*(1-pN(OOH_SEG.pendolari))
    + U*OOH_SEG.residenti.quota*(1-pN(OOH_SEG.residenti))
    + U*OOH_SEG.occasionali.quota*(1-pN(OOH_SEG.occasionali));
  return Math.round(reach);
}
function oohFlussoEff(roadClass: string, ctx: any): number {
  const base = OOH_FLUSSO_BASE[roadClass] || OOH_FLUSSO_BASE._default;
  const vis = OOH_P_VIS[roadClass] || OOH_P_VIS._default;
  let mol = 1.0;
  if (ctx.hasTrafficLight) mol *= 1.40;
  if (ctx.hasBusStop) mol *= 1.60;
  if (ctx.hasMetroTram) mol *= 2.00;
  if (ctx.isCommercial) mol *= 1.35;
  if (ctx.hasSchool) mol *= 1.20;
  return base * mol * vis;
}
function oohHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R=6371000, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function oohCombinedReach(boards: {reach:number;lat:number;lon:number}[]): number {
  if (!boards.length) return 0;
  let tot = boards[0].reach;
  for (let i=1;i<boards.length;i++) {
    const rB=boards[i].reach;
    const minDist=Math.min(...boards.slice(0,i).map(b=>oohHaversine(b.lat,b.lon,boards[i].lat,boards[i].lon)));
    const overlap=Math.max(0,1-minDist/2000);
    const effP=(tot/P_OOH)*(1-overlap*0.7)+overlap*0.7;
    tot=tot+rB-effP*rB;
  }
  return Math.round(Math.min(tot, P_OOH));
}
// Infers road class from a road name string (Italian street nomenclature)
function oohInferRoadClassFromName(name: string): string {
  if (!name) return "_default";
  const n = name.toLowerCase();
  if (/\b(gra|grande raccordo|autostrada|a\d+)\b/.test(n)) return "motorway";
  if (/\b(tangenziale|circonvallazione|viale)\b/.test(n)) return "primary";
  if (/\b(corso|lungofiume|lungotevere|piazzale)\b/.test(n)) return "secondary";
  if (/\b(via|vico|vicolo|largo|piazza|borgo)\b/.test(n)) return "tertiary";
  if (/\b(centro commerciale|shopping|mall)\b/.test(n)) return "tertiary";
  if (/\b(quartiere|residenz)\b/.test(n)) return "residential";
  return "_default";
}

async function oohEnrichBillboard(lat: number, lon: number, roadNameHint?: string) {
  const query=`[out:json][timeout:25];(way(around:150,${lat},${lon})[highway];node(around:60,${lat},${lon})[highway=traffic_signals];node(around:120,${lat},${lon})[highway=bus_stop];node(around:120,${lat},${lon})[public_transport=stop_position];node(around:250,${lat},${lon})[station=subway];node(around:250,${lat},${lon})[railway=tram_stop];node(around:180,${lat},${lon})[shop];node(around:180,${lat},${lon})[amenity~"restaurant|cafe|bar|fast_food"];node(around:250,${lat},${lon})[amenity~"school|university|college"];);out body;`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1500 * attempt); // backoff: 1.5s, 3s
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST", body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
      });
      if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
      const data = await res.json();
      let roadClass = "_default", roadName = "", hasTrafficLight = false, hasBusStop = false, hasMetroTram = false, hasSchool = false, commercialCount = 0;
      for (const el of data.elements) {
        if (el.type === "way" && el.tags?.highway && roadClass === "_default") { roadClass = el.tags.highway; roadName = el.tags.name || ""; }
        if (el.type === "node") { const t = el.tags || {};
          if (t.highway === "traffic_signals") hasTrafficLight = true;
          if (t.highway === "bus_stop" || t.public_transport === "stop_position") hasBusStop = true;
          if (t.station === "subway" || t.railway === "tram_stop") hasMetroTram = true;
          if (["school", "university", "college"].includes(t.amenity)) hasSchool = true;
          if (t.shop || ["restaurant", "cafe", "bar", "fast_food"].includes(t.amenity)) commercialCount++;
        }
      }
      // Fallback: if OSM didn't find a road, use the hint from the CSV address
      if (roadClass === "_default" && roadNameHint) {
        roadClass = oohInferRoadClassFromName(roadNameHint);
        roadName = roadNameHint;
      }
      const ctx = { roadClass, roadName, hasTrafficLight, hasBusStop, hasMetroTram, hasSchool, isCommercial: commercialCount >= 4 };
      const fe = oohFlussoEff(ctx.roadClass, ctx);
      const reach = oohCalcReach(fe);
      return { ...ctx, flusso: Math.round(fe), reach };
    } catch (err) { lastErr = err instanceof Error ? err : new Error(String(err)); }
  }
  // All retries failed — use road name hint as last resort
  if (roadNameHint) {
    const roadClass = oohInferRoadClassFromName(roadNameHint);
    const ctx = { roadClass, roadName: roadNameHint, hasTrafficLight: false, hasBusStop: false, hasMetroTram: false, hasSchool: false, isCommercial: false };
    const fe = oohFlussoEff(roadClass, ctx);
    const reach = oohCalcReach(fe);
    return { ...ctx, flusso: Math.round(fe), reach, estimated: true };
  }
  throw lastErr || new Error("Overpass non raggiungibile");
}
function oohParseCSV(text: string) {
  const clean=text.replace(/^\uFEFF/,"").replace(/\r\n/g,"\n").replace(/\r/g,"\n");
  const lines=clean.trim().split("\n");
  if(lines.length<2)throw new Error("CSV vuoto");
  const sep=lines[0].includes(";")?";":lines[0].includes("\t")?"\t":",";
  const headers=lines[0].split(sep).map((h: string)=>h.trim().toLowerCase().replace(/['"]/g,""));
  const find=(...keys: string[])=>headers.findIndex((h: string)=>keys.some(k=>h.includes(k)));
  const iLat=find("lat","latitude","latitudine"), iLon=find("long","lon","lng","longitude","longitudine");
  // Detect new rich format (modello_indirizzi) vs basic format
  const iUbicazione=find("ubicazione","indirizzo");
  const iCimasa=find("cimasa","codice","id","impianto");
  const iFormatoReale=find("formato reale","formato_reale");
  const iDesc=find("descrizione","description");
  const iNome=find("nome","name");
  if(iLat<0||iLon<0)throw new Error("Colonne lat/lon non trovate");
  const parseDec=(s: string)=>parseFloat(s.replace(",","."));
  return lines.slice(1).filter((l: string)=>l.trim()).map((line: string, i: number)=>{
    const cols=line.split(sep).map((c: string)=>c.trim().replace(/^["']|["']$/g,""));
    const lat=parseDec(cols[iLat]),lon=parseDec(cols[iLon]);
    if(isNaN(lat)||isNaN(lon))return null;
    // Build nome: prefer UBICAZIONE + DESCRIZIONE combo, else fallback
    let nome="Cartello "+(i+1), ubicazione="", formato="";
    if(iUbicazione>=0&&cols[iUbicazione]) {
      ubicazione=cols[iUbicazione];
      const descPart=iDesc>=0&&cols[iDesc]&&cols[iDesc]!==cols[iUbicazione]?" — "+cols[iDesc]:"";
      const idPart=iCimasa>=0&&cols[iCimasa]?" #"+cols[iCimasa]:"";
      nome=ubicazione+descPart+idPart;
    } else if(iNome>=0&&cols[iNome]) {
      nome=cols[iNome];
    }
    // Format: prefer FORMATO REALE, else DESCRIZIONE if available, else empty
    if(iFormatoReale>=0&&cols[iFormatoReale]) formato=cols[iFormatoReale];
    else if(iDesc>=0&&iUbicazione<0&&cols[iDesc]) formato=cols[iDesc];
    return{id:i+1,nome,ubicazione,formato,lat,lon,status:"pending" as string,enriched:null as any};
  }).filter(Boolean);
}
function classifyPoster(formato: string): {p3x2:number;pAltri:number;pMaxi:number} {
  const m=formato.match(/(\d+[.,]?\d*)\s*m?t?\s*[xX\u00d7]\s*(\d+[.,]?\d*)/);
  if(!m) return {p3x2:0,pAltri:0,pMaxi:1};
  const w=parseFloat(m[1].replace(",",".")),h=parseFloat(m[2].replace(",","."));
  if(w>=2.5&&w<=3.2&&h>=1.7&&h<=2.2) return {p3x2:1,pAltri:0,pMaxi:0};
  if(w>3.2||h>2.2) return {p3x2:0,pAltri:0,pMaxi:1};
  return {p3x2:0,pAltri:1,pMaxi:0};
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
const fmtN = (n: number) => new Intl.NumberFormat("it-IT").format(Math.round(n));
const pctOf = (n: number, tot: number) => ((n/tot)*100).toFixed(1)+"%";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const cardStyle: React.CSSProperties = {
  background:"#fff", borderRadius:14, padding:"22px 24px",
  boxShadow:"0 2px 8px rgba(0,0,0,.06)", border:"1px solid #e8ecf1",
};
const kpiStyle = (bg: string): React.CSSProperties => ({
  background:bg, borderRadius:12, padding:"20px 22px", textAlign:"center" as const,
  boxShadow:"0 1px 4px rgba(0,0,0,.04)", border:"1px solid #e8ecf1",
});

// ═══════════════════════════════════════════════════════════════
// IMPORT MODAL CONDIVISO
// ═══════════════════════════════════════════════════════════════
interface ImportItem {
  descrizione: string;
  tipologia: string;
  brand: string;
  spesa: number;
  poster_3x2?: number;
  poster_altri?: number;
  poster_maxi?: number;
}

function ImportToMarketingModal({ items, onClose, onDone, title }: {
  items: ImportItem[];
  onClose: () => void;
  onDone: () => void;
  title: string;
}) {
  const [dataInizio, setDataInizio] = useState(today);
  const [dataFine, setDataFine] = useState(today);
  const [brand, setBrand] = useState(BRANDS[0]);
  const [saving, setSaving] = useState(false);
  const [soggetto, setSoggetto] = useState("");
  // Files
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upload files
      let creativita_url: string | null = null, creativita_nome: string | null = null;
      if (files.length > 0) {
        const urls: string[] = [], names: string[] = [];
        for (const file of files) {
          const ext = file.name.split(".").pop();
          const fn = Date.now() + "_" + Math.random().toString(36).slice(2,8) + "." + ext;
          await supabase.uploadFile(STORAGE_BUCKET, fn, file);
          urls.push(supabase.getPublicUrl(STORAGE_BUCKET, fn));
          names.push(file.name);
        }
        creativita_url = JSON.stringify(urls);
        creativita_nome = JSON.stringify(names);
      }
      for (const item of items) {
        const entry: any = {
          mese_competenza: getMonthKey(dataInizio),
          data_inizio: dataInizio, data_fine: dataFine,
          descrizione: item.descrizione, tipologia: item.tipologia,
          brand: item.brand || brand, soggetto: soggetto.trim(),
          spesa: item.spesa, rimborso_pct: 0, costo_dichiarato: item.spesa,
          numero_partecipanti: 2, piano_extra: false, collettiva: false, nome_collettiva: "",
          date_singole: null, mappa_url: null,
          poster_3x2: item.poster_3x2 || 0, poster_altri: item.poster_altri || 0,
          poster_maxi: item.poster_maxi || 0,
          creativita_url, creativita_nome,
          fattura_url: null, fattura_nome: null, da_confermare: true,
        };
        await supabase.insert(TABLE, entry);
      }
      onDone();
    } catch (err: unknown) { alert("Errore: " + (err instanceof Error ? err.message : "")); }
    finally { setSaving(false); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div onClick={(ev: React.MouseEvent)=>ev.stopPropagation()} style={{background:"#fff",borderRadius:20,padding:28,width:"100%",maxWidth:520,maxHeight:"90vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 6px"}}>📊 {title}</h2>
        <p style={{fontSize:13,color:"#64748b",margin:"0 0 16px"}}>{items.length} {items.length===1?"voce":"voci"} da importare nei Costi Marketing</p>

        {/* Riepilogo */}
        <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:12}}>
          {items.map((it, i) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:i<items.length-1?"1px solid #e8ecf1":"none"}}>
              <span><strong>{it.tipologia}</strong> — {it.descrizione}</span>
              <span style={{fontWeight:600,color:"#ea580c"}}>{formatEur(it.spesa)}</span>
            </div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Data inizio</label>
            <input type="date" value={dataInizio} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setDataInizio(e.target.value)} style={inputStyle}/>
          </div>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Data fine</label>
            <input type="date" value={dataFine} min={dataInizio} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setDataFine(e.target.value)} style={inputStyle}/>
          </div>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Brand</label>
            <select value={brand} onChange={(e: React.ChangeEvent<HTMLSelectElement>)=>setBrand(e.target.value)} style={inputStyle}>
              {BRANDS.map((b: string)=><option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:13,fontWeight:700,color:"#64748b",marginBottom:4,textTransform:"uppercase"}}>Soggetto</label>
            <input type="text" placeholder="Soggetto..." value={soggetto} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setSoggetto(e.target.value)} style={inputStyle}/>
          </div>
        </div>

        {/* Creativita */}
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:13,fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase"}}>Creativita (opzionale)</label>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <label style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,fontSize:12,fontWeight:600,background:"#f1f5f9",border:"1px solid #e2e8f0",cursor:"pointer"}}>
              📎 Aggiungi file<input ref={fileRef} type="file" multiple accept="image/*,.pdf" onChange={(e: React.ChangeEvent<HTMLInputElement>)=>{
                const fl=e.target.files; if(!fl)return;
                const arr: File[]=[]; for(let i=0;i<fl.length;i++){if(fl[i].size<=MAX_FILE_SIZE)arr.push(fl[i]);}
                setFiles((prev: File[])=>[...prev,...arr]); e.target.value="";
              }} style={{display:"none"}}/>
            </label>
            {files.map((f: File,i: number)=>(
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:6,background:"#ecfdf5",color:"#059669",padding:"4px 10px",borderRadius:8,fontSize:13,fontWeight:500}}>
                {f.name}<span onClick={()=>setFiles((prev: File[])=>prev.filter((_: File,idx: number)=>idx!==i))} style={{cursor:"pointer",opacity:.6,fontSize:13}}>x</span>
              </span>
            ))}
          </div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose} style={{background:"#f1f5f9",color:"#475569",padding:"9px 16px",borderRadius:8,fontSize:13,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Annulla</button>
          <button className="btn" onClick={handleSave} disabled={saving} style={{background:"#2563eb",color:"#fff",padding:"9px 20px",borderRadius:8,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>{saving?"...":"Importa nei Costi MKT"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CSS DARK PANELS (shared by Radio + Stampa tabs)
// ═══════════════════════════════════════════════════════════════
const DARK_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
.rr-root{background:none;border-radius:14px;color:#CBD5E1;display:flex;flex-direction:column;overflow:hidden;min-height:70vh}
.rr-hdr{border-bottom:1px solid #1a2540;padding:13px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;flex-shrink:0}
.rr-logo{font-size:16px;font-weight:800;color:#000;display:flex;align-items:center;gap:8px}
.rr-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;letter-spacing:1px}
.rr-sub{font-size:10px;color:#334155;margin-top:3px}
.rr-body{display:flex;flex:1;overflow:hidden;min-height:0}
.rr-sidebar{width:230px;flex-shrink:0;border-right:1px solid #1a2540;overflow-y:auto;padding:14px 10px}
.rr-sb-hdr{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;display:flex;justify-content:space-between}
.rr-main{flex:1;overflow-y:auto;padding:18px 22px}
.rr-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:60%;gap:12px;opacity:.3}
.rr-mode-btns{display:flex;gap:5px}
.rr-mbtn{padding:6px 14px;border-radius:8px;border:none;cursor:pointer;font-weight:700;font-size:11px;letter-spacing:.5px;background:#fff;color:#475569;transition:all .2s}.rr-mbtn:hover{background:#c7c6c1!important;color:#1e293b!important}
.rr-sec{display:flex;flex-direction:column;gap:16px}
.rr-stitle{font-family:Syne,sans-serif;font-size:17px;font-weight:800;color:#fff}
.rr-ssub{font-size:11px;color:#334155;margin-top:3px}
.rr-card{background:#0D1526;border:1px solid #1a2540;border-radius:12px;padding:16px}
.rr-card-sm{background:none;border:1px solid #1a2540;border-radius:12px;padding:14px}
.rr-card-dark{background:#0a1020;border:1px solid #1a2540;border-radius:10px;padding:13px 15px}
.rr-card-hero{background:none;border:1px solid #1a2540;border-radius:14px;padding:20px 24px;position:relative;overflow:hidden}
.rr-hero-glow{position:absolute;top:-40px;right:-40px;width:160px;height:160px;pointer-events:none}
.rr-g2{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.rr-g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.rr-rcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}
.rr-n-hero{font-size:42px;font-weight:700;color:#000;letter-spacing:-2px;line-height:1}
.rr-n-lg{font-size:22px;font-weight:700;letter-spacing:-1px}
.rr-n-md{font-family:'JetBrains Mono',monospace;font-size:16px;font-weight:600;color:#fff}
.rr-lbl-xs{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.rr-lbl-sec{font-size:10px;font-weight:700;color:#475569;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:11px}
.rr-prog-track{margin-top:10px;background:#060b14;border-radius:6px;height:6px;overflow:hidden}
.rr-prog-bar{height:100%;border-radius:6px;transition:width .6s ease}
.rr-kv{display:flex;justify-content:space-between;font-size:10px;gap:6px}
.rr-kv-k{color:#334155;flex-shrink:0}
.rr-kv-v{color:#64748B;font-weight:500;font-family:'JetBrains Mono',monospace;font-size:10px}
.rr-pr-params{margin-top:10px;padding-top:10px;border-top:1px solid #1a2540;display:flex;flex-direction:column;gap:7px}
.rr-pr-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
.rr-pr-lbl{font-size:10px;color:#475569;flex:1}
.rr-pr-ctrl{display:flex;align-items:center;gap:5px}
.rr-pr-ctrl button{background:#131d35;border:1px solid #1a2540;border-radius:4px;color:#64748B;width:22px;height:22px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:all .15s;font-weight:700}
.rr-pr-val{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:#fff;min-width:28px;text-align:center}
.rr-htbl{width:100%;border-collapse:separate;border-spacing:4px;margin-top:4px}
.rr-htbl th{font-size:10px;font-weight:700;text-align:center}
.rr-htbl th:first-child{font-size:9px;font-weight:400;text-align:left;padding-right:8px;white-space:nowrap}
.rr-htbl td.rr-hd{font-size:10px;font-weight:700;padding-right:8px;white-space:nowrap}
.rr-hcell{border-radius:6px;padding:9px 5px;text-align:center}
.rr-hcell-v{font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace}
.rr-hcell-p{font-size:9px;margin-top:2px;font-family:'JetBrains Mono',monospace}
.rr-htbl-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px;flex-wrap:wrap;gap:7px}
.rr-tog-btn{font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;border:1px solid #1a2540;background:#131d35;cursor:pointer}
.rr-sstat{text-align:center}
.rr-sstat-lbl{font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#334155}
.rr-sstat-sub{font-size:9px;color:#1e2d45;margin-bottom:4px}
/* Stampa specific */
.rr-rbtn{display:flex;align-items:flex-start;gap:8px;padding:9px;border-radius:8px;cursor:pointer;transition:all .15s;text-align:left;width:100%;margin-bottom:5px}
.rr-rbtn:hover:not(:disabled){border-color:#a8a8a0!important;background:#c7c6c1!important}
.rr-rbtn:disabled{opacity:.35;cursor:not-allowed}
.rr-rdot{width:7px;height:7px;border-radius:50%;flex-shrink:0;margin-top:3px}
.rr-tname{font-size:12px;font-weight:600;line-height:1.3}
.rr-tsub{font-size:10px;color:#334155;margin-top:2px;line-height:1.4}
.rr-dig-tog{display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
.rr-dsw{width:30px;height:16px;border-radius:9px;background:#131d35;border:1px solid #1a2540;position:relative;transition:background .2s;flex-shrink:0}
.rr-dknob{width:10px;height:10px;border-radius:50%;background:#475569;position:absolute;top:2px;left:2px;transition:all .2s}
/* Stampa day×format grid */
.rr-dftbl{width:100%;border-collapse:separate;border-spacing:3px;margin-top:6px}
.rr-dftbl th{font-size:9px;font-weight:700;text-align:center;padding:3px 2px;letter-spacing:.4px;text-transform:uppercase}
.rr-day-h{text-align:left;padding-left:2px;color:#334155;white-space:nowrap;font-size:9px;font-weight:400}
.rr-fmt-h{color:#475569}
.rr-dfcell{border-radius:5px;background:#060b14;border:1px solid #0f1d30;padding:3px 2px;text-align:center;vertical-align:middle;min-width:40px}
.rr-dfcell.na-day{opacity:.12;pointer-events:none}
.rr-dfcell.active{border-color:#34D39940;background:#0a1e18}
.rr-dc-btn{background:none;border:none;color:#1e2d45;width:100%;cursor:pointer;font-size:12px;line-height:1;padding:2px 0;display:block;transition:color .12s;font-weight:700}
.rr-dc-n{font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:700;color:#1e2d45;line-height:1.3}
.rr-day-td{font-size:10px;font-weight:600;color:#475569;padding-right:4px;white-space:nowrap;vertical-align:middle}
.rr-day-w{font-size:8px;color:#1e2d45;display:block}
.rr-card-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.rr-reset-btn{font-size:10px;font-weight:600;padding:3px 9px;border-radius:6px;background:#0a1020;border:1px solid #1a2540;color:#334155;cursor:pointer;transition:all .15s}
.rr-fmt-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.rr-fmt-pill{padding:3px 7px;border-radius:5px;font-size:10px;font-weight:600;font-family:'JetBrains Mono',monospace;border:1px solid transparent}
.rr-res-block{margin-top:8px;display:flex;flex-direction:column;gap:4px;border-top:1px solid #1a2540;padding-top:7px}
.rr-vis-legend{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.rr-vp{display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:20px;border:1px solid #1a2540;background:#0a1422;font-size:10px;font-family:'JetBrains Mono',monospace}
`;

// ═══════════════════════════════════════════════════════════════
// TAB RADIO
// ═══════════════════════════════════════════════════════════════
const RADIO_ACCENT = ["#F59E0B","#34D399","#60A5FA","#F472B6"];
const R_SPOT_RANGE = [10,11,12,13,14,15];
const R_GIORNI_RANGE = [10,11,12,13,14];
const R_GIORNI_CURVE = Array.from({length:30},(_,i)=>i+1);
const R_LINE_COLORS = ["#475569","#60A5FA","#F59E0B","#34D399","#F472B6","#a78bfa"];
function rHeatColor(value: number, min: number, max: number): string {
  if(max===min) return "#131d35";
  const t=(value-min)/(max-min);
  return `rgb(${Math.round(15+t*165)},${Math.round(25+t*58)},${Math.round(50-t*41)})`;
}
function rCpp100(reach: number, cost: number): number { return reach>0?(cost/reach)*100:0; }
function rReachCampaign(radio: typeof RADIOS[0], n: number, S: number): number {
  const r=Math.pow(1-radio.W/P_RADIO,1/7);
  return P_RADIO*(1-Math.pow(r,n))*(1-Math.pow(1-radio.T/H_RADIO,S));
}
function rCombinedUniform(radios: typeof RADIOS, n: number, S: number): number {
  if(!radios.length) return 0;
  let tot=rReachCampaign(radios[0],n,S);
  for(let i=1;i<radios.length;i++){const rB=rReachCampaign(radios[i],n,S);tot=tot+rB-(tot/P_RADIO)*rB;}
  return tot;
}

function RadioTab({ showToast }: { showToast: (m: string)=>void }) {
  const [mode, setMode] = useState<"valutazione"|"simulatore">("valutazione");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [paramsMap, setParamsMap] = useState<Record<number,{giorni:number;spots:number}>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [heatMode, setHeatMode] = useState<"reach"|"cpp">("reach");

  const selected = RADIOS.filter(r=>selectedIds.includes(r.id));

  const toggleRadio = (id: number) => {
    setSelectedIds(prev=>{
      if(prev.includes(id)){setParamsMap(pm=>{const n={...pm};delete n[id];return n;});return prev.filter(x=>x!==id);}
      if(prev.length>=4) return prev;
      setParamsMap(pm=>({...pm,[id]:{giorni:13,spots:12}}));
      return [...prev,id];
    });
  };
  const updateParam = (id: number, key: "giorni"|"spots", delta: number) => {
    setParamsMap(pm=>{
      const cur=pm[id]||{giorni:13,spots:12};
      const limits=key==="giorni"?[5,30]:[1,25];
      const nv=Math.min(limits[1],Math.max(limits[0],cur[key]+delta));
      return{...pm,[id]:{...cur,[key]:nv}};
    });
  };

  const valResults = useMemo(()=>selected.map(r=>{
    const p=paramsMap[r.id]||{giorni:13,spots:12};
    const reachC=rReachCampaign(r,p.giorni,p.spots);
    const cost=r.costSpot*p.spots*p.giorni;
    const ps=1-Math.pow(1-r.T/H_RADIO,p.spots);
    return{radio:r,reachC,cost,ps,p};
  }),[selected,paramsMap]);

  const totalReach=useMemo(()=>radioCombinedReach(selected,paramsMap),[selected,paramsMap]);
  const totalCost=useMemo(()=>valResults.reduce((s,r)=>s+r.cost,0),[valResults]);
  const cpp100Val=useMemo(()=>rCpp100(totalReach,totalCost),[totalReach,totalCost]);

  const simMatrix=useMemo(()=>{
    if(!selected.length) return null;
    const cells: Record<string,number>={}, cppCells: Record<string,number>={};
    let mn=Infinity,mx=-Infinity;
    R_SPOT_RANGE.forEach(s=>R_GIORNI_RANGE.forEach(g=>{
      const v=rCombinedUniform(selected,g,s);
      const c=selected.reduce((sum,r)=>sum+r.costSpot*s*g,0);
      cells[`${g}_${s}`]=v; cppCells[`${g}_${s}`]=rCpp100(v,c);
      if(v<mn)mn=v; if(v>mx)mx=v;
    }));
    return{cells,cppCells,mn,mx};
  },[selected]);

  const simChartData=useMemo(()=>{
    if(!selected.length) return [];
    return R_GIORNI_RANGE.map(g=>{
      const e: Record<string,any>={label:`${g}g`};
      R_SPOT_RANGE.forEach(s=>{e[`${s}s`]=Math.round(rCombinedUniform(selected,g,s));});
      return e;
    });
  },[selected]);

  const simCppData=useMemo(()=>{
    if(!selected.length) return [];
    return R_GIORNI_RANGE.map(g=>{
      const e: Record<string,any>={label:`${g}g`};
      R_SPOT_RANGE.forEach(s=>{
        const v=rCombinedUniform(selected,g,s);
        const c=selected.reduce((sum,r)=>sum+r.costSpot*s*g,0);
        e[`${s}s`]=parseFloat(rCpp100(v,c).toFixed(4));
      });
      return e;
    });
  },[selected]);

  const accumCurveData=useMemo(()=>{
    if(!selected.length) return [];
    return R_GIORNI_CURVE.map(g=>{
      const e: Record<string,any>={label:`${g}g`};
      [10,12,15].forEach(S=>{e[`${S}sp`]=Math.round(rCombinedUniform(selected,g,S));});
      return e;
    });
  },[selected]);

  const reachBarData=valResults.map((r,i)=>({
    name:r.radio.name.replace("Dimensione Suono ","DS ").replace("Radio ","R."),
    reach:Math.round(r.reachC),
    cpp:parseFloat(rCpp100(r.reachC,r.cost).toFixed(4)),
    color:RADIO_ACCENT[i],
  }));

  const buildImportItems=(): ImportItem[]=>{
    const names=selected.map(r=>RADIO_ABBR[r.name]||r.name.split(" ").pop()||r.name);
    const totalSpots=selected.reduce((s,r)=>{const p=paramsMap[r.id]||{giorni:13,spots:12};return s+p.spots*p.giorni;},0);
    return[{descrizione:names.join(" + ")+" "+totalSpots+" spot",tipologia:"Radio",brand:"",spesa:totalCost}];
  };

  const cppColor=cpp100Val<5?"#34D399":cpp100Val<15?"#F59E0B":"#F472B6";
  const ttChartStyle={background:"#101929",border:"1px solid #1a2540",borderRadius:"8px",color:"#fff",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace"};

  return (
    <div>
      <style>{DARK_CSS}</style>
      <div className="rr-root">
        <header className="rr-hdr">
          <div>
            <div className="rr-logo">📻 Radio Reach Estimator<span className="rr-badge" style={{background:"#F59E0B20",color:"#F59E0B"}}>ROMA</span></div>
            <div className="rr-sub">Audiradio Q4 2025 · Provincia di Roma · Universo 14+ = 3.744.000 · <span style={{color:"#FB923C"}}>* costo non verificato</span></div>
          </div>
          <div className="rr-mode-btns">
            {(["valutazione","simulatore"] as const).map(m=>(
              <button key={m} className="rr-mbtn" style={{background:mode===m?"#d1fae5":"#fff",color:mode===m?"#065f46":"#475569",border:mode===m?"1px solid #6ee7b7":"1px solid #e2e8f0"}} onClick={()=>setMode(m)}>
                {m==="valutazione"?"🎯 Valutazione":"🔬 Simulatore"}
              </button>
            ))}
          </div>
        </header>
        <div className="rr-body">
          {/* Sidebar */}
          <aside className="rr-sidebar">
            <div className="rr-sb-hdr" style={{color:"#F59E0B"}}><span>Radio</span><span style={{color:"#334155",fontWeight:400}}>{selectedIds.length}/4</span></div>
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {RADIOS.map(radio=>{
                const isSel=selectedIds.includes(radio.id);
                const ci=selectedIds.indexOf(radio.id);
                const isDis=!isSel&&selectedIds.length>=4;
                return(
                  <button key={radio.id} disabled={isDis} onClick={()=>toggleRadio(radio.id)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"8px 9px",borderRadius:8,cursor:isDis?"not-allowed":"pointer",border:isSel?`1px solid ${RADIO_ACCENT[ci]}80`:"1px solid #e2e8f0",background:isSel?"#d1fae5":"#fff",opacity:isDis?.35:1,transition:"all .15s",textAlign:"left",width:"100%"}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:isSel?"#059669":"#cbd5e1",flexShrink:0}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:500,color:radio.unverified?"#FB923C":isSel?"#065f46":"#374151",lineHeight:1.2}}>{radio.name}{radio.unverified&&<span style={{fontSize:11,color:"#FB923C",marginLeft:3}}>*</span>}</div>
                      <div style={{fontSize:12,color:"#334155",marginTop:2}}>7gg: {fmtN(radio.W)}</div>
                      <div style={{fontSize:12,color:radio.unverified?"#FB923C":"#334155"}}>€{radio.costSpot}/spot{radio.unverified&&" *"}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
          {/* Main */}
          <main className="rr-main">
            {!selected.length?(
              <div className="rr-empty"><div style={{fontSize:48}}>📻</div><div style={{fontFamily:"Syne,sans-serif",fontSize:"15px",color:"#64748B"}}>Seleziona almeno una radio</div></div>
            ):mode==="valutazione"?(
              <div className="rr-sec">
                <div className="rr-stitle">Valutazione Campagna</div>
                <div style={{fontSize:13,color:"#334155"}}>Ogni radio ha parametri indipendenti. Modifica giorni e spot per ciascuna nelle card.</div>
                {/* Hero */}
                <div className="rr-card-hero">
                  <div className="rr-hero-glow" style={{background:"radial-gradient(circle,#F59E0B12,transparent 70%)"}}/>
                  <div className="rr-lbl-xs" style={{color:"#F59E0B",marginBottom:6}}>REACH TOTALE STIMATA · COMBINATA DEDUPLICATA</div>
                  <div className="rr-n-hero">{fmtN(totalReach)}</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:6}}>persone uniche · {((totalReach/P_RADIO)*100).toFixed(1)}% della provincia di Roma</div>
                  <div className="rr-prog-track"><div className="rr-prog-bar" style={{width:`${Math.min((totalReach/P_RADIO)*100,100)}%`,background:"linear-gradient(90deg,#D97706,#FBBF24)"}}/></div>
                </div>
                {/* Budget + CPP */}
                <div className="rr-g2">
                  <div className="rr-card-sm">
                    <div className="rr-lbl-xs" style={{color:"#334155",marginBottom:8}}>BUDGET TOTALE</div>
                    <div className="rr-n-lg" style={{color:"#F59E0B"}}>{new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(totalCost)}</div>
                    <div style={{fontSize:12,color:"#334155",marginTop:4}}>somma costi per singola radio</div>
                  </div>
                  <div className="rr-card-sm">
                    <div className="rr-lbl-xs" style={{color:"#334155",marginBottom:8}}>COSTO PER 100 PERSONE RAGGIUNTE</div>
                    <div className="rr-n-lg" style={{color:cppColor}}>{new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(cpp100Val)}</div>
                    <div style={{fontSize:12,color:"#334155",marginTop:4}}>€ ogni 100 persone uniche raggiunte</div>
                  </div>
                </div>
                {/* Radio cards */}
                <div className="rr-rcards">
                  {valResults.map((r,i)=>{
                    const p=paramsMap[r.radio.id]||{giorni:13,spots:12};
                    const rCpp=rCpp100(r.reachC,r.cost);
                    const rCppC=rCpp<5?"#34D399":rCpp<15?"#F59E0B":"#F472B6";
                    return(
                      <div key={r.radio.id} className="rr-card-sm" style={{border:`1px solid ${RADIO_ACCENT[i]}25`}}>
                        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                          <div style={{width:7,height:7,borderRadius:"50%",background:RADIO_ACCENT[i]}}/>
                          <div style={{fontSize:13,fontWeight:600,color:RADIO_ACCENT[i]}}>{r.radio.name}{r.radio.unverified&&<span style={{fontSize:11,color:"#FB923C",marginLeft:3}}>*</span>}</div>
                        </div>
                        <div className="rr-pr-params">
                          <div className="rr-pr-row">
                            <span className="rr-pr-lbl">Giorni</span>
                            <div className="rr-pr-ctrl">
                              <button onClick={()=>updateParam(r.radio.id,"giorni",-1)} style={{borderColor:RADIO_ACCENT[i]+"30"}}>−</button>
                              <span className="rr-pr-val">{p.giorni}</span>
                              <button onClick={()=>updateParam(r.radio.id,"giorni",+1)} style={{borderColor:RADIO_ACCENT[i]+"30"}}>+</button>
                            </div>
                          </div>
                          <div className="rr-pr-row">
                            <span className="rr-pr-lbl">Spot/die</span>
                            <div className="rr-pr-ctrl">
                              <button onClick={()=>updateParam(r.radio.id,"spots",-1)} style={{borderColor:RADIO_ACCENT[i]+"30"}}>−</button>
                              <span className="rr-pr-val">{p.spots}</span>
                              <button onClick={()=>updateParam(r.radio.id,"spots",+1)} style={{borderColor:RADIO_ACCENT[i]+"30"}}>+</button>
                            </div>
                          </div>
                        </div>
                        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4}}>
                          <div className="rr-kv"><span className="rr-kv-k">Reach stimata</span><span className="rr-kv-v">{fmtN(r.reachC)}</span></div>
                          <div className="rr-kv"><span className="rr-kv-k">P(sentire spot)</span><span className="rr-kv-v">{(r.ps*100).toFixed(0)}%</span></div>
                          <div className="rr-kv"><span className="rr-kv-k">Copertura</span><span className="rr-kv-v">{((r.reachC/P_RADIO)*100).toFixed(1)}%</span></div>
                          <div className="rr-kv"><span className="rr-kv-k">Costo campagna</span><span className="rr-kv-v" style={r.radio.unverified?{color:"#FB923C"}:{}}>{new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(r.cost)}{r.radio.unverified&&" *"}</span></div>
                          <div className="rr-kv"><span className="rr-kv-k">CPP × 100</span><span className="rr-kv-v" style={{color:rCppC}}>{new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(rCpp)}</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Comparison charts */}
                {valResults.length>1&&(
                  <div className="rr-g2">
                    <div className="rr-card">
                      <div className="rr-lbl-sec">Reach per Radio</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={reachBarData} barSize={30} margin={{top:4,right:4,left:0,bottom:4}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#131d35" vertical={false}/>
                          <XAxis dataKey="name" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                          <Tooltip contentStyle={ttChartStyle} formatter={(v: any)=>[fmtN(v),"Reach"]}/>
                          <Bar dataKey="reach" radius={[4,4,0,0]}>
                            {reachBarData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="rr-card">
                      <div className="rr-lbl-sec">Costo × 100 Persone (CPP100)</div>
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={reachBarData} barSize={30} margin={{top:4,right:4,left:0,bottom:4}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#131d35" vertical={false}/>
                          <XAxis dataKey="name" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>"€"+v.toFixed(2)}/>
                          <Tooltip contentStyle={ttChartStyle} formatter={(v: any)=>[new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v as number),"CPP×100"]}/>
                          <Bar dataKey="cpp" radius={[4,4,0,0]}>
                            {reachBarData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="rr-card" style={{fontSize:12,color:"#334155",lineHeight:1.6}}>
                  <span style={{color:"#F59E0B",fontWeight:600}}>Metodologia · </span>Modello geometrico reach (n giorni). P(spot)=1-(1-T/H)^S. Deduplicazione multi-radio: indipendenza delle audience. CPP100 = costo totale / reach × 100.
                  <span style={{color:"#FB923C"}}> · * costi non verificati</span>
                </div>
                <button className="btn" onClick={()=>setImportOpen(true)} style={{background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",padding:"10px 22px",borderRadius:10,fontSize:14,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",boxShadow:"0 2px 8px rgba(37,99,235,.25)"}}>
                  📊 Importa nei Costi Marketing
                </button>
              </div>
            ):(
              /* SIMULATORE */
              !simMatrix?null:(
              <div className="rr-sec">
                <div>
                  <div className="rr-stitle">Simulatore Scenari</div>
                  <div className="rr-ssub">{selected.map(r=>r.name).join(" + ")}</div>
                </div>
                {/* Curva accumulo */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">Curva di Accumulo Reach · 1→30 giorni · 10, 12, 15 spot/die</div>
                  <div style={{fontSize:12,color:"#334155",marginBottom:12}}>Tre scenari sovrapposti: vedi l'impatto del numero di spot sulla reach accumulata.</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={accumCurveData} margin={{top:4,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false} tickFormatter={(v: string)=>["1g","5g","7g","10g","13g","20g","25g","30g"].includes(v)?v:""}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                      <Tooltip contentStyle={ttChartStyle} formatter={(v: any,name: string)=>[fmtN(v),name]} labelFormatter={(l: string)=>`Giorno ${l}`}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"11px"}}/>
                      {[{key:"10sp",color:"#475569",label:"10 spot/die"},{key:"12sp",color:"#F59E0B",label:"12 spot/die"},{key:"15sp",color:"#34D399",label:"15 spot/die"}].map(({key,color,label})=>(
                        <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={key==="12sp"?2.5:1.8} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Heatmap */}
                <div className="rr-card" style={{overflowX:"auto"}}>
                  <div className="rr-htbl-hdr">
                    <div className="rr-lbl-sec" style={{marginBottom:0}}>{heatMode==="reach"?"Heatmap · Reach · spot/die × giorni":"Heatmap · CPP×100 · spot/die × giorni"}</div>
                    <div style={{display:"flex",gap:5}}>
                      <button className="rr-tog-btn" style={{color:heatMode==="reach"?"#F59E0B":"#475569"}} onClick={()=>setHeatMode("reach")}>Reach</button>
                      <button className="rr-tog-btn" style={{color:heatMode==="cpp"?"#F59E0B":"#475569"}} onClick={()=>setHeatMode("cpp")}>CPP×100</button>
                    </div>
                  </div>
                  <table className="rr-htbl">
                    <thead>
                      <tr>
                        <th style={{color:"#334155"}}>↓ giorni · spot →</th>
                        {R_SPOT_RANGE.map(s=><th key={s} style={{color:"#F59E0B"}}>{s} spot</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {R_GIORNI_RANGE.map(g=>(
                        <tr key={g}>
                          <td className="rr-hd" style={{color:"#F59E0B"}}>{g} giorni</td>
                          {R_SPOT_RANGE.map(s=>{
                            const v=simMatrix.cells[`${g}_${s}`];
                            const cp=simMatrix.cppCells[`${g}_${s}`];
                            const bg=rHeatColor(v,simMatrix.mn,simMatrix.mx);
                            const hi=v>(simMatrix.mn+simMatrix.mx)/2;
                            return(
                              <td key={s} className="rr-hcell" style={{background:bg}}>
                                <div className="rr-hcell-v" style={{color:hi?"#fff":"#cbd5e1"}}>{heatMode==="reach"?fmtN(v):new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(cp)}</div>
                                <div className="rr-hcell-p" style={{color:hi?"#fcd34d":"#64748B"}}>{heatMode==="reach"?((v/P_RADIO)*100).toFixed(1)+"%":"×100pp"}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Curva Reach per spot */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">Curva di Reach · durata × numero di spot</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={simChartData} margin={{top:8,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:13}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                      <Tooltip contentStyle={ttChartStyle} formatter={(v: any,name: string)=>[fmtN(v),name]}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"11px"}}/>
                      {R_SPOT_RANGE.map((s,i)=>(
                        <Line key={s} type="monotone" dataKey={`${s}s`} name={`${s} spot`} stroke={R_LINE_COLORS[i]} strokeWidth={s===12?2.5:1.5} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Curva CPP100 */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">CPP×100 · costo per 100 persone raggiunte</div>
                  <div style={{fontSize:12,color:"#334155",marginBottom:12}}>Più la linea scende, più la campagna è efficiente.</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={simCppData} margin={{top:8,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:13}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>"€"+v.toFixed(2)}/>
                      <Tooltip contentStyle={ttChartStyle} formatter={(v: any,name: string)=>[new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v as number),name]}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"11px"}}/>
                      {R_SPOT_RANGE.map((s,i)=>(
                        <Line key={s} type="monotone" dataKey={`${s}s`} name={`${s} spot`} stroke={R_LINE_COLORS[i]} strokeWidth={s===12?2.5:1.5} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Scenario summary */}
                <div className="rr-card-dark rr-g3">
                  {[{label:"Scenario Minimo",sub:"10 spot · 10 giorni",key:"10_10"},{label:"Scenario Base",sub:"12 spot · 13 giorni",key:"13_12",on:true},{label:"Scenario Massimo",sub:"15 spot · 14 giorni",key:"14_15"}].map(sc=>(
                    <div key={sc.key} className="rr-sstat">
                      <div className="rr-sstat-lbl" style={sc.on?{color:"#F59E0B"}:{}}>{sc.label}</div>
                      <div className="rr-sstat-sub">{sc.sub}</div>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:600,color:sc.on?"#fff":"#475569"}}>{fmtN(simMatrix.cells[sc.key]||0)}</div>
                    </div>
                  ))}
                </div>
              </div>)
            )}
          </main>
        </div>
      </div>
      {importOpen && <ImportToMarketingModal items={buildImportItems()} onClose={()=>setImportOpen(false)} onDone={()=>{setImportOpen(false);showToast("Radio importata nei Costi Marketing!");}} title="Importa campagna Radio"/>}
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════
// TAB STAMPA
// ═══════════════════════════════════════════════════════════════
const S_ACCENT = ["#F59E0B","#34D399","#60A5FA","#F472B6"];
const S_USCITE_CURVE = Array.from({length:20},(_,i)=>i+1);
const S_SIM_CADENZE = [
  {key:"3s",label:"3/sett (L-M-V)",days:["lun","mer","ven"] as SDay[]},
  {key:"2s",label:"2/sett (M-G)",  days:["mar","gio"] as SDay[]},
  {key:"1s",label:"1/sett (Mer)",  days:["mer"] as SDay[]},
];
const S_SIM_COLORS = ["#34D399","#60A5FA","#475569"];
const S_USCITE_HEAT = [1,2,3,5,7,10,12,15,20];
const S_LINE_COLORS = ["#475569","#60A5FA","#F59E0B","#34D399","#F472B6","#a78bfa"];

function StampaTab({ showToast }: { showToast: (m: string)=>void }) {
  const [mode, setMode] = useState<"valutazione"|"simulatore">("valutazione");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [paramsMap, setParamsMap] = useState<Record<number, {dfc: SDfc}>>({});
  const [withDigital, setWithDigital] = useState(false);
  const [heatMode, setHeatMode] = useState<"reach"|"cpp">("reach");
  const [importOpen, setImportOpen] = useState(false);

  const selectedTestate = STAMPA_TESTATE.filter(t=>selectedIds.includes(t.id));

  const toggleTestata = (id: number) => {
    setSelectedIds(prev=>{
      if(prev.includes(id)){setParamsMap(pm=>{const n={...pm};delete n[id];return n;});return prev.filter(x=>x!==id);}
      if(prev.length>=4) return prev;
      setParamsMap(pm=>({...pm,[id]:{dfc:sEmptyDfc()}}));
      return [...prev,id];
    });
  };
  const updateCell = (id: number, day: SDay, fKey: SFormatKey, delta: number) => {
    setParamsMap(pm=>{
      const cur=pm[id]||{dfc:sEmptyDfc()};
      const n=Math.min(10,Math.max(0,(cur.dfc[day]?.[fKey]||0)+delta));
      return{...pm,[id]:{...cur,dfc:{...cur.dfc,[day]:{...cur.dfc[day],[fKey]:n}}}};
    });
  };
  const resetTestata = (id: number) => setParamsMap(pm=>({...pm,[id]:{dfc:sEmptyDfc()}}));

  const valResults = useMemo(()=>selectedTestate.map(t=>{
    const p=paramsMap[t.id]||{dfc:sEmptyDfc()};
    const N=sTotalN(p.dfc);
    const rC=stampaReachCartaDfc(t,p.dfc);
    const rT=stampaReachTotaleDfc(t,p.dfc);
    const costo=stampaCostoTestata(t,p.dfc);
    const vis=sAvgVisWeight(p.dfc);
    const fSummary=STAMPA_FORMATS.map(f=>({...f,count:S_DAYS.reduce((s,d)=>s+(p.dfc[d]?.[f.key as SFormatKey]||0),0)})).filter(f=>f.count>0);
    return{testata:t,p,N,rC,rT,costo,vis,fSummary};
  }),[selectedTestate,paramsMap]);

  function combineResults(results: typeof valResults, useTotal: boolean): number {
    if(!results.length) return 0;
    let tot=useTotal?results[0].rT:results[0].rC;
    for(let i=1;i<results.length;i++){const rB=useTotal?results[i].rT:results[i].rC;tot=tot+rB-(tot/P_STAMPA)*rB;}
    return tot;
  }
  const totRC=useMemo(()=>combineResults(valResults,false),[valResults]);
  const totRT=useMemo(()=>combineResults(valResults,true),[valResults]);
  const totCK=useMemo(()=>valResults.reduce((s,r)=>s+r.costo.known,0),[valResults]);
  const totCU=useMemo(()=>valResults.some(r=>r.costo.hasUnknown),[valResults]);
  const dispR=withDigital?totRT:totRC;
  const totCpp=totCU||totCK===0?NaN:sCpp100(dispR,totCK);
  const cppCol=isNaN(totCpp)?"#FB923C":totCpp<5?"#34D399":totCpp<15?"#F59E0B":"#F472B6";

  const barData=valResults.map((r,i)=>({
    name:r.testata.shortName,
    reach:Math.round(withDigital?r.rT:r.rC),
    cpp:r.costo.known===0?0:parseFloat(sCpp100(withDigital?r.rT:r.rC,r.costo.known).toFixed(3)),
    color:S_ACCENT[i],
  }));

  // Simulatore data
  const accumByFormat=useMemo(()=>{
    if(!selectedTestate.length) return [];
    return S_USCITE_CURVE.map(n=>{
      const e: Record<string,any>={label:`${n}`};
      STAMPA_FORMATS.forEach(f=>{
        const pp=Math.ceil(n/3);
        e[f.key]=Math.round(sCombinedReachUniform(selectedTestate,sUniformDfc(["lun","mer","ven"],pp,f.key as SFormatKey),withDigital));
      });
      return e;
    });
  },[selectedTestate,withDigital]);

  const accumByCadenza=useMemo(()=>{
    if(!selectedTestate.length) return [];
    return S_USCITE_CURVE.map(n=>{
      const e: Record<string,any>={label:`${n}`};
      S_SIM_CADENZE.forEach(c=>{
        const pp=Math.ceil(n/c.days.length);
        e[c.key]=Math.round(sCombinedReachUniform(selectedTestate,sUniformDfc(c.days,pp,"intera"),withDigital));
      });
      return e;
    });
  },[selectedTestate,withDigital]);

  const simHeatData=useMemo(()=>{
    if(!selectedTestate.length) return null;
    const cells: Record<string,number>={}, cppCells: Record<string,number>={};
    let mn=Infinity,mx=-Infinity;
    S_USCITE_HEAT.forEach(n=>STAMPA_FORMATS.forEach(f=>{
      const pp=Math.ceil(n/3);
      const dfc=sUniformDfc(["lun","mer","ven"],pp,f.key as SFormatKey);
      const v=Math.round(sCombinedReachUniform(selectedTestate,dfc,withDigital));
      const c=selectedTestate.reduce((s,t)=>{const cost=t.costPerUscita[f.key as SFormatKey];return s+(cost!=null?cost*n:0);},0);
      const k=`${n}_${f.key}`;
      cells[k]=v; cppCells[k]=sCpp100(v,c);
      if(v<mn)mn=v; if(v>mx)mx=v;
    }));
    return{cells,cppCells,mn,mx};
  },[selectedTestate,withDigital]);

  const cppByFormat=useMemo(()=>{
    if(!selectedTestate.length) return [];
    return S_USCITE_CURVE.map(n=>{
      const e: Record<string,any>={label:`${n}`};
      STAMPA_FORMATS.forEach(f=>{
        const pp=Math.ceil(n/3);
        const r=sCombinedReachUniform(selectedTestate,sUniformDfc(["lun","mer","ven"],pp,f.key as SFormatKey),withDigital);
        const c=selectedTestate.reduce((s,t)=>{const cost=t.costPerUscita[f.key as SFormatKey];return s+(cost!=null?cost*n:0);},0);
        e[f.key]=parseFloat(sCpp100(r,c).toFixed(3));
      });
      return e;
    });
  },[selectedTestate,withDigital]);

  const buildImportItems = (): ImportItem[] => {
    return valResults.map(r=>{
      const abbr=STAMPA_ABBR[r.testata.name]||r.testata.shortName;
      const fDesc=r.fSummary.map(f=>`${f.count}×${f.shortLabel}`).join(", ");
      return{descrizione:abbr+(fDesc?" "+fDesc:""),tipologia:"Stampa",brand:"",spesa:r.costo.known};
    });
  };

  const ttCS={background:"#101929",border:"1px solid #1a2540",borderRadius:"8px",color:"#fff",fontSize:"11px",fontFamily:"'JetBrains Mono',monospace"};
  const KU=["1","3","5","7","10","15","20"];

  return (
    <div>
      <style>{DARK_CSS}</style>
      <div className="rr-root">
        <header className="rr-hdr">
          <div>
            <div className="rr-logo">📰 Stampa Reach Estimator<span className="rr-badge" style={{background:"#34D39920",color:"#34D399"}}>ROMA</span></div>
            <div className="rr-sub">ADS/AGCOM 2024 · Audipress 2025/I · Universo Roma 14+ = 3.744.000 · <span style={{color:"#FB923C"}}>* stime non verificate</span></div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" as const}}>
            <div className="rr-dig-tog" onClick={()=>setWithDigital(v=>!v)}>
              <div className="rr-dsw" style={withDigital?{background:"#34D39940",borderColor:"#34D39980"}:{}}><div className="rr-dknob" style={withDigital?{background:"#34D399",left:17}:{}}/></div>
              <span style={{fontSize:13,color:withDigital?"#34D399":"#64748B"}}>{withDigital?"+ Digitale ON":"Solo Carta"}</span>
            </div>
            <div className="rr-mode-btns">
              {(["valutazione","simulatore"] as const).map(m=>(
                <button key={m} className="rr-mbtn" style={{background:mode===m?"#d1fae5":"#fff",color:mode===m?"#065f46":"#475569",border:mode===m?"1px solid #6ee7b7":"1px solid #e2e8f0"}} onClick={()=>setMode(m)}>
                  {m==="valutazione"?"📋 Valutazione":"🔬 Simulatore"}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="rr-body">
          {/* Sidebar */}
          <aside className="rr-sidebar">
            <div className="rr-sb-hdr" style={{color:"#34D399"}}><span>Testata</span><span style={{color:"#334155",fontWeight:400}}>{selectedIds.length}/4</span></div>
            {STAMPA_TESTATE.map(t=>{
              const isSel=selectedIds.includes(t.id);
              const ci=selectedIds.indexOf(t.id);
              const isDis=!isSel&&selectedIds.length>=4;
              return(
                <button key={t.id} disabled={isDis} onClick={()=>toggleTestata(t.id)} className="rr-rbtn"
                  style={{border:isSel?`1px solid ${S_ACCENT[ci]}80`:"1px solid #e2e8f0",background:isSel?"#d1fae5":"#fff",opacity:isDis?.35:1}}>
                  <div className="rr-rdot" style={{background:isSel?"#059669":"#cbd5e1"}}/>
                  <div>
                    <div className="rr-tname" style={{color:isSel?"#065f46":"#374151"}}>{t.name}</div>
                    <div className="rr-tsub">~{fmtN(t.copieRoma)} copie/die <span style={{color:"#FB923C"}}>*</span></div>
                    <div className="rr-tsub">×{t.moltiplicatoreC} → ~{fmtN(t.copieRoma*t.moltiplicatoreC)} lett.</div>
                    <div className="rr-tsub" style={{fontStyle:"italic"}}>{t.note}</div>
                    <div className="rr-tsub" style={{marginTop:3}}>{sAvailFormats(t).map(f=><span key={f.key} style={{color:f.color,marginRight:3,fontSize:13}}>{f.icon}</span>)}</div>
                  </div>
                </button>
              );
            })}
          </aside>
          {/* Main */}
          <main className="rr-main">
            {!selectedTestate.length?(
              <div className="rr-empty"><div style={{fontSize:48}}>📰</div><div style={{fontFamily:"Syne,sans-serif",fontSize:"15px",color:"#64748B"}}>Seleziona almeno una testata</div></div>
            ):mode==="valutazione"?(
              <div className="rr-sec">
                <div className="rr-stitle">Valutazione Campagna</div>
                <div style={{fontSize:13,color:"#334155"}}>Griglia <strong style={{color:"#64748B"}}>Giorno × Formato</strong>: inserisci le uscite per ogni combinazione. Puoi usare formati diversi nella stessa testata, anche nello stesso giorno.</div>
                {/* Hero */}
                <div className="rr-card-hero">
                  <div className="rr-hero-glow" style={{background:"radial-gradient(circle,#34D39912,transparent 70%)"}}/>
                  <div className="rr-lbl-xs" style={{color:"#34D399",marginBottom:5}}>REACH TOTALE · {withDigital?"CARTA + DIGITALE":"SOLO CARTA"}</div>
                  <div className="rr-n-hero">{fmtN(dispR)}</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:4}}>persone uniche · {pctOf(dispR,P_STAMPA)} della provincia di Roma</div>
                  {withDigital&&<div style={{display:"flex",gap:6,marginTop:5}}>
                    <span style={{padding:"2px 7px",borderRadius:5,fontSize:12,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",background:"#34D39915",color:"#34D399",border:"1px solid #34D39930"}}>Carta: {fmtN(totRC)}</span>
                    <span style={{padding:"2px 7px",borderRadius:5,fontSize:12,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",background:"#60A5FA15",color:"#60A5FA",border:"1px solid #60A5FA30"}}>+Dig: {fmtN(totRT)}</span>
                  </div>}
                  <div className="rr-prog-track"><div className="rr-prog-bar" style={{width:`${Math.min((dispR/P_STAMPA)*100,100)}%`,background:"linear-gradient(90deg,#059669,#34D399)"}}/></div>
                </div>
                {/* Budget + CPP */}
                <div className="rr-g2">
                  <div className="rr-card-sm">
                    <div className="rr-lbl-xs" style={{color:"#334155",marginBottom:6}}>BUDGET TOTALE</div>
                    <div className="rr-n-lg" style={{color:"#34D399"}}>{new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(totCK)}{totCU&&<span style={{color:"#FB923C",fontSize:14}}> + ?</span>}</div>
                    <div style={{fontSize:12,color:"#334155",marginTop:3}}>somma per testata</div>
                  </div>
                  <div className="rr-card-sm">
                    <div className="rr-lbl-xs" style={{color:"#334155",marginBottom:6}}>COSTO PER 100 PERSONE</div>
                    <div className="rr-n-lg" style={{color:cppCol}}>{isNaN(totCpp)||totCpp===0?"N/D":new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(totCpp)}</div>
                    <div style={{fontSize:12,color:"#334155",marginTop:3}}>{withDigital?"carta+digitale":"solo carta"}{totCU&&<span style={{color:"#FB923C"}}> · costi parziali</span>}</div>
                  </div>
                </div>
                {/* Testata cards */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:12}}>
                  {valResults.map((r,i)=>{
                    const t=r.testata, p=r.p;
                    const avFmts=sAvailFormats(t);
                    const rD=withDigital?r.rT:r.rC;
                    const cppVal=r.costo.known===0?NaN:sCpp100(rD,r.costo.known);
                    const cppC=isNaN(cppVal)?"#FB923C":cppVal<5?"#34D399":cppVal<15?"#F59E0B":"#F472B6";
                    return(
                      <div key={t.id} className="rr-card-sm" style={{border:`1px solid ${S_ACCENT[i]}25`}}>
                        <div className="rr-card-hdr">
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:S_ACCENT[i]}}/>
                            <div style={{fontSize:13,fontWeight:600,color:S_ACCENT[i]}}>{t.name}</div>
                            {r.N>0&&<div style={{fontSize:12,color:"#334155"}}>· {r.N} usc.</div>}
                          </div>
                          <button className="rr-reset-btn" onClick={()=>resetTestata(t.id)}>↺ reset</button>
                        </div>
                        {/* Day×Format grid */}
                        <table className="rr-dftbl">
                          <thead>
                            <tr>
                              <th className="rr-day-h"/>
                              {avFmts.map(f=>{
                                const tot=S_DAYS.reduce((s,d)=>s+(p.dfc[d]?.[f.key as SFormatKey]||0),0);
                                return(
                                  <th key={f.key} style={{color:tot>0?f.color:"#475569"}}>
                                    <span style={{fontSize:13}}>{f.icon}</span><br/>{f.shortLabel}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {S_DAYS.map(day=>{
                              const w=t.dayWeights[day];
                              const isZero=w===0;
                              const isHi=w>1;
                              const rowTot=avFmts.reduce((s,f)=>s+(p.dfc[day]?.[f.key as SFormatKey]||0),0);
                              return(
                                <tr key={day}>
                                  <td className="rr-day-td" style={rowTot>0?{color:"#34D399"}:{}}>
                                    {S_DAY_LABELS[day]}
                                    <span className="rr-day-w" style={isZero?{}:{color:isHi?"#F59E0B":"#334155"}}>
                                      {isZero?"—":`×${w.toFixed(1)}`}
                                    </span>
                                  </td>
                                  {avFmts.map(f=>{
                                    const n=p.dfc[day]?.[f.key as SFormatKey]||0;
                                    return(
                                      <td key={f.key} className={`rr-dfcell${isZero?" na-day":""}${n>0?" active":""}`}
                                        style={n>0?{borderColor:`${f.color}60`,background:`${f.color}08`}:{}}>
                                        {isZero?(
                                          <div style={{fontSize:11,color:"#1e2d45",padding:"3px 0"}}>—</div>
                                        ):(
                                          <>
                                            <button className="rr-dc-btn" disabled={n>=10} onClick={()=>updateCell(t.id,day,f.key as SFormatKey,+1)} style={{color:n<10?"#1e2d45":"#0f1d30"}}>+</button>
                                            <div className="rr-dc-n" style={n>0?{color:f.color}:{}}>{n>0?n:"·"}</div>
                                            <button className="rr-dc-btn" disabled={n<=0} onClick={()=>updateCell(t.id,day,f.key as SFormatKey,-1)} style={{color:n>0?"#F472B6":"#0f1d30"}}>−</button>
                                          </>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {/* Format pills */}
                        {r.fSummary.length>0&&(
                          <div className="rr-fmt-pills">
                            {r.fSummary.map(f=>(
                              <span key={f.key} className="rr-fmt-pill" style={{background:`${f.color}12`,color:f.color,borderColor:`${f.color}30`}}>{f.icon} {f.shortLabel} ×{f.count}</span>
                            ))}
                            <span className="rr-fmt-pill" style={{background:"#34D39910",color:"#34D399",borderColor:"#34D39930"}}>vis ×{r.N>0?r.vis.toFixed(2):"—"}</span>
                          </div>
                        )}
                        {/* Results */}
                        {r.N>0&&(
                          <div className="rr-res-block">
                            <div className="rr-kv"><span className="rr-kv-k">Reach carta</span><span className="rr-kv-v">{fmtN(r.rC)}</span></div>
                            {withDigital&&<div className="rr-kv"><span className="rr-kv-k">Reach +digitale</span><span className="rr-kv-v">{fmtN(r.rT)}</span></div>}
                            <div className="rr-kv"><span className="rr-kv-k">Copertura</span><span className="rr-kv-v">{pctOf(rD,P_STAMPA)}</span></div>
                            <div className="rr-kv"><span className="rr-kv-k">Costo campagna</span><span className="rr-kv-v">{r.costo.known===0?"—":new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(r.costo.known)}</span></div>
                            <div className="rr-kv"><span className="rr-kv-k">CPP×100</span><span className="rr-kv-v" style={{color:cppC}}>{isNaN(cppVal)||cppVal===0?"N/D":new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(cppVal)}</span></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Bar charts */}
                {valResults.length>1&&(
                  <div className="rr-g2">
                    <div className="rr-card">
                      <div className="rr-lbl-sec">Reach per Testata</div>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={barData} barSize={28} margin={{top:4,right:4,left:0,bottom:4}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#131d35" vertical={false}/>
                          <XAxis dataKey="name" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                          <Tooltip contentStyle={ttCS} formatter={(v: any)=>[fmtN(v),"Reach"]}/>
                          <Bar dataKey="reach" radius={[4,4,0,0]}>{barData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="rr-card">
                      <div className="rr-lbl-sec">CPP×100 per Testata</div>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={barData.filter(d=>d.cpp>0)} barSize={28} margin={{top:4,right:4,left:0,bottom:4}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#131d35" vertical={false}/>
                          <XAxis dataKey="name" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>"€"+v.toFixed(1)}/>
                          <Tooltip contentStyle={ttCS} formatter={(v: any)=>[new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v as number),"CPP×100"]}/>
                          <Bar dataKey="cpp" radius={[4,4,0,0]}>{barData.map((d,i)=><Cell key={i} fill={d.color}/>)}</Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div className="rr-card" style={{fontSize:12,color:"#334155",lineHeight:1.7}}>
                  <span style={{color:"#34D399",fontWeight:600}}>Metodologia · </span>Modello B (abituali 59% p=5.5/7, occasionali 41% p=2/7). Visibilità = media ponderata pesi formato. Peso giornaliero = media ponderata giorni con uscite. Deduplicazione multi-testata per indipendenza delle audience.
                  <span style={{color:"#FB923C"}}> · * stime non verificate</span>
                </div>
                <button className="btn" onClick={()=>setImportOpen(true)} style={{background:"#1e293b",color:"#fff",padding:"10px 20px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                  📊 Importa nei Costi Marketing
                </button>
              </div>
            ):(
              /* SIMULATORE */
              !simHeatData?null:(
              <div className="rr-sec">
                <div>
                  <div className="rr-stitle">Simulatore Scenari</div>
                  <div className="rr-ssub">{selectedTestate.map(t=>t.shortName).join(" + ")} · {withDigital?"Carta+Digitale":"Solo Carta"}</div>
                </div>
                {/* Pesi visibilità */}
                <div className="rr-card">
                  <div className="rr-lbl-sec" style={{marginBottom:7}}>Pesi Visibilità Formati</div>
                  <div className="rr-vis-legend">
                    {STAMPA_FORMATS.map(f=>(
                      <div key={f.key} className="rr-vp" style={{borderColor:`${f.color}40`,color:f.color}}>
                        <span>{f.icon}</span>
                        <span style={{color:"#64748B",fontFamily:"'DM Sans',sans-serif",fontSize:12}}>{f.label}</span>
                        <span>×{f.visWeight.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:"#334155",lineHeight:1.6}}>La visibilità dipende dalla prossimità editoriale e dall'ergonomia di lettura.</div>
                </div>
                {/* Reach per Formato */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">Reach per Formato · cadenza 3/sett (L-M-V)</div>
                  <ResponsiveContainer width="100%" height={190}>
                    <LineChart data={accumByFormat} margin={{top:4,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false} tickFormatter={(v: string)=>KU.includes(v)?`${v}u`:""}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                      <Tooltip contentStyle={ttCS} formatter={(v: any,n: string)=>[fmtN(v),n]} labelFormatter={(l: string)=>`Uscita n.${l}`}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"10px"}}/>
                      {STAMPA_FORMATS.map(f=>(
                        <Line key={f.key} type="monotone" dataKey={f.key} name={f.label} stroke={f.color} strokeWidth={f.key==="doppia"?2.5:1.6} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Reach per Cadenza */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">Reach per Cadenza · formato Pagina Intera</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={accumByCadenza} margin={{top:4,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false} tickFormatter={(v: string)=>KU.includes(v)?`${v}u`:""}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>(v/1000).toFixed(0)+"k"}/>
                      <Tooltip contentStyle={ttCS} formatter={(v: any,n: string)=>[fmtN(v),n]}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"10px"}}/>
                      {S_SIM_CADENZE.map((c,i)=>(
                        <Line key={c.key} type="monotone" dataKey={c.key} name={c.label} stroke={S_SIM_COLORS[i]} strokeWidth={i===0?2.5:1.6} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Heatmap */}
                <div className="rr-card" style={{overflowX:"auto"}}>
                  <div className="rr-htbl-hdr">
                    <div className="rr-lbl-sec" style={{marginBottom:0}}>{heatMode==="reach"?"Heatmap · Reach":"Heatmap · CPP×100"} · uscite × formato · cadenza 3/sett</div>
                    <div style={{display:"flex",gap:5}}>
                      <button className="rr-tog-btn" style={{color:heatMode==="reach"?"#34D399":"#475569"}} onClick={()=>setHeatMode("reach")}>Reach</button>
                      <button className="rr-tog-btn" style={{color:heatMode==="cpp"?"#34D399":"#475569"}} onClick={()=>setHeatMode("cpp")}>CPP×100</button>
                    </div>
                  </div>
                  <table className="rr-htbl">
                    <thead>
                      <tr>
                        <th style={{color:"#334155"}}>↓ usc. · fmt →</th>
                        {STAMPA_FORMATS.map(f=><th key={f.key} style={{color:"#34D399"}}>{f.icon} {f.shortLabel}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {S_USCITE_HEAT.map(n=>(
                        <tr key={n}>
                          <td className="rr-hd" style={{color:"#34D399"}}>{n} usc.</td>
                          {STAMPA_FORMATS.map(f=>{
                            const k=`${n}_${f.key}`;
                            const v=simHeatData.cells[k];
                            const cp=simHeatData.cppCells[k];
                            const bg=stampaHeatColor(v,simHeatData.mn,simHeatData.mx);
                            const hi=v>(simHeatData.mn+simHeatData.mx)/2;
                            return(
                              <td key={f.key} className="rr-hcell" style={{background:bg}}>
                                <div className="rr-hcell-v" style={{color:hi?"#fff":"#cbd5e1"}}>{heatMode==="reach"?fmtN(v):cp>0?new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(cp):"—"}</div>
                                <div className="rr-hcell-p" style={{color:hi?"#d1fae5":"#334155"}}>{heatMode==="reach"?pctOf(v,P_STAMPA):""}</div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* CPP per formato */}
                <div className="rr-card">
                  <div className="rr-lbl-sec">CPP×100 per Formato · la Doppia rende davvero di più?</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={cppByFormat} margin={{top:8,right:16,left:0,bottom:4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#131d35"/>
                      <XAxis dataKey="label" tick={{fill:"#334155",fontSize:12}} axisLine={false} tickLine={false} tickFormatter={(v: string)=>KU.includes(v)?`${v}u`:""}/>
                      <YAxis tick={{fill:"#334155",fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v: number)=>"€"+v.toFixed(1)}/>
                      <Tooltip contentStyle={ttCS} formatter={(v: any,n: string)=>[new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",minimumFractionDigits:2}).format(v as number),n]}/>
                      <Legend wrapperStyle={{color:"#475569",fontSize:"10px"}}/>
                      {STAMPA_FORMATS.map(f=>(
                        <Line key={f.key} type="monotone" dataKey={f.key} name={f.label} stroke={f.color} strokeWidth={f.key==="doppia"?2.5:1.6} dot={false}/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Scenario summary */}
                <div className="rr-card-dark rr-g3">
                  {[{label:"Minimo",sub:"3 usc · ½ Bassa",key:"3_mezza"},{label:"Base",sub:"5 usc · Palco",key:"5_palco",on:true},{label:"Massimo",sub:"15 usc · Doppia",key:"15_doppia"}].map(sc=>(
                    <div key={sc.key} className="rr-sstat">
                      <div className="rr-sstat-lbl" style={sc.on?{color:"#34D399"}:{}}>{sc.label}</div>
                      <div className="rr-sstat-sub">{sc.sub}</div>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:15,fontWeight:600,color:sc.on?"#fff":"#475569"}}>{fmtN(simHeatData.cells[sc.key]||0)}</div>
                    </div>
                  ))}
                </div>
              </div>)
            )}
          </main>
        </div>
      </div>
      {importOpen&&<ImportToMarketingModal items={buildImportItems()} onClose={()=>setImportOpen(false)} onDone={()=>{setImportOpen(false);showToast("Stampa importata nei Costi Marketing!");}} title="Importa campagna Stampa"/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB OOH
// ═══════════════════════════════════════════════════════════════
function OOHTab({ showToast }: { showToast: (m: string)=>void }) {
  const [billboards, setBillboards] = useState<any[]>([]);
  const [phase, setPhase] = useState<"upload"|"ready"|"enriching"|"results">("upload");
  const [progress, setProgress] = useState(0);
  const [csvError, setCsvError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file) return;
    setCsvError("");
    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const parsed = oohParseCSV(e.target.result);
        setBillboards(parsed);
        setPhase("ready");
      } catch (err: any) { setCsvError(err.message); }
    };
    reader.readAsText(file);
  }, []);

  const startEnrich = async () => {
    setPhase("enriching"); setProgress(0);
    const updated = [...billboards];
    for (let i=0;i<updated.length;i++) {
      updated[i] = {...updated[i], status:"loading"};
      setBillboards([...updated]);
      try {
        const enriched = await oohEnrichBillboard(updated[i].lat, updated[i].lon, updated[i].ubicazione || updated[i].nome);
        updated[i] = {...updated[i], status:"done", enriched};
      } catch { updated[i] = {...updated[i], status:"error", enriched:null}; }
      setProgress(Math.round(((i+1)/updated.length)*100));
      setBillboards([...updated]);
      if (i<updated.length-1) await sleep(1800); // 1.8s delay to avoid rate limiting
    }
    setPhase("results");
  };

  const reset = () => { setBillboards([]); setPhase("upload"); setProgress(0); setCsvError(""); };

  const done = billboards.filter((b: any)=>b.status==="done"&&b.enriched);
  const totalReach = oohCombinedReach(done.map((b: any)=>({reach:b.enriched.reach,lat:b.lat,lon:b.lon})));
  const nCartelli = done.length;

  // Classify posters
  const posterTotals = useMemo(() => {
    let p3x2=0, pAltri=0, pMaxi=0;
    done.forEach((b: any) => {
      const c = classifyPoster(b.formato || "");
      p3x2 += c.p3x2; pAltri += c.pAltri; pMaxi += c.pMaxi;
    });
    return { p3x2, pAltri, pMaxi };
  }, [done]);

  const buildImportItems = (): ImportItem[] => [{
    descrizione: nCartelli + " poster",
    tipologia: "OOH",
    brand: "",
    spesa: 0,
    poster_3x2: posterTotals.p3x2,
    poster_altri: posterTotals.pAltri,
    poster_maxi: posterTotals.pMaxi,
  }];

  return (
    <div>
      <h2 style={{fontSize:20,fontWeight:700,margin:"0 0 6px",display:"flex",alignItems:"center",gap:8}}>🗺️ OOH Reach Estimator</h2>
      <p style={{fontSize:13,color:"#64748b",margin:"0 0 20px"}}>Carica un CSV con le coordinate dei cartelli · OpenStreetMap</p>

      {phase === "upload" && (
        <div style={{maxWidth:560,margin:"0 auto"}}>
          <div style={{border:"2px dashed #e2e8f0",borderRadius:16,padding:"40px 28px",textAlign:"center",cursor:"pointer",background:"#fafbfc",transition:"all .2s"}}
            onClick={()=>fileRef.current?.click()}
            onDragOver={(e: React.DragEvent)=>{e.preventDefault();}}
            onDrop={(e: React.DragEvent)=>{e.preventDefault();handleFile(e.dataTransfer.files[0])}}>
            <div style={{fontSize:40,marginBottom:10}}>📍</div>
            <div style={{fontSize:15,fontWeight:700,color:"#1e293b",marginBottom:4}}>Carica il CSV dei cartelli</div>
            <div style={{fontSize:12,color:"#64748b"}}>Colonne: Nome/Ubicazione, Lat, Long, Formato · Supporta il formato modello_indirizzi</div>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={(e: React.ChangeEvent<HTMLInputElement>)=>e.target.files && handleFile(e.target.files[0])}/>
          </div>
          {csvError && <div style={{marginTop:10,padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,color:"#dc2626",fontSize:12}}>⚠ {csvError}</div>}
        </div>
      )}

      {phase === "ready" && (
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <span style={{fontSize:15,fontWeight:700}}>{billboards.length} cartelli caricati</span>
            <div style={{display:"flex",gap:8}}>
              <button className="btn" onClick={reset} style={{background:"#f1f5f9",color:"#475569",padding:"8px 14px",borderRadius:8,fontSize:12,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Ricarica</button>
              <button className="btn" onClick={startEnrich} style={{background:"#059669",color:"#fff",padding:"8px 18px",borderRadius:8,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>🔍 Analizza</button>
            </div>
          </div>
          <div style={{maxHeight:300,overflow:"auto"}}>
            {billboards.map((b: any)=>(
              <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:"1px solid #f1f5f9",fontSize:12}}>
                <span style={{color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace",width:30}}>#{b.id}</span>
                <span style={{flex:1,fontWeight:600,color:"#1e293b"}}>{b.nome}</span>
                <span style={{color:"#94a3b8",fontSize:13}}>{b.formato}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(phase === "enriching" || phase === "results") && (
        <div>
          {phase === "enriching" && (
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#64748b",marginBottom:4}}>
                <span>Interrogo OpenStreetMap... {done.length}/{billboards.length}</span>
                <span style={{color:"#059669"}}>{progress}%</span>
              </div>
              <div style={{background:"#e2e8f0",borderRadius:8,height:8,overflow:"hidden"}}>
                <div style={{background:"#059669",height:"100%",width:progress+"%",transition:"width .4s",borderRadius:8}}/>
              </div>
            </div>
          )}

          {/* Billboard list */}
          <div style={{maxHeight:250,overflow:"auto",marginBottom:16}}>
            {billboards.map((b: any)=>(
              <div key={b.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:"1px solid #f1f5f9",fontSize:12,background:b.status==="done"?"#ecfdf5":b.status==="error"?"#fef2f2":"transparent"}}>
                <span style={{color:"#94a3b8",fontFamily:"'JetBrains Mono',monospace",width:30}}>#{b.id}</span>
                <span style={{flex:1,fontWeight:600,color:"#1e293b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{b.nome}</span>
                {b.enriched && <span style={{fontSize:13,color:"#64748b"}}>{OOH_ROAD_LABEL[b.enriched.roadClass]||""}{b.enriched.estimated?" ~":""}</span>}
                {b.enriched && <span style={{fontSize:12,color:"#059669",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{fmtN(b.enriched.reach)}</span>}
                <span style={{fontSize:12,fontWeight:600,color:b.status==="done"?"#059669":b.status==="error"?"#ef4444":"#94a3b8"}}>{b.status==="done"?"✓":b.status==="loading"?"...":b.status==="error"?"Err":"—"}</span>
              </div>
            ))}
          </div>

          {/* Results */}
          {phase === "results" && done.length > 0 && (
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:14,marginBottom:20}}>
                <div style={kpiStyle("#ecfdf5")}>
                  <div style={{fontSize:28,fontWeight:800,color:"#059669",fontFamily:"'JetBrains Mono',monospace"}}>{fmtN(totalReach)}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#059669"}}>Reach Totale</div>
                  <div style={{fontSize:13,color:"#64748b"}}>{pctOf(totalReach,P_OOH)} della provincia</div>
                </div>
                <div style={kpiStyle("#f8fafc")}>
                  <div style={{fontSize:28,fontWeight:800,color:"#1e293b",fontFamily:"'JetBrains Mono',monospace"}}>{nCartelli}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#64748b"}}>Impianti analizzati</div>
                </div>
                <div style={kpiStyle("#fffbeb")}>
                  <div style={{fontSize:14,fontWeight:700,color:"#ea580c"}}>3x2: {posterTotals.p3x2} · Altri: {posterTotals.pAltri} · Maxi: {posterTotals.pMaxi}</div>
                  <div style={{fontSize:12,fontWeight:600,color:"#f59e0b",marginTop:4}}>Classificazione poster</div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginBottom:16}}>
                <button className="btn" onClick={()=>setImportOpen(true)} style={{background:"#1e293b",color:"#fff",padding:"10px 20px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>
                  📊 Importa nei Costi Marketing
                </button>
                <button className="btn" onClick={reset} style={{background:"#f1f5f9",color:"#475569",padding:"10px 16px",borderRadius:8,fontSize:12,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Nuovo upload</button>
              </div>
            </>
          )}
        </div>
      )}

      {importOpen && <ImportToMarketingModal items={buildImportItems()} onClose={()=>setImportOpen(false)} onDone={()=>{setImportOpen(false);showToast("OOH importata nei Costi Marketing!");}} title="Importa campagna OOH"/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PAGINA PRINCIPALE
// ═══════════════════════════════════════════════════════════════
type ReachTab = "radio" | "stampa" | "ooh";

export default function ReachPage({ onNavigate, unlocked, setUnlocked }: PageProps) {
  const [tab, setTab] = useState<ReachTab>("radio");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const tabs: { key: ReachTab; label: string; icon: string }[] = [
    { key: "radio", label: "Radio", icon: "📻" },
    { key: "stampa", label: "Stampa", icon: "📰" },
    { key: "ooh", label: "OOH", icon: "🗺️" },
  ];

  return (
    <PageShell toast={toast}>
      <NavBar current="reach" onNavigate={onNavigate} unlocked={unlocked} setUnlocked={setUnlocked} />

      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:26,fontWeight:800,margin:0,display:"flex",alignItems:"center",gap:10}}>📡 Reach Estimator</h1>
        <p style={{color:"#64748b",fontSize:14,margin:"6px 0 0"}}>Stima della copertura per campagne Radio, Stampa e OOH</p>
      </div>

      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6,marginBottom:24,background:"#f8fafc",padding:"6px",borderRadius:12,border:"1px solid #e8ecf1",width:"fit-content"}}>
        {tabs.map(t => (
          <button key={t.key} className="btn" onClick={()=>setTab(t.key)}
            style={{padding:"10px 22px",borderRadius:8,fontSize:14,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",
              background:tab===t.key?"#fff":"transparent",color:tab===t.key?"#1e293b":"#64748b",
              boxShadow:tab===t.key?"0 1px 4px rgba(0,0,0,.08)":"none",transition:"all .15s"}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "radio" && <RadioTab showToast={showToast} />}
      {tab === "stampa" && <StampaTab showToast={showToast} />}
      {tab === "ooh" && <OOHTab showToast={showToast} />}
    </PageShell>
  );
}
