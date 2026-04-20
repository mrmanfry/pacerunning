/**
 * PACE — Load Model
 * =================
 * Modulo per la stima del carico d'allenamento, della freschezza e
 * delle zone cardiache personalizzate. Nessuna dipendenza esterna.
 *
 * Copre:
 *   1. HRmax empirica (con blending sicuro sulla teorica)
 *   2. Zone Karvonen (FCR) — più precise delle zone %HRmax
 *   3. TRIMP (Banister-Morton) — costo di una singola sessione
 *   4. CTL / ATL / TSB — modello fitness/fatigue/form
 *   5. Readiness state — stato aggregato di forma
 *   6. Utility di integrazione (stringhe leggibili, metadata per AI)
 *
 * Tutti i valori sono pre-calcolati in JS deterministico.
 * L'AI non calcola mai, commenta soltanto.
 *
 * Riferimenti bibliografici principali:
 *   - Banister EW. Modeling elite athletic performance. 1991.
 *   - Morton RH. Modeling human performance in running. 1990.
 *   - Karvonen MJ. The effects of training on heart rate. 1957.
 *   - Tanaka H. Age-predicted maximal heart rate revisited. 2001.
 *   - Seiler S. What is best practice for training intensity distribution. 2010.
 *
 * Queste formule sono lo standard della letteratura amatoriale.
 * Non sono diagnosi, non sono prescrizioni, non sostituiscono un
 * professionista. Il modulo rispetta il posizionamento "diario" di PACE.
 */

// ============================================================================
// TIPI
// ============================================================================

/** Minimal subset of WorkoutLog needed by the model.
 *  Ri-dichiarato localmente per isolare questo modulo da pace-engine. */
export interface LoadLogInput {
  /** ISO timestamp of when the workout happened, or undefined for freshly-created logs */
  loggedAt?: string | null;
  /** Duration in minutes */
  duration: number;
  /** Average heart rate in bpm */
  hrAvg: number;
  /** Peak heart rate in bpm (optional) */
  hrMax?: number | null;
  /** 1-10 perceived exertion */
  rpe: number;
  /** Session tag */
  sessionType: string;
  /** Whether the session was skipped (no training effect) */
  skipped?: boolean;
}

/** Minimal profile fields used by the model. */
export interface LoadProfileInput {
  age: number;
  sex: "M" | "F";
  /** Optional resting HR — defaults to 60 if not provided */
  hrRest?: number | null;
}

/** Result of HRmax estimation. */
export interface HRmaxEstimate {
  /** Value actually to use in downstream calculations */
  value: number;
  /** Theoretical Tanaka baseline, always reported for transparency */
  theoretical: number;
  /** Empirical p95 from logs, null if no quality peaks available */
  empirical: number | null;
  /** Which input dominated the final value */
  source: "theoretical" | "empirical" | "blended";
  /** Confidence in the empirical component */
  confidence: "low" | "medium" | "high";
  /** Count of high-effort sessions used to estimate empirical */
  sampleSize: number;
}

/** A Karvonen training zone. */
export interface HRZone {
  name: string;
  shortLabel: "Z2" | "Z3" | "Z4" | "Z5";
  description: string;
  /** Lower bound bpm (inclusive) */
  low: number;
  /** Upper bound bpm (inclusive) */
  high: number;
  /** Percentage of HR reserve the zone corresponds to */
  hrrPct: [number, number];
}

/** Full zone set. */
export interface HRZoneSet {
  hrMax: number;
  hrRest: number;
  hrReserve: number;
  zones: HRZone[];
}

/** Output of load state computation. */
export interface LoadState {
  /** Chronic Training Load (42-day EWMA of TRIMP) — proxy for fitness */
  ctl: number;
  /** Acute Training Load (7-day EWMA of TRIMP) — proxy for fatigue */
  atl: number;
  /** Training Stress Balance = CTL − ATL — proxy for form/readiness */
  tsb: number;
  /** Qualitative readiness bucket */
  readiness: ReadinessState;
  /** Date (ISO yyyy-mm-dd) the state refers to */
  asOfDate: string;
  /** How many usable (non-skipped, with loggedAt) logs were used */
  sessionsUsed: number;
}

