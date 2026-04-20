// PACE — Deterministic engine (Cap. 3 + Cap. 4 logic)
// All training math is here, in code. No LLM does arithmetic.

export type Sex = "M" | "F";
export type Level = "beginner" | "intermediate" | "advanced";
export type SessionType = "easy" | "quality" | "medium" | "long" | "race" | "freeform";

export interface Profile {
  age: number;
  weight: number;
  sex: Sex;
  currentBest: number;     // minutes for 10K
  targetTime: number;      // minutes target
  weeklyFreq: number;
  daysUntilRace: number;
  level: Level;
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

export interface Plan {
  weeks: Week[];
  target: number;
  adjustedEstimate: number | null;
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
}

export interface Zone {
  name: string;
  description: string;
  range: string;
  highlight: boolean;
}

export interface ZonesResult {
  hrMax: number;
  zones: Zone[];
}

// ---------- HR zones (Tanaka formula) ----------
export function computeZones(profile: Profile): ZonesResult {
  const hrMax = Math.round(208 - 0.7 * profile.age);
  const zones: Zone[] = [
    {
      name: "Intensità leggera",
      description: "Corsa conversazionale, recupero",
      range: `${Math.round(hrMax * 0.65)}–${Math.round(hrMax * 0.75)}`,
      highlight: false,
    },
    {
      name: "Intensità media",
      description: "Resistenza di base",
      range: `${Math.round(hrMax * 0.75)}–${Math.round(hrMax * 0.85)}`,
      highlight: false,
    },
    {
      name: "Intensità medio-alta",
      description: "Sforzo impegnativo sostenibile",
      range: `${Math.round(hrMax * 0.85)}–${Math.round(hrMax * 0.9)}`,
      highlight: true,
    },
    {
      name: "Intensità alta",
      description: "Tratti brevi e intensi",
      range: `${Math.round(hrMax * 0.9)}–${Math.round(hrMax * 0.95)}`,
      highlight: false,
    },
  ];
  return { hrMax, zones };
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

// ---------- Plan generation (Cap. 2.4) ----------
export function generatePlan(profile: Profile): Plan {
  const { hrMax } = computeZones(profile);
  const z2: [number, number] = [Math.round(hrMax * 0.65), Math.round(hrMax * 0.75)];
  const z3: [number, number] = [Math.round(hrMax * 0.75), Math.round(hrMax * 0.85)];
  const z4: [number, number] = [Math.round(hrMax * 0.85), Math.round(hrMax * 0.9)];
  const z5: [number, number] = [Math.round(hrMax * 0.9), Math.round(hrMax * 0.95)];
  const racePace = Math.round(hrMax * 0.88);

  const numWeeks = Math.max(2, Math.min(4, Math.floor(profile.daysUntilRace / 7)));
  const weeks: Week[] = [];

  for (let w = 0; w < numWeeks; w++) {
    const isTaper = w === numWeeks - 1;
    const isFirst = w === 0;

    if (isTaper) {
      weeks.push({
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
            notes:
              "Nelle settimane che precedono una gara, la letteratura amatoriale suggerisce tipicamente di alleggerire il carico. Il corpo ha già fatto il lavoro.",
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
            notes:
              'Questa sessione viene spesso descritta come un "promemoria" del ritmo, non un allenamento di carico. Fermarsi prima di sentirsi stanchi è una scelta ragionevole.',
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
              `Ritmo ipotetico per ${profile.targetTime}': ${paceFromTime(profile.targetTime)}/km`,
            ],
            notes:
              "Partire troppo forte è l'errore più comunemente segnalato nella letteratura amatoriale. Molti runner riferiscono che finire con un po' di benzina nel serbatoio rende la gara più piacevole.",
          },
        ],
      });
    } else if (isFirst) {
      weeks.push({
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
            notes:
              'Gli allenamenti percepiti come "troppo facili" spesso sono quelli che fanno più differenza nel tempo, contrariamente all\'intuizione.',
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
            notes:
              "Lo sforzo percepito di riferimento per questo tipo di lavoro, secondo la letteratura amatoriale, è intorno a 7/10: impegnativo ma non massimale. Un 9/10 sostenuto suggerisce di rallentare un po'.",
          },
          {
            name: "Lungo lento",
            type: "long",
            duration: 70,
            targetHR: `${z2[0]}-${z2[1] + 5}`,
            blocks: [
              `Circa 70' di corsa continua a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
              "Idratati regolarmente se hai la bottiglia",
              "Se serve camminare brevi tratti, va bene",
            ],
            notes:
              "Il lungo lento è uno degli allenamenti più citati nella letteratura amatoriale per gare di resistenza. Non è pensato per essere veloce.",
          },
        ],
      });
    } else {
      weeks.push({
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
            notes:
              "Respirazione decisamente accelerata ma non al limite. Se non riesci a completare un blocco, rallentare è sempre un'opzione ragionevole.",
          },
          {
            name: "Corsa continua medio-alta",
            type: "medium",
            duration: 40,
            targetHR: `${z3[1]}-${z4[0]}`,
            blocks: [
              `Circa 40' di corsa continua a intensità che si sente ma è sostenibile (${z3[1]}-${z4[0]} bpm)`,
              "Non deve essere faticosa come le ripetute",
              "Non deve essere facile come il lungo",
            ],
            notes:
              'La "via di mezzo" tra lento e veloce. Nella letteratura amatoriale viene citata spesso per la preparazione alle gare sui 10 km.',
          },
          {
            name: "Lungo lento",
            type: "long",
            duration: 75,
            targetHR: `${z2[0]}-${z2[1] + 5}`,
            blocks: [
              `Circa 75' a intensità leggera (${z2[0]}-${z2[1] + 5} bpm)`,
              "Possibile inserire 5' di ritmo medio verso metà percorso se le gambe rispondono bene",
              "Porta acqua se fa caldo",
            ],
            notes:
              "Costruisce resistenza generale. Viene indicato come più efficace di tanti allenamenti veloci concentrati in poco tempo.",
          },
        ],
      });
    }
  }

  return { weeks, target: profile.targetTime, adjustedEstimate: null };
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

