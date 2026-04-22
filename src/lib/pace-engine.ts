// PACE — Deterministic engine (Cap. 2 + Cap. 4 logic)
// All training math is here, in code. The LLM only writes textual analysis.

import { estimateHRmax, computeZonesKarvonen } from "./load-model";

export type Sex = "M" | "F";
export type Level = "beginner" | "intermediate" | "advanced";
export type SessionType = "easy" | "quality" | "medium" | "long" | "race" | "freeform";

/**
 * Rationale didattico di una sessione/settimana/piano.
 * Campi opzionali per retrocompatibilità con piani già salvati su DB.
 *
 * Struttura a 3 slot pensata per essere "scansionabile": l'utente può
 * fermarsi al goal (1 riga) o leggere why + howToExecute se vuole capire
 * il razionale fisiologico e come auto-regolarsi durante la sessione.
 */
export interface SessionRationale {
  /** 1 frase: obiettivo fisiologico primario della sessione */
  goal: string;
  /** 2-4 frasi: perché questa sessione serve per la tua distanza gara */
  why: string;
  /** 2-4 frasi: come riconoscere in corso se la sessione sta funzionando */
  howToExecute: string;
}

export interface WeekRationale {
  /** 1 frase: cosa costruisce questa settimana nel macrociclo */
  buildingBlock: string;
  /** 2-3 frasi: perché questa settimana adesso, nel punto del piano in cui sei */
  whyNow: string;
  /** 1-2 frasi: a cosa prestare attenzione durante la settimana */
  expectation: string;
}

export interface PlanPhilosophy {
  /** Nome del modello TID applicato */
  tidModel: "polarized" | "pyramidal" | "hybrid";
  /** Titolo breve: "Modello Polarizzato 80/5/15" */
  title: string;
  /** 3-5 frasi: spiegazione del perché usiamo questo modello per la tua distanza */
  explanation: string;
  /** 1-2 frasi: cosa noterà l'utente scorrendo il piano */
  whatYoullSee: string;
}

export interface Profile {
  age: number;
  weight: number;
  sex: Sex;
  currentBest: number;     // minutes for race distance
  targetTime: number;      // minutes target for race distance
  weeklyFreq: number;
  daysUntilRace: number;
  raceDate?: string | null; // ISO date YYYY-MM-DD
  level: Level;
  raceDistance: number;    // km, default 10
  hrRest?: number | null;  // bpm, optional, defaults to 60 in calculations
  /** Volume settimanale abituale in km. Se null, fallback derivato dal level. */
  weeklyVolume?: number | null;
  /** Lungo più lungo (in minuti) effettivamente fatto nelle ultime 4 settimane. */
  recentLongRun?: number | null;
  /** True se currentBest è stato stimato (utente non ricorda / non ha mai corso). */
  currentBestEstimated?: boolean;
}

/**
 * Stima conservativa del tempo su 10K se l'utente non lo conosce.
 * Tabella ricavata da medie amatoriali (Strava/Garmin) per livello+volume.
 * Output: minuti su 10K.
 */
export function estimateCurrentBestFromLevel(
  level: Level,
  weeklyVolume: number | null | undefined,
  raceDistance: number = 10,
): number {
  const vol = weeklyVolume ?? 0;
  // Tempi indicativi su 10K
  let tenK: number;
  if (level === "beginner") {
    tenK = vol < 20 ? 65 : 58;
  } else if (level === "intermediate") {
    tenK = vol < 30 ? 52 : 48;
  } else {
    tenK = vol < 50 ? 44 : 40;
  }
  // Scala su distanza gara con Riegel (esponente 1.06)
  if (raceDistance === 10 || !raceDistance) return tenK;
  const scaled = tenK * Math.pow(raceDistance / 10, 1.06);
  return Math.round(scaled);
}

/**
 * Calcola la durata del lungo per la settimana corrente, ancorata al lungo
 * recente dell'utente (se noto) e alla frazione di tempo gara stimata come
 * tetto. Progressione lineare lungo le settimane disponibili.
 */
export function computeLongDuration(
  weekIdx: number,
  totalWeeks: number,
  profile: Profile,
): number {
  const currentBest = Math.max(20, profile.currentBest || 60);
  // Punto di partenza: lungo già fatto se noto, altrimenti 45% del current best
  const startBase = profile.recentLongRun != null && profile.recentLongRun > 0
    ? profile.recentLongRun
    : currentBest * 0.45;
  const start = Math.max(30, Math.min(120, startBase));
  // Tetto: 75% del tempo gara, capped a 150', mai sotto 60'
  const target = Math.max(60, Math.min(150, currentBest * 0.75));
  // Se il punto di partenza è già più alto del tetto, manteniamo start (no regresso)
  const top = Math.max(start, target);
  // Progressione lineare
  const denom = Math.max(1, totalWeeks - 1);
  const progress = Math.min(1, Math.max(0, weekIdx / denom));
  const duration = start + (top - start) * progress;
  return Math.round(duration / 5) * 5; // arrotonda a 5'
}

export interface Session {
  name: string;
  type: SessionType;
  duration: number;
  targetHR?: string;
  blocks: string[];
  notes?: string;
  rationale?: SessionRationale;
}

export interface Week {
  theme: string;
  sessions: Session[];
  rationale?: WeekRationale;
}

export type EstimateConfidence = "low" | "medium" | "high";

export interface Plan {
  weeks: Week[];
  target: number;
  adjustedEstimate: number | null;
  estimateLow?: number | null;
  estimateHigh?: number | null;
  estimateConfidence?: EstimateConfidence | null;
  shortPrep?: boolean; // true if < 3 weeks
  veryShortPrep?: boolean; // true if < 2 weeks
  philosophy?: PlanPhilosophy;
}

export interface EstimateDetail {
  estimate: number;          // central minutes
  low: number;               // lower band minutes
  high: number;              // upper band minutes
  confidence: EstimateConfidence;
  usableSessions: number;    // count of sessions with weight >= 0.5
  method: "riegel-hr" | "target-fallback";
}

export interface WorkoutLog {
  id?: string;
  weekIdx?: number | null;
  sessionIdx?: number | null;
  sessionType: SessionType;
  sessionName: string;
  duration: number;
  distance: number;
  hrAvg: number;
  hrMax?: number | null;
  rpe: number;
  cadence?: number | null;
  notes?: string;
  safetyOverridden?: boolean;
  loggedAt?: string;
  skipped?: boolean;
  skipReason?: string | null;
}

export interface Zone {
  name: string;
  description: string;
  range: string;
  highlight: boolean;
}

export interface PlausibilityIssue {
  field: "pace" | "hrAvg" | "hrMax" | "distance" | "duration" | "cadence";
  severity: "warn" | "impossible";
  message: string;
}

export interface PlausibilityResult {
  ok: boolean;
  issues: PlausibilityIssue[];
}

// ---------- ExtractedWorkout (deep extraction from screenshots) ----------
export type SegmentKind = "warmup" | "interval" | "recovery" | "cooldown" | "steady" | "other";

export interface ExtractedSegment {
  idx: number;
  label: string;
  type: SegmentKind;
  durationSec: number | null;
  distanceKm: number | null;
  paceSecPerKm: number | null;
  hrAvg: number | null;
  hrMax: number | null;
}

export interface ExtractedKmSplit {
  km: number;
  paceSecPerKm: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  elevDelta: number | null;
}

export interface ExtractedSeriesPoint {
  tSec: number;
  value: number;
}

export interface ExtractedHrZoneSlice {
  zone: number;
  percent: number;
}

export interface ExtractedTotals {
  duration: number | null;
  distance: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  cadence: number | null;
  calories: number | null;
  elevGain: number | null;
}

export interface ExtractedVisualPatterns {
  hrPattern: "stable" | "creep" | "spiky" | "fading" | null;
  paceStrategy: "even" | "negative-split" | "positive-split" | "intervals" | null;
  observations: string[];
}

export interface ExtractedWorkout {
  totals: ExtractedTotals;
  kmSplits: ExtractedKmSplit[];
  segments: ExtractedSegment[];
  hrSeries: { samplingHintSec: number; points: { tSec: number; hr: number }[] } | null;
  paceSeries: { points: { tSec: number; paceSecPerKm: number }[] } | null;
  hrZones: ExtractedHrZoneSlice[];
  visualPatterns: ExtractedVisualPatterns;
  detectedApp: string | null;
  confidence: "high" | "medium" | "low" | null;
  sourceImagesUsed: number;
  validation?: {
    durationConsistency: "ok" | "mismatch" | "n/a";
    distanceConsistency: "ok" | "mismatch" | "n/a";
    hrAvgConsistency: "ok" | "mismatch" | "n/a";
    notes: string[];
  };
}