export type ReadinessState =
  | "fresh" // very rested, good for quality
  | "ready" // normal, balanced
  | "productive" // slightly fatigued but in a building phase
  | "strained" // high load, caution
  | "overreached" // clearly fatigued, reduce load
  | "insufficient-data"; // fewer than 3 usable logs

/** TRIMP for a single session. */
export interface SessionLoad {
  trimp: number;
  /** % of HR reserve used (0-1) */
  hrrRatio: number;
  /** Whether we had to estimate hrRest or fell back to default */
  hrRestSource: "user-provided" | "default";
}

// ============================================================================
// COSTANTI
// ============================================================================

/** EWMA half-life for chronic training load (fitness). Industry standard: 42d. */
const CTL_TAU_DAYS = 42;
/** EWMA half-life for acute training load (fatigue). Industry standard: 7d. */
const ATL_TAU_DAYS = 7;

/** Exponential decay factor per day, derived once. */
const CTL_DECAY = Math.exp(-1 / CTL_TAU_DAYS);
const ATL_DECAY = Math.exp(-1 / ATL_TAU_DAYS);

/** Default resting HR if the user didn't provide one. Conservative midrange. */
const DEFAULT_HR_REST = 60;

/** Physiological bounds for HRmax sanity-checks. Outside these ranges we trust
 *  the theoretical estimate regardless of what the data says. */
const HRMAX_MIN_BPM = 140;
const HRMAX_MAX_BPM = 220;

/** Max deviation (bpm) between empirical and theoretical HRmax before we
 *  treat the empirical reading as suspect (sensor artefact, data entry error). */
const HRMAX_DEVIATION_THRESHOLD = 20;

/** Readiness thresholds on TSB (the canonical TrainingPeaks bands). */
const TSB_FRESH = 15;
const TSB_READY = 5;
const TSB_PRODUCTIVE = -10;
const TSB_STRAINED = -20;
// below TSB_STRAINED → overreached

/** Sex-specific exponential weighting for Banister TRIMP. */
const TRIMP_SEX_FACTOR_M = 1.92;
const TRIMP_SEX_FACTOR_F = 1.67;

// ============================================================================
// 1. HRmax EMPIRICA
// ============================================================================

/**
 * Stima la HRmax personalizzata combinando:
 *   (a) la formula di Tanaka (208 − 0,7×età), sempre disponibile
 *   (b) il 95° percentile dei picchi osservati in sessioni ad alto sforzo
 *
 * Logica di blending:
 *   - Se non ci sono picchi high-effort → usa la teorica (confidence: low)
 *   - Se l'empirica si discosta dalla teorica di più di 20 bpm → sospetta
 *     errore del sensore, resta sulla teorica (confidence: low)
 *   - Altrimenti blending pesato: più sessioni high-effort → più peso
 *     all'empirica (max 0.85, per non azzerare mai la teorica)
 *
 * Importante: evitiamo di selezionare `.slice(0.95 * N)` su array molto piccoli,
 * dove il p95 coincide col massimo. Preferiamo il massimo osservato quando
 * sampleSize < 5, e il p95 solo quando ha senso statisticamente.
 */
export function estimateHRmax(
  profile: LoadProfileInput,
  logs: LoadLogInput[],
): HRmaxEstimate {
  const theoretical = Math.round(208 - 0.7 * profile.age);

  // Only count logs that (a) are not skipped, (b) have hrMax recorded,
  // (c) represent genuine high-effort sessions. RPE ≥ 8 OR sessionType
  // in {quality, race} is the gate.
  const highEffortPeaks = logs
    .filter(
      (l) =>
        !l.skipped &&
        typeof l.hrMax === "number" &&
        l.hrMax >= HRMAX_MIN_BPM &&
        l.hrMax <= HRMAX_MAX_BPM &&
        (l.rpe >= 8 || l.sessionType === "quality" || l.sessionType === "race"),
    )
    .map((l) => l.hrMax as number);

  if (highEffortPeaks.length === 0) {
    return {
      value: theoretical,
      theoretical,
      empirical: null,
      source: "theoretical",
      confidence: "low",
      sampleSize: 0,
    };
  }

  // For small samples use max; for larger samples use p95 to resist outliers
  // (e.g. a single sensor glitch showing 210 bpm for 2 seconds).
  const sorted = [...highEffortPeaks].sort((a, b) => a - b);
  const empirical =
    sorted.length < 5
      ? sorted[sorted.length - 1]
      : sorted[Math.floor(sorted.length * 0.95)];

  // If empirical is wildly off from theoretical, distrust it.
  if (Math.abs(empirical - theoretical) > HRMAX_DEVIATION_THRESHOLD) {
    return {
      value: theoretical,
      theoretical,
      empirical,
      source: "theoretical",
      confidence: "low",
      sampleSize: highEffortPeaks.length,
    };
  }

  // Confidence based on sample size.
  const confidence: "low" | "medium" | "high" =
    highEffortPeaks.length >= 5
      ? "high"
      : highEffortPeaks.length >= 3
        ? "medium"
        : "low";

  // Blend weights. Even at "high" confidence we keep 15% on theoretical —
  // observed peaks can still underestimate true max if the athlete never
  // actually pushed to redline.
  const empiricalWeight =
    confidence === "high" ? 0.85 : confidence === "medium" ? 0.6 : 0.3;

  const blended = Math.round(
    empirical * empiricalWeight + theoretical * (1 - empiricalWeight),
  );

  return {
    value: blended,
    theoretical,
    empirical,
    source: "blended",
    confidence,
    sampleSize: highEffortPeaks.length,
  };
}