// ---------- Workout analysis (Cap. 3.3 + 3.4) ----------
export interface AnalysisInsight {
  iconKey: "wind" | "check" | "flame" | "heart" | "zap";
  title: string;
  text: string;
}

export interface Analysis {
  summary: string;
  pace: string;
  hrAvg: number;
  intensityLabel: string;
  verdictTitle: string;
  verdictText: string;
  insights: AnalysisInsight[];
  prediction: { time: string; text: string } | null;
  nextMove: string;
}

export function analyzeWorkout(
  log: WorkoutLog,
  profile: Profile,
  plan: Plan,
  allLogs: WorkoutLog[]
): Analysis {
  const { hrMax } = computeZones(profile);
  const hrPct = (log.hrAvg / hrMax) * 100;
  const paceMinKm = log.duration / log.distance;
  const pace = `${Math.floor(paceMinKm)}'${String(Math.round((paceMinKm - Math.floor(paceMinKm)) * 60)).padStart(2, "0")}"`;

  let intensityLabel = "leggera";
  if (hrPct >= 90) intensityLabel = "alta";
  else if (hrPct >= 85) intensityLabel = "medio-alta";
  else if (hrPct >= 75) intensityLabel = "media";
  else if (hrPct >= 65) intensityLabel = "leggera";
  else intensityLabel = "molto leggera";

  let verdictTitle = "";
  let verdictText = "";
  const targetType = log.sessionType;

  if (targetType === "easy" || targetType === "long") {
    if (hrPct > 78) {
      verdictTitle = "Intensità sopra i riferimenti per un lento";
      verdictText = `La FC media si colloca intorno al ${Math.round(hrPct)}% della FC massima teorica. Per sessioni descritte come "lente" o "facili", i riferimenti della letteratura amatoriale indicano tipicamente intensità sotto il 75%. Potrebbe essere utile rallentare nelle prossime sessioni facili — anche camminando tratti, a inizio percorso succede spesso.`;
    } else {
      verdictTitle = "Intensità in linea con i riferimenti";
      verdictText = `FC media intorno al ${Math.round(hrPct)}% della stima massima. Per una sessione descritta come "lenta", è nella fascia tipica descritta nella letteratura amatoriale.`;
    }
  } else if (targetType === "quality") {
    if (hrPct >= 85 && hrPct <= 93) {
      verdictTitle = "Intensità centrata sul tipo di lavoro";
      verdictText = `FC media intorno al ${Math.round(hrPct)}% della massima teorica, in linea con i riferimenti tipici per sessioni di lavoro intenso. Con uno sforzo percepito di ${log.rpe}/10 il quadro è coerente.`;
    } else if (hrPct < 85) {
      verdictTitle = "Intensità sotto i riferimenti per un lavoro veloce";
      verdictText = `Per sessioni di ripetute i riferimenti amatoriali indicano intensità sopra l'85% della FC massima. Qui la media si è fermata al ${Math.round(hrPct)}%. Può voler dire che le pause sono state lunghe, o che i blocchi intensi sono stati meno spinti.`;
    } else {
      verdictTitle = "Intensità elevata";
      verdictText = `Il ${Math.round(hrPct)}% della FC massima è una fascia alta. Non è necessariamente un problema, ma se succede ripetutamente potresti arrivare stanco alle sessioni successive.`;
    }
  } else {
    verdictTitle = "Lettura del dato";
    verdictText = `FC media circa ${Math.round(hrPct)}% della massima teorica, fascia di intensità ${intensityLabel}.`;
  }

  const insights: AnalysisInsight[] = [];

  if (log.cadence) {
    const cad = log.cadence;
    if (cad < 160) {
      insights.push({
        iconKey: "wind",
        title: "Cadenza bassa rispetto ai riferimenti",
        text: `${cad} passi/min è sotto la fascia che la letteratura amatoriale cita come "economica" (165-175). Passi più brevi e frequenti sono spesso più efficienti, ma non c'è urgenza di cambiarla.`,
      });
    } else if (cad >= 165) {
      insights.push({
        iconKey: "check",
        title: "Cadenza nei riferimenti tipici",
        text: `${cad} passi/min è dentro la fascia spesso associata a una corsa economica nella letteratura amatoriale.`,
      });
    }
  }

  if (log.rpe >= 8 && (targetType === "easy" || targetType === "long")) {
    insights.push({
      iconKey: "flame",
      title: "Sforzo percepito alto per una sessione lenta",
      text:
        "Un 8+ su un allenamento descritto come facile può segnalare stanchezza accumulata, condizioni ambientali difficili, o semplicemente una giornata storta. Ascolta il corpo nelle prossime 24-48h.",
    });
  }

  if (log.hrMax) {
    const hrReserve = log.hrMax - log.hrAvg;
    if (hrReserve < 10 && (targetType === "easy" || targetType === "long")) {
      insights.push({
        iconKey: "heart",
        title: "FC media e massima molto vicine",
        text: `Media ${log.hrAvg} e massima ${log.hrMax} indicano una corsa molto piatta sull'alto. Spesso è segnale di deriva cardiaca da caldo/disidratazione o partenza troppo veloce.`,
      });
    }
  }

  if (paceMinKm < 5 && targetType === "easy") {
    insights.push({
      iconKey: "zap",
      title: "Ritmo sostenuto per una sessione facile",
      text: `${pace}/km è già un ritmo impegnativo. I giorni facili secondo la letteratura amatoriale dovrebbero sembrare "troppo lenti": serve quello per recuperare.`,
    });
  }

  let prediction: Analysis["prediction"] = null;
  if (log.distance >= 5 && hrPct >= 70) {
    const hrReserveRace = Math.round(hrMax * 0.9);
    const hrRatio = hrReserveRace / log.hrAvg;
    const racePaceMinKm = paceMinKm / Math.sqrt(hrRatio);
    const raceTime = Math.round(racePaceMinKm * 10);
    prediction = {
      time: `${raceTime}'`,
      text: `Estrapolazione statistica da questo singolo allenamento. Target iniziale: ${profile.targetTime}'. ${
        raceTime < profile.targetTime
          ? "I dati suggeriscono margine."
          : raceTime <= profile.targetTime + 2
          ? "I dati sono in linea."
          : "I dati suggeriscono che l'obiettivo iniziale era ambizioso."
      }`,
    };
  }

  const nextSession = findNextSession(plan, allLogs);
  let nextMove = "";
  if (nextSession) {
    nextMove = `Il prossimo spunto del diario è: ${nextSession.data.name} (circa ${nextSession.data.duration}'). `;
    if ((targetType === "easy" || targetType === "long") && hrPct > 78) {
      nextMove +=
        "Tieni presente che oggi sei andato un po' sopra i riferimenti per un lento: un giorno di riposo potrebbe aiutarti ad arrivare meglio alla prossima sessione.";
    } else {
      nextMove += "Come sempre, la sensazione del corpo batte qualsiasi indicazione dell'app.";
    }
  } else {
    nextMove = "Hai completato tutti gli spunti del diario. Buona gara.";
  }

  return {
    summary: `${log.distance} km in ${log.duration} min · ${pace}/km · FC media ${log.hrAvg} bpm`,
    pace,
    hrAvg: log.hrAvg,
    intensityLabel,
    verdictTitle,
    verdictText,
    insights,
    prediction,
    nextMove,
  };
}

export function computeAdjustedEstimate(logs: WorkoutLog[], profile: Profile): number {
  const qualityLogs = logs.filter(
    (l) => l.sessionType === "quality" || l.sessionType === "long" || l.sessionType === "medium"
  );
  if (qualityLogs.length === 0) return profile.targetTime;

  const { hrMax } = computeZones(profile);
  const estimates = qualityLogs.map((log) => {
    const paceMinKm = log.duration / log.distance;
    const hrRatio = (hrMax * 0.9) / log.hrAvg;
    return (paceMinKm / Math.sqrt(hrRatio)) * 10;
  });

  const avgEst = estimates.reduce((a, b) => a + b, 0) / estimates.length;
  return Math.round(avgEst * 0.7 + profile.targetTime * 0.3);
}

// ---------- Helpers ----------
export function formatTime(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

export function paceFromTime(totalMinutes: number): string {
  const paceMin = totalMinutes / 10;
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