// Physiological / common-sense bounds. Anything outside these is either a typo
// or impossible for a human runner. The estimate engine excludes "impossible"
// sessions; the AI coach is told NOT to celebrate them.
//
// Pace floor: world record 100m ≈ 9.58s = 1'36"/km — but sustained over ≥1km
// no human has ever run faster than ~2'10"/km (mile WR pace). We use 2'30"/km
// as the absolute floor: anything faster is a data-entry error.
// Pace ceiling: 15'/km is walking pace, beyond that it's not really running.
const PACE_MIN_SEC_PER_KM = 150; // 2'30"/km
const PACE_MAX_SEC_PER_KM = 900; // 15'/km
const HR_AVG_MIN = 70;
const HR_AVG_MAX = 230;
const HR_MAX_MIN = 100;
const HR_MAX_MAX = 240;
const DISTANCE_MAX_KM = 80; // ultra territory; beyond is likely a typo
const DURATION_MAX_MIN = 600; // 10h cap
const CADENCE_MIN = 100;
const CADENCE_MAX = 240;

export function checkDataPlausibility(log: WorkoutLog): PlausibilityResult {
  const issues: PlausibilityIssue[] = [];

  if (log.distance && log.duration && log.distance > 0) {
    const paceSec = (log.duration / log.distance) * 60;
    if (paceSec < PACE_MIN_SEC_PER_KM) {
      issues.push({
        field: "pace",
        severity: "impossible",
        message: `Passo di ${formatPaceFromSec(paceSec)}/km — non è fisicamente possibile per un essere umano (record mondiali sono > 2'30"/km su distanze ≥ 1km). Probabile errore di inserimento (es: distanza in metri invece di km, o durata invertita).`,
      });
    } else if (paceSec > PACE_MAX_SEC_PER_KM) {
      issues.push({
        field: "pace",
        severity: "warn",
        message: `Passo molto lento (${formatPaceFromSec(paceSec)}/km), più simile a camminata che corsa.`,
      });
    }
  }

  if (log.distance != null && (log.distance < 0 || log.distance > DISTANCE_MAX_KM)) {
    issues.push({
      field: "distance",
      severity: log.distance > DISTANCE_MAX_KM ? "impossible" : "warn",
      message: `Distanza di ${log.distance}km fuori scala.`,
    });
  }

  if (log.duration != null && (log.duration <= 0 || log.duration > DURATION_MAX_MIN)) {
    issues.push({
      field: "duration",
      severity: "impossible",
      message: `Durata di ${log.duration} min fuori scala.`,
    });
  }

  if (log.hrAvg != null && (log.hrAvg < HR_AVG_MIN || log.hrAvg > HR_AVG_MAX)) {
    issues.push({
      field: "hrAvg",
      severity: "warn",
      message: `FC media ${log.hrAvg} bpm fuori dal range plausibile (${HR_AVG_MIN}-${HR_AVG_MAX}).`,
    });
  }

  if (log.hrMax != null && (log.hrMax < HR_MAX_MIN || log.hrMax > HR_MAX_MAX)) {
    issues.push({
      field: "hrMax",
      severity: "warn",
      message: `FC max ${log.hrMax} bpm fuori dal range plausibile.`,
    });
  }

  if (log.hrAvg != null && log.hrMax != null && log.hrAvg > log.hrMax) {
    issues.push({
      field: "hrAvg",
      severity: "warn",
      message: `FC media (${log.hrAvg}) maggiore di FC max (${log.hrMax}) — controlla i dati.`,
    });
  }

  if (log.cadence != null && (log.cadence < CADENCE_MIN || log.cadence > CADENCE_MAX)) {
    issues.push({
      field: "cadence",
      severity: "warn",
      message: `Cadenza ${log.cadence} passi/min fuori dal range tipico (${CADENCE_MIN}-${CADENCE_MAX}).`,
    });
  }

  return { ok: issues.every((i) => i.severity !== "impossible"), issues };
}

function formatPaceFromSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.round(totalSec % 60);
  return `${m}'${s.toString().padStart(2, "0")}"`;
}

export interface ZonesResult {
  hrMax: number;
  hrRest: number;
  zones: Zone[];
  hrMaxSource: "theoretical" | "empirical" | "blended";
  hrMaxConfidence: "low" | "medium" | "high";
  hrMaxSampleSize: number;
}

// ---------- HR zones (Karvonen with empirical HRmax when available) ----------
// Optional `highlightFor`: highlight the zone that matches the given session type.
// easy/freeform → leggera, long → media, medium/race → medio-alta, quality → alta.
// Optional `logs`: when provided, HRmax is estimated from observed peaks (Tanaka + p95 blending).
export function computeZones(
  profile: Profile,
  highlightFor?: SessionType,
  logs?: WorkoutLog[],
): ZonesResult {


  const hrMaxEst = estimateHRmax(
    { age: profile.age, sex: profile.sex, hrRest: profile.hrRest ?? null },
    (logs ?? []).map((l) => ({
      loggedAt: l.loggedAt ?? null,
      duration: l.duration,
      hrAvg: l.hrAvg,
      hrMax: l.hrMax ?? null,
      rpe: l.rpe,
      sessionType: l.sessionType,
      skipped: l.skipped,
    })),
  );

  const hrRestUsed = profile.hrRest != null && profile.hrRest > 0 ? profile.hrRest : 60;
  const zoneSet = computeZonesKarvonen(hrMaxEst.value, hrRestUsed);

  const highlightName = (() => {
    switch (highlightFor) {
      case "easy":
      case "freeform":
        return "Intensità leggera";
      case "long":
        return "Intensità media";
      case "medium":
      case "race":
        return "Intensità medio-alta";
      case "quality":
        return "Intensità alta";
      default:
        return null;
    }
  })();

  const zones: Zone[] = zoneSet.zones.map((z) => ({
    name: z.name,
    description: z.description,
    range: `${z.low}–${z.high}`,
    highlight: highlightName === z.name,
  }));

  return {
    hrMax: hrMaxEst.value,
    hrRest: hrRestUsed,
    zones,
    hrMaxSource: hrMaxEst.source,
    hrMaxConfidence: hrMaxEst.confidence,
    hrMaxSampleSize: hrMaxEst.sampleSize,
  };
}

// ---------- Safety circuit breakers (Cap. 4) ----------
export interface SafetyResult {
  block: boolean;
  allowOverride?: boolean;
  title?: string;
  message?: string;
  details?: string[];
  suggestion?: string;
}

const RED_FLAG_KEYWORDS = [
  "dolore al petto", "dolore petto", "fitta al petto",
  "vertigini", "vertigine", "giramento di testa", "capogiro",
  "svenimento", "svenuto", "sono svenuto",
  "battito irregolare", "palpitazion", "fibrillazion",
  "fiato corto a riposo", "non riesco a respirare",
  "nausea forte", "mi sono sentito male",
  "dolore al braccio", "dolore alla mandibola",
];

export function checkSafetyFlags(
  log: WorkoutLog,
  profile: Profile,
  existingLogs: WorkoutLog[]
): SafetyResult {
  const noteText = (log.notes || "").toLowerCase();
  const detected = RED_FLAG_KEYWORDS.filter((k) => noteText.includes(k));

  if (detected.length > 0) {
    return {
      block: true,
      allowOverride: false,
      title: "Hai segnalato sintomi importanti",
      message:
        "Nelle tue note hai descritto sintomi che richiedono attenzione medica, non un commento da app.",
      details: detected.map((k) => `Hai menzionato: "${k}"`),
      suggestion:
        "Fermati con gli allenamenti e contatta il tuo medico. Se i sintomi sono in corso o gravi, chiama il 118 o vai al pronto soccorso. PACE non può valutare sintomi clinici.",
    };
  }

  if (log.hrMax && log.hrMax > 220) {
    return {
      block: true,
      allowOverride: true,
      title: "Frequenza cardiaca molto alta",
      message: `Hai inserito una FC massima di ${log.hrMax} bpm, oltre le soglie fisiologiche normalmente osservate.`,
      details: [
        "Potrebbe essere un errore del sensore (molto comune)",
        "Potrebbe essere un errore di inserimento",
        "In casi molto rari potrebbe essere un evento da valutare clinicamente",
      ],
      suggestion:
        "Verifica il dato con il tuo strumento. Se il valore è confermato, vale la pena parlarne con un cardiologo prima di continuare con allenamenti intensi.",
    };
  }

  const theoreticalMax = Math.round(208 - 0.7 * profile.age);
  if (log.hrMax && log.hrMax > theoreticalMax + 20) {
    return {
      block: true,
      allowOverride: true,
      title: "FC massima superiore all'atteso",
      message: `${log.hrMax} bpm è sensibilmente più alto della stima teorica per la tua età (~${theoreticalMax} bpm).`,
      details: [
        "Le formule teoriche hanno margine di errore ±10-15 bpm",
        "Uno scarto di 20+ bpm merita una verifica",
        "Sensori non ben posizionati danno spesso falsi picchi",
      ],
      suggestion:
        "Controlla come hai indossato il sensore. Se il dato si ripete, considera un test sotto sforzo con un medico dello sport.",
    };
  }

  const recent = existingLogs.slice(-2);
  if (log.rpe >= 9 && recent.length === 2 && recent.every((l) => l.rpe >= 9)) {
    return {
      block: true,
      allowOverride: true,
      title: "Stanchezza accumulata",
      message: "È la terza sessione consecutiva con sforzo percepito molto alto (9-10/10).",
      details: [
        "Allenamenti sempre massimali aumentano il rischio di infortuni",
        "Il corpo ha bisogno di giorni facili per adattarsi",
        "La letteratura amatoriale suggerisce circa 80% sessioni facili, 20% intense",
      ],
      suggestion:
        "Valuta una settimana più leggera o un giorno di riposo completo prima della prossima sessione intensa.",
    };
  }

  return { block: false };
}