// ============================================================================
// 2. ZONE KARVONEN
// ============================================================================

/**
 * Zone cardiache basate sulla frequenza di riserva (FCR/HRR).
 * Formula Karvonen: target = hrRest + pct × (hrMax − hrRest)
 *
 * Molto più accurata di %HRmax perché tiene conto della HR a riposo,
 * che varia sensibilmente fra atleti (un runner allenato ha spesso
 * hrRest 45-55, un principiante 65-75). Senza Karvonen, le zone
 * basate su %HRmax sono sistematicamente spostate in alto per atleti
 * con bassa hrRest, e in basso per principianti.
 */
export function computeZonesKarvonen(
  hrMax: number,
  hrRest: number = DEFAULT_HR_REST,
): HRZoneSet {
  // Guard against nonsense input (e.g. user typed 250 in hrRest field).
  const safeHrRest = clamp(hrRest, 35, 100);
  const safeHrMax = clamp(hrMax, HRMAX_MIN_BPM, HRMAX_MAX_BPM);

  // If somehow hrRest >= hrMax, bail out to sensible defaults rather than
  // producing negative zones.
  const hrr = Math.max(40, safeHrMax - safeHrRest);

  const zoneAtPct = (low: number, high: number) => ({
    low: Math.round(safeHrRest + hrr * low),
    high: Math.round(safeHrRest + hrr * high),
    hrrPct: [low, high] as [number, number],
  });

  const z2 = zoneAtPct(0.65, 0.75);
  const z3 = zoneAtPct(0.75, 0.85);
  const z4 = zoneAtPct(0.85, 0.92);
  const z5 = zoneAtPct(0.92, 1.0);

  return {
    hrMax: safeHrMax,
    hrRest: safeHrRest,
    hrReserve: hrr,
    zones: [
      {
        name: "Intensità leggera",
        shortLabel: "Z2",
        description: "Corsa conversazionale, recupero",
        ...z2,
      },
      {
        name: "Intensità media",
        shortLabel: "Z3",
        description: "Resistenza di base",
        ...z3,
      },
      {
        name: "Intensità medio-alta",
        shortLabel: "Z4",
        description: "Sforzo impegnativo sostenibile",
        ...z4,
      },
      {
        name: "Intensità alta",
        shortLabel: "Z5",
        description: "Tratti brevi e intensi",
        ...z5,
      },
    ],
  };
}

/**
 * Convenience: returns the zone a given average HR falls into.
 * Boundaries are inclusive on the low end, exclusive on the high end,
 * except Z5 which includes its high bound.
 */
export function classifyIntoZone(
  hrAvg: number,
  zones: HRZoneSet,
): HRZone | null {
  for (let i = 0; i < zones.zones.length; i++) {
    const z = zones.zones[i];
    const isLast = i === zones.zones.length - 1;
    if (hrAvg >= z.low && (hrAvg < z.high || (isLast && hrAvg <= z.high))) {
      return z;
    }
  }
  // Below Z2: classify as recovery / very light
  if (hrAvg < zones.zones[0].low) {
    return {
      name: "Recupero",
      shortLabel: "Z2",
      description: "Sotto la zona di fondo",
      low: 0,
      high: zones.zones[0].low,
      hrrPct: [0, 0.65],
    };
  }
  return null;
}

