// PACE — Deterministic engine (Cap. 2 + Cap. 4 logic)
// All training math is here, in code. The LLM only writes textual analysis.

import { estimateHRmax, computeZonesKarvonen } from "./load-model";

export type Sex = "M" | "F";
export type Level = "beginner" | "intermediate" | "advanced";
export type SessionType = "easy" | "quality" | "medium" | "long" | "race" | "freeform";

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
}

export interface Session {
  name: string;
  type: SessionType;
  duration: number;
  targetHR?: string;
  blocks: string[];
  notes?: string;
}

export interface Week {
  theme: string;
  sessions: Session[];
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

// ---------- Plan generation (Cap. 2.4) — Adaptive phases ----------
export function generatePlan(profile: Profile): Plan {
  const { hrMax } = computeZones(profile);
  const z2: [number, number] = [Math.round(hrMax * 0.65), Math.round(hrMax * 0.75)];
  const z3: [number, number] = [Math.round(hrMax * 0.75), Math.round(hrMax * 0.85)];
  const z4: [number, number] = [Math.round(hrMax * 0.85), Math.round(hrMax * 0.9)];
  const z5: [number, number] = [Math.round(hrMax * 0.9), Math.round(hrMax * 0.95)];
  const racePace = Math.round(hrMax * 0.88);

  const days = profile.daysUntilRace;
  const totalWeeks = Math.max(1, Math.floor(days / 7));

  // "Lungo lento" duration scales with race distance (capped 60-120').
  // Approx: 5K → 60', 10K → 70', 21K → ~95-105', marathon → 120'.
  const raceDist = profile.raceDistance || 10;
  const baseLong = Math.max(60, Math.min(120, Math.round(raceDist * 7)));
  const longDuration = baseLong;
  const longBuildDuration = Math.min(120, baseLong + 10);
  const longIntensityDuration = Math.min(120, baseLong + 5);

  const baseWeek = (): Week => ({
    theme: "BASE + ATTIVAZIONE",
    sessions: [
      {
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
      },
      {
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
      },
      {
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
      },
    ],
  });

  const buildWeek = (): Week => ({
    theme: "COSTRUZIONE",
    sessions: [
      {
        name: "Corsa facile",
        type: "easy",
        duration: 50,
        targetHR: `${z2[0]}-${z2[1]}`,
        blocks: [
          `50' continui a intensità leggera (${z2[0]}-${z2[1]} bpm)`,
          "Tieni un ritmo che permetta di respirare con il naso a tratti",
        ],
      },
      {
        name: "Medio progressivo",
        type: "medium",
        duration: 45,
        targetHR: `${z3[1]}-${z4[0]}`,
        blocks: [
          "10' di attivazione lenta",
          `25' a intensità che si sente ma è sostenibile (${z3[1]}-${z4[0]} bpm)`,
          "10' di defaticamento",
        ],
      },
      {
        name: "Lungo lento",
        type: "long",
        duration: longBuildDuration,
        targetHR: `${z2[0]}-${z2[1] + 5}`,
        blocks: [`Circa ${longBuildDuration}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`, "Porta acqua se fa caldo"],
      },
    ],
  });

  const intensityWeek = (): Week => ({
    theme: "INTENSITÀ + SPECIFICITÀ",
    sessions: [
      {
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
      },
      {
        name: "Corsa continua medio-alta",
        type: "medium",
        duration: 40,
        targetHR: `${z3[1]}-${z4[0]}`,
        blocks: [
          `Circa 40' di corsa continua a intensità sostenibile (${z3[1]}-${z4[0]} bpm)`,
          "Non deve essere faticosa come le ripetute, non facile come il lungo",
        ],
      },
      {
        name: "Lungo lento",
        type: "long",
        duration: longIntensityDuration,
        targetHR: `${z2[0]}-${z2[1] + 5}`,
        blocks: [
          `Circa ${longIntensityDuration}' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
          "Possibile inserire 5' di ritmo medio verso metà percorso se le gambe rispondono bene",
        ],
      },
    ],
  });

  const specificityWeek = (): Week => ({
    theme: "RITMO GARA",
    sessions: [
      {
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
      },
      {
        name: "Corsa facile",
        type: "easy",
        duration: 40,
        targetHR: `${z2[0]}-${z2[1]}`,
        blocks: [`40' continui a intensità leggera (${z2[0]}-${z2[1]} bpm)`],
      },
      {
        name: "Medio in progressione",
        type: "medium",
        duration: 50,
        targetHR: `${z3[1]}-${z4[0]}`,
        blocks: [
          "20' di corsa facile",
          `20' progressivi fino a ritmo gara (${z3[1]}-${z4[0]} bpm)`,
          "10' di defaticamento",
        ],
      },
    ],
  });

  const taperWeek = (): Week => ({
    theme: "RALLENTAMENTO + GARA",
    sessions: [
      {
        name: "Corsa facile",
        type: "easy",
        duration: 45,
        targetHR: `${z2[0]}-${z2[1]}`,
        blocks: [
          `Circa 45' di corsa continua, mantenendo una FC indicativa tra ${z2[0]} e ${z2[1]} bpm`,
          "Se ti sembra troppo facile, probabilmente è il ritmo giusto",
          "Nella parte finale, qualche allungo breve se il corpo risponde bene",
        ],
        notes: "Nelle settimane che precedono una gara, la letteratura amatoriale suggerisce di alleggerire il carico.",
      },
      {
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
      },
      {
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
      },
    ],
  });

  const weeks: Week[] = [];
  let shortPrep = false;
  let veryShortPrep = false;

  if (days < 14) {
    // Very short: only race
    veryShortPrep = true;
    shortPrep = true;
    weeks.push(taperWeek());
  } else if (totalWeeks === 2) {
    shortPrep = true;
    weeks.push(specificityWeek());
    weeks.push(taperWeek());
  } else if (totalWeeks === 3) {
    shortPrep = true;
    weeks.push(intensityWeek());
    weeks.push(specificityWeek());
    weeks.push(taperWeek());
  } else if (totalWeeks <= 5) {
    weeks.push(baseWeek());
    if (totalWeeks === 5) weeks.push(buildWeek());
    weeks.push(intensityWeek());
    weeks.push(specificityWeek());
    weeks.push(taperWeek());
  } else {
    // 6+ weeks: full plan
    weeks.push(baseWeek());
    const buildCount = Math.min(totalWeeks - 4, 3);
    for (let i = 0; i < buildCount; i++) weeks.push(buildWeek());
    weeks.push(intensityWeek());
    weeks.push(specificityWeek());
    weeks.push(taperWeek());
  }

  return { weeks, target: profile.targetTime, adjustedEstimate: null, shortPrep, veryShortPrep };
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

  let verdictTitle = "";
  let verdictText = "";

  if (targetType === "easy" || targetType === "long") {
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
      verdictText = `Per sessioni di ripetute si indica sopra l'85% della FC massima. Qui la media si è fermata al ${hrPct}%.`;
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