// ---------- Plan generation (Cap. 2.4) — Calendar-aware adaptive phases ----------
//
// Ragiona a settimane di calendario (lun-dom) tra oggi e raceDate.
// - La settimana corrente è troncata: solo i giorni rimasti da oggi a domenica.
// - La settimana gara è troncata: solo i giorni prima della gara (gara compresa come sessione).
// - Sessioni per settimana = min(weeklyFreq, floor((giorniDisponibili + 1) / 2))
//   per garantire ≥1 giorno di recupero tra qualsiasi sessione.
// - Il template della settimana (base/build/intensity/specificity/taper) dipende
//   da quante settimane mancano alla gara.
// - Da ogni template selezioniamo le sessioni più caratterizzanti se weeklyFreq < 3,
//   o aggiungiamo un easy extra se weeklyFreq > 3.

type WeekTemplateKind = "base" | "build" | "intensity" | "specificity" | "taper";

// Day-of-week indices: 0=Mon ... 6=Sun. JS Date.getDay() returns 0=Sun...6=Sat,
// so we remap to make week math (lun-dom) clearer.
function dowMonFirst(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return (js + 6) % 7; // 0=Mon..6=Sun
}

// Returns the Monday (local midnight) of the calendar week containing `d`.
function startOfWeekMonday(d: Date): Date {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = dowMonFirst(local);
  local.setDate(local.getDate() - dow);
  return local;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

// Max sessions in a window of `days` calendar days while keeping ≥1 day of rest
// between any two sessions: floor((days + 1) / 2).
//   1 day  → 1 session
//   2 days → 1 (need rest after)
//   3 days → 2 (g1, g3)
//   4 days → 2
//   5 days → 3
//   6 days → 3
//   7 days → 4
function maxSessionsWithRest(days: number): number {
  if (days <= 0) return 0;
  return Math.floor((days + 1) / 2);
}

// ============================================================================
// RATIONALE LIBRARY — spiegazioni didattiche ancorate ai dati utente.
//
// Approccio "ibrido": testi statici con placeholder risolti a runtime sui
// dati del profilo (ritmo gara, zone FC, settimane alla gara). Questo dà
// il 90% del valore della personalizzazione AI al costo zero di un lookup.
//
// Ogni builder riceve un contesto e restituisce la SessionRationale pronta.
// Manteniamo la "voce" coerente col resto dell'app: descrittiva, da amico
// esperto, mai prescrittiva-clinica.
// ============================================================================

interface RationaleContext {
  raceDistance: number;
  raceDistanceLabel: string; // "10K", "21K", "42K"
  targetPacePerKm: string;   // "5'30\""
  z2Low: number;
  z2High: number;
  z3Low: number;
  z3High: number;
  z4Low: number;
  z4High: number;
  z5Low: number;
  z5High: number;
  racePaceHr: number;
  weeksToRace: number;       // settimane rimanenti
  level: Level;
}

// Scegliamo il modello TID in base alla distanza gara.
// Cap. "Modelli di Distribuzione dell'Intensità" della letteratura sportiva:
// 10K → Polarizzato, 42K → Piramidale, 21K → Ibrido.
function pickTidModel(raceDistance: number): "polarized" | "pyramidal" | "hybrid" {
  if (raceDistance <= 12) return "polarized";
  if (raceDistance >= 30) return "pyramidal";
  return "hybrid";
}

function buildPlanPhilosophy(ctx: RationaleContext): PlanPhilosophy {
  const model = pickTidModel(ctx.raceDistance);
  if (model === "polarized") {
    return {
      tidModel: "polarized",
      title: "Modello polarizzato — 80/15",
      explanation:
        `Sui ${ctx.raceDistanceLabel} il tuo ritmo gara vive vicino alla soglia anaerobica. Per spingere quella soglia più in alto, la letteratura amatoriale (Seiler, Muñoz) mostra che funziona meglio separare chiaramente i giorni facili dai giorni duri: circa l'80% del tempo totale in intensità leggera, il resto in sessioni davvero impegnative. Il "mezzo" (il classico ritmo medio) viene usato poco: stanca quanto il duro senza portare gli stessi adattamenti.`,
      whatYoullSee:
        `Lunghi a FC ${ctx.z2Low}-${ctx.z2High} bpm che ti sembreranno "troppo lenti" e ripetute brevi a FC ${ctx.z5Low}+ che ti sembreranno "troppo dure". È voluto — è il contrasto che produce i risultati.`,
    };
  }
  if (model === "pyramidal") {
    return {
      tidModel: "pyramidal",
      title: "Modello piramidale — volume + ritmo maratona",
      explanation:
        `Sui ${ctx.raceDistanceLabel} il ritmo gara è in piena Zona 2: il lavoro più importante è abituare il corpo a ossidare grassi e conservare glicogeno per ore. Le ripetute brevi ad alta intensità esistono ma sono pochissime — il grosso del lavoro vive tra lento e medio, con lunghi che diventano il pezzo forte del piano.`,
      whatYoullSee:
        `Tanti lunghi che cresceranno nelle settimane, tempo run a ritmo maratona (${ctx.targetPacePerKm}/km) nella fase centrale, pochissime ripetute brevi. Se ti aspettavi molte sessioni "veloci", non è un errore: per i ${ctx.raceDistanceLabel} il motore aerobico vale più della velocità di punta.`,
    };
  }
  // hybrid / 21K
  return {
    tidModel: "hybrid",
    title: "Modello ibrido — soglia + volume",
    explanation:
      `La mezza maratona sta esattamente nella zona di transizione: troppo lunga per un piano tutto VO₂max come i 10K, troppo breve per uno puramente aerobico come la maratona. Lavoriamo su entrambi i fronti: sessioni a soglia (tempo run, medi sostenuti) per alzare il ritmo sostenibile, più un volume aerobico crescente per durare i 21 km senza crollare.`,
    whatYoullSee:
      `Tempo run a ritmo gara (${ctx.targetPacePerKm}/km) o poco più lenti, lunghi in Z2 che crescono gradualmente, ripetute a intensità medio-alta più che massimale.`,
  };
}

function buildWeekRationale(
  kind: "base" | "build" | "intensity" | "specificity" | "taper",
  weeksToRace: number,
  raceDistanceLabel: string,
): WeekRationale {
  switch (kind) {
    case "base":
      return {
        buildingBlock: "Costruzione del motore aerobico di base.",
        whyNow:
          `Mancano ${weeksToRace} settimane: è troppo presto per le ripetute gara-specifiche, troppo tardi per alzare il chilometraggio di botto. Costruiamo piano, il corpo adatta tendini e capillarizzazione, poi più avanti aggiungiamo intensità.`,
        expectation:
          `Sessioni facili che devono sembrare facili. Se le gambe girano pesanti già qui, è un segnale da ascoltare.`,
      };
    case "build":
      return {
        buildingBlock: "Aumento graduale del volume e introduzione della soglia.",
        whyNow:
          `Siamo in fase centrale. Il corpo ha preso confidenza con il carico di base, adesso possiamo aggiungere stimoli più specifici — medi e lunghi più consistenti — senza accumulare fatica pericolosa.`,
        expectation:
          `Il lungo cresce, compare un lavoro di qualità settimanale. Se il sonno o la motivazione cedono, alleggerisci senza sensi di colpa.`,
      };
    case "intensity":
      return {
        buildingBlock: "Intensità specifica — il cuore del piano.",
        whyNow:
          `A ${weeksToRace} settimane dai ${raceDistanceLabel} sei nella finestra in cui gli stimoli intensi producono il massimo ritorno. Ripetute e medi lavorano sui sistemi energetici che userai il giorno gara.`,
        expectation:
          `Le sessioni di qualità saranno impegnative. Recupera davvero nei giorni facili: è lì che avviene l'adattamento.`,
      };
    case "specificity":
      return {
        buildingBlock: "Specificità — ritmo gara e gambe pronte.",
        whyNow:
          `Ultima settimana piena prima del taglio volumi. Abituiamo gambe e testa al ritmo esatto che userai in gara, senza svuotarti.`,
        expectation:
          `Meno volume della settimana scorsa ma stesso tipo di sforzo. Non è tapering ancora — quello arriva subito dopo.`,
      };
    case "taper":
      return {
        buildingBlock: "Scarico pre-gara — arrivare freschi, non detrainati.",
        whyNow:
          `Il motore c'è già, l'abbiamo costruito nelle settimane precedenti. Adesso tagliamo volume ma teniamo l'intensità alta: meno ripetute ma alla stessa velocità, così le gambe si riposano senza "dimenticarsi" come si corre forte.`,
        expectation:
          `Ti sembrerà di fare poco. È il momento in cui la maggior parte dei runner sbaglia aggiungendo corse "per sicurezza". Fidati del piano.`,
      };
  }
}

type SessionRationaleKind =
  | "easyShort"
  | "easyContinuous"
  | "easyShorter"
  | "qualityMediumHigh"
  | "qualityShortReps"
  | "mediumProgressive"
  | "mediumContinuous"
  | "mediumProgressionRace"
  | "longBase"
  | "longBuild"
  | "longIntensity"
  | "racePaceShort"
  | "preRace"
  | "raceDay";

function buildSessionRationale(
  sessionKind: SessionRationaleKind,
  ctx: RationaleContext,
): SessionRationale {
  switch (sessionKind) {
    case "easyShort":
    case "easyContinuous":
    case "easyShorter":
      return {
        goal: "Costruire il motore aerobico senza accumulare fatica.",
        why: `Le uscite facili sono l'80% del lavoro di un piano fatto bene. Corri piano perché è in queste sessioni che il corpo costruisce capillari, mitocondri, resistenza dei tendini — tutte cose che poi pagano quando fai le sessioni dure. Se le rendi medie, ti stanchi senza guadagnarci niente.`,
        howToExecute: `FC tra ${ctx.z2Low} e ${ctx.z2High} bpm. Devi poter tenere una conversazione a frasi intere. Se ti senti "strozzato" dal ritmo, stai andando troppo forte — rallenta senza problemi.`,
      };
    case "qualityMediumHigh":
      return {
        goal: "Alzare la soglia anaerobica.",
        why: `La soglia è il ritmo più alto che puoi tenere a lungo senza che il lattato esploda. Più la alzi, più il tuo ritmo ${ctx.raceDistanceLabel} diventa sostenibile invece di "tirato". Questa sessione stimola esattamente quella zona: impegnativa ma non massimale, 8' è la durata che produce l'adattamento senza cuocerti.`,
        howToExecute: `FC ${ctx.z4Low}-${ctx.z4High} bpm nei blocchi di 8'. Respirazione decisamente accelerata ma controllata, come se stessi facendo un colloquio sotto sforzo. Nei 3' di recupero devi tornare a respirare tranquillo.`,
      };
    case "qualityShortReps":
      return {
        goal: "Stimolare il VO₂max — il tuo tetto aerobico.",
        why: `Sui ${ctx.raceDistanceLabel} il ritmo gara vive vicino alla soglia anaerobica. Più alto è il tuo VO₂max, più quella soglia si alza, più il tuo ritmo gara diventa "comodo". Le ripetute brevi a intensità alta sono lo stimolo più diretto per spingerlo in su.`,
        howToExecute: `FC ${ctx.z5Low}-${ctx.z5High} bpm nei 3'. Respirazione profonda e veloce, riesci a dire 2-3 parole non di più. Se arrivi alla quinta ripetuta senza crollo di ritmo, la sessione ha funzionato. Se crolli prima, rallenta — meglio una buona quarta che una quinta disastrosa.`,
      };
    case "mediumProgressive":
    case "mediumContinuous":
      return {
        goal: "Lavorare alla soglia aerobica per sostenere il ritmo più a lungo.",
        why: `Il medio è la zona che sui ${ctx.raceDistanceLabel} ti porta al traguardo: non è ripetute devastanti né corsa rilassata, è lo sforzo che senti ma che puoi tenere a lungo. Allenarlo insegna al corpo a bruciare energia in modo più efficiente quando il ritmo sale.`,
        howToExecute: `FC ${ctx.z3High}-${ctx.z4Low} bpm. Sforzo sostenuto, respirazione più alta del facile ma regolare. Non dovrebbe mai farti sentire "al limite" — se succede, hai spinto troppo.`,
      };
    case "mediumProgressionRace":
      return {
        goal: "Familiarizzare col ritmo gara partendo rilassato.",
        why: `Partire rilassato e progredire simula la strategia ideale in gara — partire controllati, poi trovare il ritmo. Insegna al corpo (e alla testa) che il ritmo gara non è un muro, è qualcosa a cui arrivi gradualmente.`,
        howToExecute: `Primi 20' facili (${ctx.z2Low}-${ctx.z2High} bpm), poi 20' che salgono fino al ritmo gara (${ctx.targetPacePerKm}/km, FC ~${ctx.racePaceHr} bpm). Se nei progressivi senti di essere già al limite, ti sei spinto troppo oltre troppo presto.`,
      };
    case "longBase":
    case "longBuild":
    case "longIntensity":
      return {
        goal: "Resistenza di durata — il pilastro per chi corre lungo.",
        why: `Il lungo fa cose che nessun'altra sessione fa: svuota il glicogeno, abitua il corpo a bruciare grassi, rafforza tendini e struttura muscolare sotto stress prolungato. Per i ${ctx.raceDistanceLabel} è l'allenamento più importante del piano.`,
        howToExecute: `FC ${ctx.z2Low}-${ctx.z2High + 5} bpm. Ritmo tranquillo anche se sembra "troppo lento" — è voluto, il lungo si fa piano. Idratati regolarmente, e se nell'ultimo terzo serve camminare brevi tratti, va bene.`,
      };
    case "racePaceShort":
      return {
        goal: "Imprimere il ritmo gara nelle gambe.",
        why: `A ridosso della gara servono sessioni che "insegnino" alle gambe la sensazione esatta del ritmo ${ctx.targetPacePerKm}/km. Non per allenarti, per ricordare al sistema neuromuscolare cosa gli chiederai il giorno della gara.`,
        howToExecute: `Blocchi a FC ~${ctx.racePaceHr} bpm, cioè il tuo ritmo gara teorico. Devi sentire lo sforzo gara ma uscire dalla sessione fresco, non stanco. Se ti senti sulle gambe, hai spinto oltre — non è quello il punto.`,
      };
    case "preRace":
      return {
        goal: "Attivazione finale — tenere il ritmo vivo senza stancarsi.",
        why: `A pochi giorni dalla gara, gli allenamenti non costruiscono più niente: la forma c'è. Questa sessione serve solo a tenere il sistema neuromuscolare "acceso" sul ritmo gara. È un promemoria, non un carico.`,
        howToExecute: `Due blocchi brevi a FC ~${ctx.racePaceHr} bpm con recupero generoso. Devi uscire pensando "potevo fare di più" — è esattamente l'intento: arrivare carico al giorno gara, non stanco.`,
      };
    case "raceDay":
      return {
        goal: "Ciò per cui hai lavorato fin qui.",
        why: `Tutto il piano converge qui. Il motore aerobico, la soglia, la forza mentale per tenere il ritmo — sono già nelle gambe. Oggi non si costruisce nulla: si usa.`,
        howToExecute: `Parti controllato (primi km sotto FC ${Math.round(ctx.racePaceHr * 0.98)}), corpo centrale a FC ${ctx.racePaceHr} ± 3 bpm, finale libero di esprimerti. L'errore più comune nei ${ctx.raceDistanceLabel} è partire troppo forte nei primi 2 km.`,
      };
  }
}

function buildRationaleContext(
  profile: Profile,
  weeksToRace: number,
  zones: ZonesResult,
): RationaleContext {
  const raceDist = profile.raceDistance || 10;
  const label = Number.isInteger(raceDist) ? `${raceDist}K` : `${Math.round(raceDist)}K`;
  // Zones are ordered [Z2, Z3, Z4, Z5] per computeZonesKarvonen output
  const [z2, z3, z4, z5] = zones.zones;
  const parsed = (r: string): [number, number] => {
    // range format: "120–140" (en-dash). Tolerate ASCII "-" too.
    const parts = r.split(/[–-]/).map((n) => parseInt(n, 10));
    return [parts[0] || 0, parts[1] || 0];
  };
  const [z2Low, z2High] = parsed(z2.range);
  const [z3Low, z3High] = parsed(z3.range);
  const [z4Low, z4High] = parsed(z4.range);
  const [z5Low, z5High] = parsed(z5.range);
  return {
    raceDistance: raceDist,
    raceDistanceLabel: label,
    targetPacePerKm: paceFromTime(profile.targetTime, raceDist),
    z2Low, z2High, z3Low, z3High, z4Low, z4High, z5Low, z5High,
    racePaceHr: Math.round(zones.hrMax * 0.88),
    weeksToRace,
    level: profile.level,
  };
}

function formatRaceDistanceLabelLocal(d: number | undefined | null): string {
  const v = d && d > 0 ? d : 10;
  return Number.isInteger(v) ? `${v}K` : `${Math.round(v)}K`;
}

export function generatePlan(profile: Profile): Plan {
  const zones = computeZones(profile);
  const { hrMax } = zones;
  const z2: [number, number] = [Math.round(hrMax * 0.65), Math.round(hrMax * 0.75)];
  const z3: [number, number] = [Math.round(hrMax * 0.75), Math.round(hrMax * 0.85)];
  const z4: [number, number] = [Math.round(hrMax * 0.85), Math.round(hrMax * 0.9)];
  const z5: [number, number] = [Math.round(hrMax * 0.9), Math.round(hrMax * 0.95)];
  const racePace = Math.round(hrMax * 0.88);

  // "Lungo lento" duration scales with race distance (capped 60-120').
  // NOTA: nuova logica progressiva basata su currentBest + recentLongRun.
  // Lasciamo qui un valore iniziale "neutro" che sarà sovrascritto per ogni
  // settimana nel calendar walk (longBase/longBuild/longIntensity vengono
  // ricostruiti con duration calcolata da computeLongDuration).
  const raceDist = profile.raceDistance || 10;
  const baseLong = Math.max(60, Math.min(120, Math.round(raceDist * 7)));
  const longDuration = baseLong;
  const longBuildDuration = Math.min(120, baseLong + 10);
  const longIntensityDuration = Math.min(120, baseLong + 5);

  // Contesto rationale costruito una volta e passato ai builder della library.
  // Usa 0 settimane come default (per sessioni razionalizzate fuori dal loop calendar-aware).
  // Le Week useranno un contesto specifico più sotto che include weeksToRace corretto.
  const sessionCtx = buildRationaleContext(profile, 0, zones);

  // Helper: costruisce un "lungo lento" per una specifica settimana usando
  // la progressione ancorata al currentBest e al recentLongRun dell'utente.
  function buildLong(name: string, weekIdx: number, totalWeeks: number, kind: "base" | "build" | "intensity"): Session {
    const dur = computeLongDuration(weekIdx, totalWeeks, profile);
    const blocks =
      kind === "intensity"
        ? [
            `Circa ${dur}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
            "Possibile inserire 5' di ritmo medio verso metà percorso se le gambe rispondono bene",
          ]
        : kind === "build"
        ? [`Circa ${dur}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`, "Porta acqua se fa caldo"]
        : [
            `Circa ${dur}' di corsa continua a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
            "Idratati regolarmente se hai la bottiglia",
            "Se serve camminare brevi tratti, va bene",
          ];
    const rationaleKey: SessionRationaleKind =
      kind === "intensity" ? "longIntensity" : kind === "build" ? "longBuild" : "longBase";
    return {
      name,
      type: "long",
      duration: dur,
      targetHR: `${z2[0]}-${z2[1] + 5}`,
      blocks,
      notes: kind === "base" ? "Il lungo lento è uno degli allenamenti più citati nella letteratura amatoriale per gare di resistenza." : undefined,
      rationale: buildSessionRationale(rationaleKey, sessionCtx),
    };
  }

  // ---------- Session library (poi le selezioniamo per settimana) ----------
  const easyShort: Session = {
    name: "Corsa facile + allunghi",
    type: "easy",
    duration: 45,
    targetHR: `${z2[0]}-${z2[1]}`,
    blocks: [
      `Circa 45' di corsa continua, FC indicativa tra ${z2[0]} e ${z2[1]} bpm`,
      "4 allunghi brevi da ~100m con camminata di recupero tra uno e l'altro",
      "Se riesci a parlare a frasi intere, probabilmente sei nell'intensità giusta",
    ],
    notes: 'Gli allenamenti percepiti come "troppo facili" spesso sono quelli che fanno più differenza nel tempo, contrariamente all\'intuizione.',
    rationale: buildSessionRationale("easyShort", sessionCtx),
  };

  const easyContinuous: Session = {
    name: "Corsa facile",
    type: "easy",
    duration: 50,
    targetHR: `${z2[0]}-${z2[1]}`,
    blocks: [
      `50' continui a intensità leggera (${z2[0]}-${z2[1]} bpm)`,
      "Tieni un ritmo che permetta di respirare con il naso a tratti",
    ],
    rationale: buildSessionRationale("easyContinuous", sessionCtx),
  };

  const easyShorter: Session = {
    name: "Corsa facile",
    type: "easy",
    duration: 40,
    targetHR: `${z2[0]}-${z2[1]}`,
    blocks: [`40' continui a intensità leggera (${z2[0]}-${z2[1]} bpm)`],
    rationale: buildSessionRationale("easyShorter", sessionCtx),
  };

  const qualityMediumHigh: Session = {
    name: "Intensità medio-alta",
    type: "quality",
    duration: 44,
    targetHR: `${z4[0]}-${z4[1]}`,
    blocks: [
      "10' di riscaldamento progressivo",
      `3 blocchi di 8' a intensità medio-alta (indicativamente ${z4[0]}-${z4[1]} bpm)`,
      "3' di corsa lenta di recupero tra i blocchi",
      "10' di defaticamento lento",
    ],
    notes: "Lo sforzo percepito di riferimento per questo tipo di lavoro, secondo la letteratura amatoriale, è intorno a 7/10: impegnativo ma non massimale.",
    rationale: buildSessionRationale("qualityMediumHigh", sessionCtx),
  };
  const qualityShortReps: Session = {
    name: "Ripetute brevi",
    type: "quality",
    duration: 40,
    targetHR: `${z5[0]}-${z5[1]}`,
    blocks: [
      "10' di riscaldamento",
      `5 blocchi di 3' a intensità alta (indicativamente ${z5[0]}-${z5[1]} bpm)`,
      "2' di corsa lenta tra i blocchi",
      "10' di defaticamento",
    ],
    notes: "Respirazione decisamente accelerata ma non al limite. Se non riesci a completare un blocco, rallentare è sempre un'opzione ragionevole.",
    rationale: buildSessionRationale("qualityShortReps", sessionCtx),
  };

  const mediumProgressive: Session = {
    name: "Medio progressivo",
    type: "medium",
    duration: 45,
    targetHR: `${z3[1]}-${z4[0]}`,
    blocks: [
      "10' di attivazione lenta",
      `25' a intensità che si sente ma è sostenibile (${z3[1]}-${z4[0]} bpm)`,
      "10' di defaticamento",
    ],
    rationale: buildSessionRationale("mediumProgressive", sessionCtx),
  };

  const mediumContinuous: Session = {
    name: "Corsa continua medio-alta",
    type: "medium",
    duration: 40,
    targetHR: `${z3[1]}-${z4[0]}`,
    blocks: [
      `Circa 40' di corsa continua a intensità sostenibile (${z3[1]}-${z4[0]} bpm)`,
      "Non deve essere faticosa come le ripetute, non facile come il lungo",
    ],
    rationale: buildSessionRationale("mediumContinuous", sessionCtx),
  };

  const mediumProgressionRace: Session = {
    name: "Medio in progressione",
    type: "medium",
    duration: 50,
    targetHR: `${z3[1]}-${z4[0]}`,
    blocks: [
      "20' di corsa facile",
      `20' progressivi fino a ritmo gara (${z3[1]}-${z4[0]} bpm)`,
      "10' di defaticamento",
    ],
    rationale: buildSessionRationale("mediumProgressionRace", sessionCtx),
  };

  const longBase: Session = {
    name: "Lungo lento",
    type: "long",
    duration: longDuration,
    targetHR: `${z2[0]}-${z2[1] + 5}`,
    blocks: [
      `Circa ${longDuration}' di corsa continua a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
      "Idratati regolarmente se hai la bottiglia",
      "Se serve camminare brevi tratti, va bene",
    ],
    notes: "Il lungo lento è uno degli allenamenti più citati nella letteratura amatoriale per gare di resistenza.",
    rationale: buildSessionRationale("longBase", sessionCtx),
  };

  const longBuild: Session = {
    name: "Lungo lento",
    type: "long",
    duration: longBuildDuration,
    targetHR: `${z2[0]}-${z2[1] + 5}`,
    blocks: [`Circa ${longBuildDuration}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`, "Porta acqua se fa caldo"],
    rationale: buildSessionRationale("longBuild", sessionCtx),
  };

  const longIntensity: Session = {
    name: "Lungo lento",
    type: "long",
    duration: longIntensityDuration,
    targetHR: `${z2[0]}-${z2[1] + 5}`,
    blocks: [
      `Circa ${longIntensityDuration}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
      "Possibile inserire 5' di ritmo medio verso metà percorso se le gambe rispondono bene",
    ],
    rationale: buildSessionRationale("longIntensity", sessionCtx),
  };

  const racePaceShort: Session = {
    name: "Ritmo gara breve",
    type: "quality",
    duration: 45,
    targetHR: `${racePace}`,
    blocks: [
      "10' di riscaldamento",
      `3 blocchi di 6' a ritmo gara indicativo (~${racePace} bpm)`,
      "3' di corsa lenta tra i blocchi",
      "10' di defaticamento",
    ],
    notes: "Familiarizza il corpo con la sensazione del ritmo gara.",
    rationale: buildSessionRationale("racePaceShort", sessionCtx),
  };

  const preRace: Session = {
    name: "Pre-gara",
    type: "race",
    duration: 35,
    targetHR: `${racePace}`,
    blocks: [
      "10' di riscaldamento a intensità leggera",
      `2 blocchi di circa 5' a ritmo gara indicativo (~${racePace} bpm), con 2' di corsa lenta tra l'uno e l'altro`,
      "10' di defaticamento lento",
    ],
    notes: 'Questa sessione viene spesso descritta come un "promemoria" del ritmo, non un allenamento di carico.',
    rationale: buildSessionRationale("preRace", sessionCtx),
  };

  const raceDay: Session = {
    name: "Giorno gara",
    type: "race",
    duration: Math.round(profile.targetTime),
    targetHR: `${racePace}`,
    blocks: [
      `Spesso si consiglia di partire controllati: primi km sotto la propria FC soglia (~${Math.round(hrMax * 0.86)} bpm indicativi)`,
      `Corpo centrale della gara: intensità medio-alta, indicativamente ${Math.round(hrMax * 0.88)}-${Math.round(hrMax * 0.92)} bpm`,
      "Finale: se senti di avere margine, puoi chiudere progressivamente",
      `Ritmo ipotetico per ${profile.targetTime}' su ${profile.raceDistance || 10}km: ${paceFromTime(profile.targetTime, profile.raceDistance || 10)}/km`,
    ],
    notes: "Partire troppo forte è l'errore più comunemente segnalato nella letteratura amatoriale.",
    rationale: buildSessionRationale("raceDay", sessionCtx),
  };

  // ---------- Selezione sessioni per template + numero target ----------
  // Ordine di priorità per template: la prima è la più caratterizzante.
  // Ne prendiamo `count` dall'inizio. Se count > base, aggiungiamo easy extra.
  //
  // Differenziato per distanza gara:
  // - 10K (polarized): build mantiene mediumProgressive (poco volume serve)
  // - 21K/42K (hybrid/pyramidal): in build mettiamo qualityMediumHigh (Z4 soglia)
  //   in posizione 2, così le qualità entrano subito invece di aspettare
  //   l'ultimo terzo del piano. Allinea il calendario alla PlanPhilosophy.
  const isLongRace = raceDist >= 18; // HM o oltre
  const TEMPLATE_PRIORITY: Record<WeekTemplateKind, Session[]> = {
    base: [longBase, qualityMediumHigh, easyShort],
    build: isLongRace
      ? [longBuild, qualityMediumHigh, mediumContinuous, easyContinuous]
      : [longBuild, mediumProgressive, easyContinuous],
    intensity: [qualityShortReps, longIntensity, mediumContinuous],
    specificity: [racePaceShort, mediumProgressionRace, easyShorter],
    taper: [], // gestito separatamente
  };

  const TEMPLATE_THEME: Record<WeekTemplateKind, string> = {
    base: "BASE + ATTIVAZIONE",
    build: "COSTRUZIONE",
    intensity: "INTENSITÀ + SPECIFICITÀ",
    specificity: "RITMO GARA",
    taper: "RALLENTAMENTO + GARA",
  };

  function selectSessions(kind: WeekTemplateKind, count: number): Session[] {
    if (count <= 0) return [];
    let priority = TEMPLATE_PRIORITY[kind];
    // Safety: per i principianti, sostituisci ripetute Z5 con soglia Z4.
    // I beginner non fanno VO₂max massimale, lavorano sulla soglia.
    if (profile.level === "beginner") {
      priority = priority.map((s) => (s === qualityShortReps ? qualityMediumHigh : s));
    }
    if (count <= priority.length) return priority.slice(0, count);
    // count > priority.length: aggiungiamo sessioni easy extra (corsa facile breve)
    const extra = count - priority.length;
    const out = [...priority];
    for (let i = 0; i < extra; i++) {
      out.push({
        ...easyShorter,
        name: `Corsa facile`,
      });
    }
    return out;
  }

  // ---------- Calendar walk ----------
  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const raceDate = profile.raceDate ? toLocalMidnight(profile.raceDate) : addDays(todayMidnight, profile.daysUntilRace);
  const totalDays = Math.max(0, daysBetween(todayMidnight, raceDate));

  const weeklyFreq = Math.max(1, Math.min(7, profile.weeklyFreq || 3));
  const weeks: Week[] = [];

  // Edge case: gara oggi o ieri → solo race day
  if (totalDays <= 0) {
    weeks.push({
      theme: TEMPLATE_THEME.taper,
      sessions: [raceDay],
      rationale: buildWeekRationale("taper", 0, formatRaceDistanceLabelLocal(profile.raceDistance)),
    });
    return {
      weeks,
      target: profile.targetTime,
      adjustedEstimate: null,
      shortPrep: true,
      veryShortPrep: true,
      philosophy: buildPlanPhilosophy(buildRationaleContext(profile, 0, zones)),
    };
  }

  // Calcoliamo le settimane di calendario lun-dom che intersecano [oggi, raceDate].
  const firstWeekStart = startOfWeekMonday(todayMidnight);
  const raceWeekStart = startOfWeekMonday(raceDate);
  const numWeeks =
    Math.round((raceWeekStart.getTime() - firstWeekStart.getTime()) / (7 * 86400000)) + 1;

  // Per ciascuna settimana decidiamo il template in base alla distanza dalla gara.
  // settimaneAllaGara = numWeeks - 1 - weekIdx (0 = settimana gara stessa)
  function templateFor(weeksToRace: number): WeekTemplateKind {
    if (weeksToRace === 0) return "taper";
    if (weeksToRace === 1) return "specificity";
    if (weeksToRace <= 3) return "intensity";
    if (weeksToRace <= 6) return "build";
    return "base";
  }

  for (let wi = 0; wi < numWeeks; wi++) {
    const weekStart = addDays(firstWeekStart, wi * 7);
    const weekEnd = addDays(weekStart, 6); // domenica
    const isFirstWeek = wi === 0;
    const isRaceWeek = wi === numWeeks - 1;
    const weeksToRace = numWeeks - 1 - wi;
    const kind = templateFor(weeksToRace);

    // Giorni disponibili per allenarsi nella settimana
    let availableDays: number;
    if (isRaceWeek) {
      // Solo i giorni *prima* della gara contano per le sessioni di taper.
      // La gara è una sessione separata aggiunta in coda.
      availableDays = Math.max(0, daysBetween(weekStart, raceDate));
      if (isFirstWeek) {
        // settimana gara coincide con settimana corrente: dai giorni disponibili
        // togli quelli già passati (da lun fino a oggi escluso? no, oggi incluso
        // come potenziale allenamento). Conta da oggi al giorno gara - 1.
        availableDays = Math.max(0, daysBetween(todayMidnight, raceDate));
      }
    } else if (isFirstWeek) {
      // da oggi a domenica inclusi
      availableDays = daysBetween(todayMidnight, weekEnd) + 1;
    } else {
      availableDays = 7;
    }

    // Sessioni effettive: limitate da weeklyFreq E dal vincolo di recupero
    const maxByRest = maxSessionsWithRest(availableDays);
    const targetCount = isRaceWeek
      ? Math.max(0, Math.min(weeklyFreq - 1, maxByRest)) // -1 perché la gara conta come 1
      : Math.min(weeklyFreq, maxByRest);

    const sessions: Session[] = [];

    if (isRaceWeek) {
      // Taper: easy all'inizio della settimana, pre-gara per ultima (più vicina alla gara),
      // poi la gara in coda. Esempi:
      //  targetCount=0 → [gara]
      //  targetCount=1 → [pre-gara, gara]
      //  targetCount=2 → [easy, pre-gara, gara]
      //  targetCount=3 → [easy, easy, pre-gara, gara]
      const easyPool: Session[] = [easyShort, easyShorter];
      const easyCount = Math.max(0, targetCount - 1);
      for (let i = 0; i < easyCount && i < easyPool.length; i++) {
        sessions.push(easyPool[i]);
      }
      if (targetCount >= 1) {
        sessions.push(preRace);
      }
      // sempre la gara in coda
      sessions.push(raceDay);
    } else {
      sessions.push(...selectSessions(kind, targetCount));
    }

    // PROGRESSIONE LUNGO: sostituiamo qualunque long* con un long calcolato
    // dinamicamente usando computeLongDuration ancorato al currentBest e al
    // recentLongRun dell'utente. Indice 0 = prima settimana di training,
    // l'ultima settimana di training è quella prima del taper.
    if (!isRaceWeek) {
      const trainingTotal = Math.max(1, numWeeks - 1); // escluso race week
      const trainingIdx = wi; // wi 0..numWeeks-2 in training
      const longKind: "base" | "build" | "intensity" =
        kind === "intensity" || kind === "specificity" ? "intensity" : kind === "build" ? "build" : "base";
      for (let si = 0; si < sessions.length; si++) {
        if (sessions[si].type === "long") {
          sessions[si] = buildLong("Lungo lento", trainingIdx, trainingTotal, longKind);
        }
      }
    }

    // Salta settimane completamente vuote (es. settimana corrente con 0 giorni utili
    // E non è la settimana gara — caso limite improbabile)
    if (sessions.length === 0) continue;

    weeks.push({
      theme: TEMPLATE_THEME[kind],
      sessions,
      rationale: buildWeekRationale(kind, weeksToRace, formatRaceDistanceLabelLocal(profile.raceDistance)),
    });
  }

  // Garantisce almeno una settimana con la gara (paranoia)
  if (weeks.length === 0 || !weeks[weeks.length - 1].sessions.some((s) => s.type === "race" && s.name === "Giorno gara")) {
    weeks.push({
      theme: TEMPLATE_THEME.taper,
      sessions: [raceDay],
      rationale: buildWeekRationale("taper", 0, formatRaceDistanceLabelLocal(profile.raceDistance)),
    });
  }

  const shortPrep = numWeeks <= 3;
  const veryShortPrep = totalDays < 14;

  return {
    weeks,
    target: profile.targetTime,
    adjustedEstimate: null,
    shortPrep,
    veryShortPrep,
    philosophy: buildPlanPhilosophy(buildRationaleContext(profile, numWeeks - 1, zones)),
  };
}

export function findNextSession(plan: Plan, logs: WorkoutLog[]) {
  for (let w = 0; w < plan.weeks.length; w++) {
    for (let s = 0; s < plan.weeks[w].sessions.length; s++) {
      if (!logs.some((l) => l.weekIdx === w && l.sessionIdx === s)) {
        return { data: plan.weeks[w].sessions[s], weekIdx: w, sessionIdx: s };
      }
    }
  }
  return null;
}

// ---------- Workout analysis (Cap. 3.3 + 3.4) — Deterministic FALLBACK ----------
// The real analysis goes through edge function `analyze-workout` (AI sandwich).
// This stays as offline fallback if AI is unavailable.
export interface AnalysisInsight {
  iconKey: "wind" | "check" | "flame" | "heart" | "zap";
  title: string;
  text: string;
}

export interface PlanAdjustment {
  shouldAdjust: boolean;
  reason: string;
  newTargetEstimate: number | null;
  message: string;
}

export interface Analysis {
  summary: string;
  pace: string;
  hrAvg: number;
  intensityLabel: string;
  verdictTitle: string;
  verdictText: string;
  insights: AnalysisInsight[];
  prediction: {
    time: string;
    text: string;
    low?: string;
    high?: string;
    confidence?: EstimateConfidence;
  } | null;
  nextMove: string;
  // From AI:
  technicalReading?: string;
  sessionHighlight?: string;
  aiNextMove?: string;
  planAdjustment?: PlanAdjustment;
  segmentReadings?: { segmentIdx: number; comment: string }[];
  extractedWorkout?: ExtractedWorkout | null;
  source?: "ai" | "fallback";
}

// ---------- Compute deterministic numbers (Cap. 3.2 sandwich layer 1) ----------
export interface ComputedMetrics {
  paceMinKm: number;
  paceFormatted: string;
  paceDeltaSec: number;
  hrMax: number;
  hrPctMax: number;
  hrPctReserve: number;
  intensityZone: string;
  intensityLabel: string;
  targetPace: string;
}

export function computeMetrics(log: WorkoutLog, profile: Profile, logs?: WorkoutLog[]): ComputedMetrics {
  const { hrMax } = computeZones(profile, undefined, logs);
  const hrPctMax = Math.round((log.hrAvg / hrMax) * 100);
  // Karvonen with user's hrRest if available, otherwise default 60
  const restingHR = profile.hrRest != null && profile.hrRest > 0 ? profile.hrRest : 60;
  const hrPctReserve = Math.round(((log.hrAvg - restingHR) / (hrMax - restingHR)) * 100);
  const paceMinKm = log.duration / log.distance;
  const m = Math.floor(paceMinKm);
  const s = Math.round((paceMinKm - m) * 60);
  const paceFormatted = `${m}'${String(s).padStart(2, "0")}"`;

  // Intensity zone derived from %HRR (Karvonen) — more robust than %HRmax
  let intensityZone = "Z1";
  let intensityLabel = "molto leggera";
  if (hrPctReserve >= 92) { intensityZone = "Z5"; intensityLabel = "alta"; }
  else if (hrPctReserve >= 85) { intensityZone = "Z4"; intensityLabel = "medio-alta"; }
  else if (hrPctReserve >= 75) { intensityZone = "Z3"; intensityLabel = "media"; }
  else if (hrPctReserve >= 65) { intensityZone = "Z2"; intensityLabel = "leggera"; }

  const raceDist = profile.raceDistance || 10;
  const targetPace = paceFromTime(profile.targetTime, raceDist);
  const targetPaceMin = profile.targetTime / raceDist;
  const paceDeltaSec = Math.round((paceMinKm - targetPaceMin) * 60);

  return {
    paceMinKm,
    paceFormatted,
    paceDeltaSec,
    hrMax,
    hrPctMax,
    hrPctReserve,
    intensityZone,
    intensityLabel,
    targetPace,
  };
}

export function analyzeWorkout(
  log: WorkoutLog,
  profile: Profile,
  plan: Plan,
  allLogs: WorkoutLog[]
): Analysis {
  const c = computeMetrics(log, profile);
  const hrPct = c.hrPctMax;
  const pace = c.paceFormatted;
  const targetType = log.sessionType;

  // Honesty guard: if the user marked a "quality" session but the numbers don't
  // back it up (very low RPE AND pace far slower than race target), don't
  // pretend to read it as easy — flag the inconsistency so they fix the input.
  const qualityInconsistent =
    targetType === "quality" &&
    log.rpe <= 6 &&
    c.paceDeltaSec > 60 &&
    hrPct < 80;

  let verdictTitle = "";
  let verdictText = "";

  if (qualityInconsistent) {
    verdictTitle = "I numeri non tornano col tipo di sessione";
    verdictText = `Hai indicato una sessione di "qualità" (ripetute) ma il passo medio è ${pace}/km (${c.paceDeltaSec > 0 ? "+" : ""}${c.paceDeltaSec}s/km rispetto al ritmo gara), la FC media è al ${hrPct}% della massima e l'RPE è ${log.rpe}/10. Verifica che durata e distanza siano quelle giuste, oppure cambia il tipo di sessione: leggere queste medie come una qualità rischia di darti un quadro fuorviante.`;
  } else if (targetType === "easy" || targetType === "long") {
    if (hrPct > 78) {
      verdictTitle = "Intensità sopra i riferimenti per un lento";
      verdictText = `La FC media si colloca intorno al ${hrPct}% della FC massima teorica. Per sessioni descritte come "lente", i riferimenti amatoriali indicano sotto il 75%. Potrebbe essere utile rallentare nelle prossime sessioni.`;
    } else {
      verdictTitle = "Intensità in linea con i riferimenti";
      verdictText = `FC media intorno al ${hrPct}% della stima massima. Per una sessione "lenta", è nella fascia tipica.`;
    }
  } else if (targetType === "quality") {
    if (hrPct >= 85 && hrPct <= 93) {
      verdictTitle = "Intensità centrata sul tipo di lavoro";
      verdictText = `FC media intorno al ${hrPct}% della massima teorica. Con uno sforzo percepito di ${log.rpe}/10 il quadro è coerente.`;
    } else if (hrPct < 85) {
      verdictTitle = "Intensità sotto i riferimenti per un lavoro veloce";
      verdictText = `Per sessioni di ripetute si indica sopra l'85% della FC massima. Qui la media si è fermata al ${hrPct}%. Ricorda che la media include riscaldamento e recuperi: guarda i singoli blocchi se disponibili.`;
    } else {
      verdictTitle = "Intensità elevata";
      verdictText = `Il ${hrPct}% della FC massima è una fascia alta. Se succede ripetutamente potresti arrivare stanco alle sessioni successive.`;
    }
  } else {
    verdictTitle = "Lettura del dato";
    verdictText = `FC media circa ${hrPct}% della massima teorica, fascia di intensità ${c.intensityLabel}.`;
  }

  const insights: AnalysisInsight[] = [];

  if (log.cadence) {
    const cad = log.cadence;
    if (cad < 160) {
      insights.push({
        iconKey: "wind",
        title: "Cadenza bassa rispetto ai riferimenti",
        text: `${cad} passi/min è sotto la fascia "economica" (165-175) della letteratura amatoriale.`,
      });
    } else if (cad >= 165) {
      insights.push({
        iconKey: "check",
        title: "Cadenza nei riferimenti tipici",
        text: `${cad} passi/min è dentro la fascia spesso associata a una corsa economica.`,
      });
    }
  }

  if (log.rpe >= 8 && (targetType === "easy" || targetType === "long")) {
    insights.push({
      iconKey: "flame",
      title: "Sforzo percepito alto per una sessione lenta",
      text: "Un 8+ su un allenamento descritto come facile può segnalare stanchezza accumulata.",
    });
  }

  let prediction: Analysis["prediction"] = null;
  const raceDistFallback = profile.raceDistance || 10;
  if (log.distance >= 5 && hrPct >= 70) {
    const hrReserveRace = Math.round(c.hrMax * (raceDistFallback >= 30 ? 0.85 : 0.9));
    const hrRatio = hrReserveRace / log.hrAvg;
    const racePaceMinKm = c.paceMinKm / Math.sqrt(hrRatio);
    const raceTime = Math.round(racePaceMinKm * raceDistFallback);
    prediction = {
      time: `${raceTime}'`,
      text: `Estrapolazione statistica. Target iniziale: ${profile.targetTime}'. ${
        raceTime < profile.targetTime
          ? "I dati suggeriscono margine."
          : raceTime <= profile.targetTime + 2
          ? "I dati sono in linea."
          : "I dati suggeriscono che l'obiettivo era ambizioso."
      }`,
    };
  }

  const nextSession = findNextSession(plan, allLogs);
  let nextMove = nextSession
    ? `Il prossimo spunto del diario è: ${nextSession.data.name} (circa ${nextSession.data.duration}').`
    : "Hai completato tutti gli spunti del diario. Buona gara.";

  return {
    summary: `${log.distance} km in ${log.duration} min · ${pace}/km · FC media ${log.hrAvg} bpm`,
    pace,
    hrAvg: log.hrAvg,
    intensityLabel: c.intensityLabel,
    verdictTitle,
    verdictText,
    insights,
    prediction,
    nextMove,
    source: "fallback",
  };
}

// ---------- 10K estimation: Riegel + HR normalization, weighted ----------
//
// Per ogni sessione non saltata:
//   1. paceAtRaceHR = pace / (hrRaceTarget / hrAvg)^k  con k=1.06, hrRaceTarget = 0.90 * hrMax
//      (scala il ritmo alla FC tipica gara 10K, ~90% FCmax)
//   2. estimated10K = paceAtRaceHR * 10 * (10 / distance)^0.06
//      (correzione Riegel: T2 = T1*(D2/D1)^1.06; qui in forma pace*distance)
//   3. peso = w_type * w_distance * w_recency
//      type:    quality 1.0, medium 0.9, long 0.8, easy 0.4, altri 0.3
//      dist:    <3km 0.5, <5km 0.8, >=5km 1.0
//      recency: <=14gg 1.0, <=28gg 0.7, oltre 0.4
//   4. media pesata + std pesata = banda
//   5. blend con target dichiarato (20% target, 80% dati) per stabilità
//
// Confidenza:
//   - low:    <3 sessioni con peso >= 0.5  → mostro target dichiarato + flag
//   - medium: 3-5 sessioni utili
//   - high:   >=6 sessioni utili con almeno una quality/medium nelle ultime 2 settimane

const RIEGEL_K = 1.06;
const HR_RACE_PCT = 0.90;
const HR_K = 1.06;

function sessionWeight(log: WorkoutLog, daysAgo: number): number {
  const typeW: Record<string, number> = {
    quality: 1.0,
    medium: 0.9,
    long: 0.8,
    easy: 0.4,
    race: 1.0,
    freeform: 0.3,
  };
  const wType = typeW[log.sessionType] ?? 0.3;

  const d = log.distance || 0;
  const wDist = d < 3 ? 0.5 : d < 5 ? 0.8 : 1.0;

  const wRec = daysAgo <= 14 ? 1.0 : daysAgo <= 28 ? 0.7 : 0.4;

  return wType * wDist * wRec;
}

function singleSessionEstimate(log: WorkoutLog, hrMax: number, raceDist: number): number | null {
  if (!log.distance || !log.duration || !log.hrAvg) return null;
  const paceMinKm = log.duration / log.distance;
  // Race HR target: 90% FCmax for short/middle distances, 85% for marathon+
  const hrRacePct = raceDist >= 30 ? 0.85 : HR_RACE_PCT;
  const hrRaceTarget = hrMax * hrRacePct;
  // Avoid scaling explosion if the session HR is way below the race target
  const ratio = Math.max(0.5, Math.min(1.5, hrRaceTarget / log.hrAvg));
  const paceAtRaceHR = paceMinKm / Math.pow(ratio, HR_K);
  // Riegel: T2 = T1 * (D2/D1)^k → in pace*distance form
  const distFactor = Math.pow(raceDist / log.distance, RIEGEL_K - 1);
  let est = paceAtRaceHR * raceDist * distFactor;
  // Soft correction: Riegel slightly overestimates beyond ~30km, nudge down 2%
  if (raceDist > 30) est *= 0.98;
  return est;
}

export function computeEstimateDetail(logs: WorkoutLog[], profile: Profile): EstimateDetail {
  const { hrMax } = computeZones(profile, undefined, logs);
  const target = profile.targetTime;
  const raceDist = profile.raceDistance || 10;
  const now = Date.now();

  type Item = { est: number; weight: number; daysAgo: number; type: SessionType };
  const items: Item[] = [];

  for (const log of logs) {
    if (log.skipped) continue;
    // Exclude physiologically impossible sessions from the estimate so a single
    // typo (e.g. 50km in 35min) doesn't poison the projection.
    const plaus = checkDataPlausibility(log);
    if (!plaus.ok) continue;
    const est = singleSessionEstimate(log, hrMax, raceDist);
    if (est == null || !isFinite(est) || est <= 0) continue;
    const ts = log.loggedAt ? new Date(log.loggedAt).getTime() : now;
    const daysAgo = Math.max(0, Math.floor((now - ts) / 86400000));
    const w = sessionWeight(log, daysAgo);
    items.push({ est, weight: w, daysAgo, type: log.sessionType });
  }

  const usable = items.filter((i) => i.weight >= 0.5);

  // Not enough good data → fall back to declared target
  if (usable.length < 3) {
    return {
      estimate: target,
      low: target,
      high: target,
      confidence: "low",
      usableSessions: usable.length,
      method: "target-fallback",
    };
  }

  const totalW = items.reduce((a, b) => a + b.weight, 0);
  const weightedMean = items.reduce((a, b) => a + b.est * b.weight, 0) / totalW;
  const weightedVar =
    items.reduce((a, b) => a + b.weight * Math.pow(b.est - weightedMean, 2), 0) / totalW;
  const sigma = Math.sqrt(Math.max(0, weightedVar));

  // Blend with declared target (80% data / 20% target) for stability
  const blended = weightedMean * 0.8 + target * 0.2;

  // Band: ±σ, with a floor of 1' on each side so it never collapses to a single value
  const halfBand = Math.max(1, sigma);
  const low = blended - halfBand;
  const high = blended + halfBand;

  // Confidence
  const hasRecentQuality = items.some(
    (i) => (i.type === "quality" || i.type === "medium") && i.daysAgo <= 14 && i.weight >= 0.5
  );
  let confidence: EstimateConfidence = "medium";
  if (usable.length >= 6 && hasRecentQuality) confidence = "high";
  else if (usable.length < 3) confidence = "low";

  return {
    estimate: Math.round(blended),
    low: Math.round(low),
    high: Math.round(high),
    confidence,
    usableSessions: usable.length,
    method: "riegel-hr",
  };
}

// Backwards-compatible wrapper — returns just the central estimate.
export function computeAdjustedEstimate(logs: WorkoutLog[], profile: Profile): number {
  return computeEstimateDetail(logs, profile).estimate;
}

// ---------- Helpers ----------
export function formatTime(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

export function paceFromTime(totalMinutes: number, distanceKm: number = 10): string {
  const d = distanceKm > 0 ? distanceKm : 10;
  const paceMin = totalMinutes / d;
  const m = Math.floor(paceMin);
  const s = Math.round((paceMin - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

export function getTypeStyles(type: SessionType): string {
  const map: Record<string, string> = {
    easy: "bg-emerald-400 text-emerald-950",
    quality: "bg-rose-400 text-rose-950",
    medium: "bg-amber-400 text-amber-950",
    long: "bg-sky-400 text-sky-950",
    race: "bg-signal text-ink",
  };
  return map[type] || "bg-stone-400 text-stone-950";
}

export function getTypeBg(type: SessionType): string {
  const map: Record<string, string> = {
    easy: "bg-emerald-200",
    quality: "bg-rose-200",
    medium: "bg-amber-200",
    long: "bg-sky-200",
    race: "bg-signal-soft",
  };
  return map[type] || "bg-stone-200";
}

// Parse YYYY-MM-DD as a local-midnight date (avoids UTC shift bugs).
// Other inputs fall back to native Date parsing.
function toLocalMidnight(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  }
  const d = new Date(input);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function daysBetween(fromISO: string | Date, toISO: string | Date): number {
  const from = toLocalMidnight(fromISO);
  const to = toLocalMidnight(toISO);
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86400000);
}

// Returns the most recently logged workout (by loggedAt), excluding skipped ones.
export function getLastCompletedLog(logs: WorkoutLog[]): WorkoutLog | null {
  const done = logs.filter((l) => !l.skipped);
  if (!done.length) return null;
  const sorted = [...done].sort((a, b) => {
    const ta = a.loggedAt ? new Date(a.loggedAt).getTime() : 0;
    const tb = b.loggedAt ? new Date(b.loggedAt).getTime() : 0;
    return tb - ta;
  });
  return sorted[0];
}