// ============================================================================
// 3. TRIMP (SINGLE SESSION LOAD)
// ============================================================================

/**
 * TRIMP — Training Impulse, formulazione di Banister-Morton con pesatura
 * esponenziale e correzione per sesso.
 *
 *    hrrRatio = (hrAvgSession − hrRest) / (hrMax − hrRest)
 *    y        = exp(k · hrrRatio)      con k ≈ 1.92 (M) / 1.67 (F)
 *    trimp    = durata_minuti · hrrRatio · y
 *
 * Il termine esponenziale `y` è ciò che differenzia TRIMP da "durata ×
 * intensità lineare": una sessione a intensità 90% pesa molto più del doppio
 * di una a 45%, coerentemente con la risposta fisiologica.
 *
 * Per sessioni skipped o senza HR media valida restituiamo 0.
 * Nessun carico = nessun effetto di training. Questa è la scelta corretta
 * anche per una sessione di 60' a FC zero (dato palesemente rotto).
 */
export function computeSessionTRIMP(
  log: LoadLogInput,
  profile: LoadProfileInput,
  hrMaxOverride?: number,
): SessionLoad {
  if (log.skipped || !log.duration || !log.hrAvg) {
    return {
      trimp: 0,
      hrrRatio: 0,
      hrRestSource:
        profile.hrRest != null && profile.hrRest > 0
          ? "user-provided"
          : "default",
    };
  }

  const hrRest =
    profile.hrRest != null && profile.hrRest > 0
      ? profile.hrRest
      : DEFAULT_HR_REST;
  const hrMax =
    hrMaxOverride ?? Math.round(208 - 0.7 * profile.age); // fallback to theoretical

  const hrr = Math.max(40, hrMax - hrRest);
  // Clamp hrrRatio into [0,1.05]. A ratio > 1 means hrAvg > hrMax (possible
  // briefly with sensor spikes or if our hrMax estimate is too conservative).
  // We allow a tiny overshoot before capping to avoid nonsense TRIMP values.
  const rawRatio = (log.hrAvg - hrRest) / hrr;
  const hrrRatio = clamp(rawRatio, 0, 1.05);

  const k = profile.sex === "F" ? TRIMP_SEX_FACTOR_F : TRIMP_SEX_FACTOR_M;
  const y = Math.exp(k * hrrRatio);
  const trimp = log.duration * hrrRatio * y;

  return {
    trimp: Math.round(trimp),
    hrrRatio: Math.round(hrrRatio * 1000) / 1000,
    hrRestSource:
      profile.hrRest != null && profile.hrRest > 0
        ? "user-provided"
        : "default",
  };
}

// ============================================================================
// 4. CTL / ATL / TSB
// ============================================================================

/**
 * Calcola lo stato di carico all'inizio di `asOfDate` (default: oggi).
 *
 * Algoritmo:
 *   1. Ordina i log cronologicamente.
 *   2. Per ogni log: propaga CTL/ATL con decadimento sui giorni passati
 *      dall'ultimo log, poi assorbi il TRIMP del log corrente.
 *   3. A fine serie, propaga ulteriormente CTL/ATL fino ad asOfDate.
 *
 * Note sulle scelte:
 *   - Raggruppiamo i log sullo stesso giorno sommando i loro TRIMP (doppia
 *     sessione giornaliera → carico cumulativo).
 *   - Log senza `loggedAt` vengono ignorati (non possiamo piazzarli sulla
 *     timeline senza data). Sono plausibilmente bozze o dati corrotti.
 *   - Usiamo EWMA col modello classico "impulse response" di Banister:
 *     dailyState = prevState × decay + todayImpulse × (1 − decay).
 *     Implementazioni alternative moltiplicano l'impulso per 1 anziché
 *     (1 − decay); abbiamo scelto la convenzione TrainingPeaks per coerenza
 *     con i valori a cui i runner sono abituati.
 */
export function computeLoadState(
  logs: LoadLogInput[],
  profile: LoadProfileInput,
  asOfDate: Date = new Date(),
): LoadState {
  const asOf = startOfDayUTC(asOfDate);
  const asOfIso = asOf.toISOString().slice(0, 10);

  // Filter to usable logs and sort chronologically.
  const usable = logs
    .filter((l) => !l.skipped && l.loggedAt && l.hrAvg > 0 && l.duration > 0)
    .map((l) => ({ ...l, _date: startOfDayUTC(new Date(l.loggedAt as string)) }))
    .filter((l) => l._date.getTime() <= asOf.getTime())
    .sort((a, b) => a._date.getTime() - b._date.getTime());

  if (usable.length < 3) {
    return {
      ctl: 0,
      atl: 0,
      tsb: 0,
      readiness: "insufficient-data",
      asOfDate: asOfIso,
      sessionsUsed: usable.length,
    };
  }

  // Estimate HRmax once from the full history so TRIMP scaling is consistent.
  const hrMaxEst = estimateHRmax(profile, logs);

  // Group logs by day (same-day sessions sum their TRIMP).
  const byDay = new Map<number, number>();
  for (const log of usable) {
    const t = log._date.getTime();
    const sessionLoad = computeSessionTRIMP(log, profile, hrMaxEst.value);
    byDay.set(t, (byDay.get(t) ?? 0) + sessionLoad.trimp);
  }

  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);

  let ctl = 0;
  let atl = 0;
  let prevDay = sortedDays[0];

  for (const dayTs of sortedDays) {
    // Decay from the previous logged day to this one.
    const gap = daysBetween(prevDay, dayTs);
    for (let i = 0; i < gap; i++) {
      ctl *= CTL_DECAY;
      atl *= ATL_DECAY;
    }

    const trimpToday = byDay.get(dayTs) ?? 0;
    // Standard TrainingPeaks EWMA form.
    ctl = ctl * CTL_DECAY + trimpToday * (1 - CTL_DECAY);
    atl = atl * ATL_DECAY + trimpToday * (1 - ATL_DECAY);
    prevDay = dayTs;
  }

  // Propagate from the last logged day up to asOfDate.
  const tailGap = daysBetween(prevDay, asOf.getTime());
  for (let i = 0; i < tailGap; i++) {
    ctl *= CTL_DECAY;
    atl *= ATL_DECAY;
  }

  const tsb = ctl - atl;

  return {
    ctl: round1(ctl),
    atl: round1(atl),
    tsb: round1(tsb),
    readiness: tsbToReadiness(tsb, ctl),
    asOfDate: asOfIso,
    sessionsUsed: usable.length,
  };
}

/** Maps TSB into qualitative readiness buckets.
 *  When CTL is very low (< 15) we don't label "overreached" even if TSB is
 *  negative — a new runner shouldn't be told they're overtrained when they
 *  simply haven't built any baseline yet. */
function tsbToReadiness(tsb: number, ctl: number): ReadinessState {
  if (ctl < 15) {
    // Too little fitness to be overreached; at most "ready" or "productive".
    if (tsb >= TSB_READY) return "ready";
    return "productive";
  }
  if (tsb >= TSB_FRESH) return "fresh";
  if (tsb >= TSB_READY) return "ready";
  if (tsb >= TSB_PRODUCTIVE) return "productive";
  if (tsb >= TSB_STRAINED) return "strained";
  return "overreached";
}

// ============================================================================
// 5. STRINGHE LEGGIBILI PER LA UI
// ============================================================================

/** Human-readable label in Italian for the UI. */
export function readinessLabel(r: ReadinessState): string {
  switch (r) {
    case "fresh":
      return "Molto fresco";
    case "ready":
      return "Pronto";
    case "productive":
      return "In costruzione";
    case "strained":
      return "Carico alto";
    case "overreached":
      return "Affaticato";
    case "insufficient-data":
      return "Raccogliendo dati";
  }
}

/** Short descriptive sentence for the UI tile / tooltip. */
export function readinessDescription(state: LoadState): string {
  switch (state.readiness) {
    case "fresh":
      return "Ben riposato. Un giorno buono per una sessione di qualità se ti va.";
    case "ready":
      return "Carico e fatica in equilibrio. Continua col piano.";
    case "productive":
      return "Stai accumulando lavoro. Condizione tipica in fase di costruzione.";
    case "strained":
      return "Fatica oltre la forma. Valuta un allenamento più leggero.";
    case "overreached":
      return "Stanchezza accumulata. Spesso la scelta migliore è riposare.";
    case "insufficient-data":
      return `Servono almeno 3 sessioni registrate (ne hai ${state.sessionsUsed}) per stimare la forma.`;
  }
}

/** Compact one-line status for dashboard chips. */
export function loadStateSummary(state: LoadState): string {
  if (state.readiness === "insufficient-data") {
    return "Forma: raccogliendo dati";
  }
  const sign = state.tsb >= 0 ? "+" : "";
  return `Forma ${sign}${state.tsb} · ${readinessLabel(state.readiness)}`;
}

// ============================================================================
// 6. METADATA PER IL PROMPT AI
// ============================================================================

/** Compact payload to inject into the AI prompt under a "Stato di forma" block.
 *  The AI never calculates — it only reads these strings and comments. */
export interface AIPromptLoadBlock {
  asOfDate: string;
  ctl: number;
  atl: number;
  tsb: number;
  readiness: ReadinessState;
  readinessLabel: string;
  readinessDescription: string;
  sessionsUsed: number;
  /** Plain-text block ready to drop into a user prompt section */
  formattedBlock: string;
}

export function buildAIPromptLoadBlock(state: LoadState): AIPromptLoadBlock {
  const label = readinessLabel(state.readiness);
  const desc = readinessDescription(state);
  const formattedBlock =
    state.readiness === "insufficient-data"
      ? `Stato di forma: dati insufficienti (${state.sessionsUsed} sessioni registrate, ne servono almeno 3). Non citare numeri di fitness/fatica in output.`
      : [
          `Stato di forma al ${state.asOfDate}:`,
          `- Fitness (CTL, 42d): ${state.ctl}`,
          `- Fatica (ATL, 7d): ${state.atl}`,
          `- Forma (TSB = CTL − ATL): ${state.tsb}`,
          `- Stato: ${label} — ${desc}`,
        ].join("\n");

  return {
    asOfDate: state.asOfDate,
    ctl: state.ctl,
    atl: state.atl,
    tsb: state.tsb,
    readiness: state.readiness,
    readinessLabel: label,
    readinessDescription: desc,
    sessionsUsed: state.sessionsUsed,
    formattedBlock,
  };
}

// ============================================================================
// 7. INTEGRAZIONE — SELETTORE DI INTENSITÀ PER LA PROSSIMA SESSIONE
// ============================================================================

/** Suggerisce un'aggiustatura moltiplicativa per la prossima sessione.
 *  Valori < 1 → alleggerire; > 1 → caricare un po'. Usalo per modulare
 *  durata/intensità di un piano altrimenti statico, senza generare da zero. */
export function suggestLoadAdjustment(state: LoadState): {
  factor: number;
  rationale: string;
} {
  switch (state.readiness) {
    case "overreached":
      return {
        factor: 0.7,
        rationale: "Fatica accumulata oltre la forma. Alleggerire di circa il 30%.",
      };
    case "strained":
      return {
        factor: 0.85,
        rationale: "Carico alto. Ridurre di circa il 15% o scegliere l'estremità bassa del range FC.",
      };
    case "productive":
      return {
        factor: 1.0,
        rationale: "Condizione tipica in fase di costruzione. Mantenere il piano com'è.",
      };
    case "ready":
      return {
        factor: 1.0,
        rationale: "Equilibrio tra carico e forma. Seguire il piano.",
      };
    case "fresh":
      return {
        factor: 1.05,
        rationale: "Molto fresco. Si può eventualmente caricare leggermente.",
      };
    case "insufficient-data":
      return {
        factor: 1.0,
        rationale: "Non ci sono abbastanza dati per aggiustare. Procedere col piano.",
      };
  }
}

// ============================================================================
// HELPERS INTERNI
// ============================================================================

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Truncate to start-of-day UTC to avoid TZ drift when counting day gaps. */
function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole-day gap between two epoch-ms timestamps. */
function daysBetween(aMs: number, bMs: number): number {
  return Math.max(0, Math.round((bMs - aMs) / (1000 * 60 * 60 * 24)));
}

// ============================================================================
// EXPORT DI FACCIATA — punto di ingresso unificato
// ============================================================================

export const LoadModel = {
  estimateHRmax,
  computeZonesKarvonen,
  classifyIntoZone,
  computeSessionTRIMP,
  computeLoadState,
  readinessLabel,
  readinessDescription,
  loadStateSummary,
  buildAIPromptLoadBlock,
  suggestLoadAdjustment,
};
