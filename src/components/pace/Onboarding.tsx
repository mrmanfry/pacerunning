import { useState } from "react";
import { ChevronRight, AlertTriangle, Info, CalendarIcon } from "lucide-react";
import type { Profile } from "@/lib/pace-engine";
import { daysBetween, estimateCurrentBestFromLevel } from "@/lib/pace-engine";

interface Props {
  onComplete: (p: Profile) => void;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultRaceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 56); // 8 weeks default
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDist(d: number): string {
  if (Number.isInteger(d)) return String(d);
  return String(Math.round(d));
}

const DISTANCE_PRESETS = [
  { v: 5, l: "5K" },
  { v: 10, l: "10K" },
  { v: 21.097, l: "21K" },
];

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Profile>({
    age: 29,
    weight: 60,
    sex: "M",
    currentBest: 58,
    targetTime: 55,
    weeklyFreq: 3,
    daysUntilRace: 56,
    raceDate: defaultRaceDate(),
    level: "intermediate",
    raceDistance: 10,
    hrRest: null,
    weeklyVolume: 20,
    recentLongRun: 60,
    currentBestEstimated: false,
  });
  const [customDistance, setCustomDistance] = useState<string>("");
  const [dontKnowBest, setDontKnowBest] = useState(false);
  const isPresetDistance = DISTANCE_PRESETS.some((p) => Math.abs(p.v - data.raceDistance) < 0.001);

  const showAgeWarning = data.age >= 65;
  const days = data.raceDate ? Math.max(0, daysBetween(todayISO(), data.raceDate)) : 0;
  const weeks = Math.max(1, Math.floor(days / 7));
  const today = todayISO();

  const onRaceDateChange = (iso: string) => {
    const d = Math.max(0, daysBetween(today, iso));
    setData({ ...data, raceDate: iso, daysUntilRace: d });
  };

  const onDistancePreset = (v: number) => {
    setData({ ...data, raceDistance: v });
    setCustomDistance("");
  };

  const onCustomDistance = (s: string) => {
    setCustomDistance(s);
    const n = parseFloat(s.replace(",", "."));
    if (!isNaN(n) && n > 0 && n <= 100) {
      setData({ ...data, raceDistance: n });
    }
  };

  const onToggleDontKnow = (next: boolean) => {
    setDontKnowBest(next);
    if (next) {
      // Stima conservativa basata su livello + volume
      const estimated = estimateCurrentBestFromLevel(data.level, data.weeklyVolume, data.raceDistance);
      setData({ ...data, currentBest: estimated, currentBestEstimated: true });
    } else {
      setData({ ...data, currentBestEstimated: false });
    }
  };

  // Quando level/volume/distance cambiano e l'utente è in modalità "non lo so",
  // ricalcoliamo la stima.
  const updateLevelOrVolume = (patch: Partial<Profile>) => {
    const merged = { ...data, ...patch };
    if (dontKnowBest) {
      merged.currentBest = estimateCurrentBestFromLevel(merged.level, merged.weeklyVolume, merged.raceDistance);
      merged.currentBestEstimated = true;
    }
    setData(merged);
  };

  // Validazione: obiettivo troppo ambizioso vs volume attuale?
  // Soglia conservativa: se la gara è ≥10K e volume <15km/sett, alert.
  // Se la gara è ≥21K e volume <25km/sett, alert.
  let volumeWarning: string | null = null;
  const vol = data.weeklyVolume ?? 0;
  if (data.raceDistance >= 21 && vol < 25) {
    volumeWarning = `Stai puntando a una mezza maratona (21K) con un volume attuale di circa ${vol} km/sett. È fattibile ma molto ambizioso: il piano sarà conservativo, ascolta il corpo e considera di rivedere l'obiettivo se la fatica si accumula.`;
  } else if (data.raceDistance >= 10 && data.raceDistance < 21 && vol < 15) {
    volumeWarning = `Volume attuale (~${vol} km/sett) abbastanza basso per puntare a ${formatDist(data.raceDistance)}K. Il piano sarà progressivo ma conservativo.`;
  } else if (data.raceDistance >= 30 && vol < 40) {
    volumeWarning = `Una maratona con ${vol} km/sett di volume attuale è un obiettivo molto ambizioso. Valuta se non sia meglio puntare a una mezza prima.`;
  }

  let prepHint = "";
  let prepHintTone: "ok" | "warn" | "alert" = "ok";
  if (days < 14) {
    prepHint = "⚠ Tempi molto stretti: il diario sarà essenziale e il target andrà preso come orientativo.";
    prepHintTone = "alert";
  } else if (weeks < 4) {
    prepHint = "Preparazione breve: piano conservativo, focus sul ritmo gara.";
    prepHintTone = "warn";
  } else if (weeks >= 6) {
    prepHint = "Tempi ottimi per una preparazione completa.";
    prepHintTone = "ok";
  } else {
    prepHint = "Piano standard con costruzione e specificità.";
    prepHintTone = "ok";
  }

  const steps = [
    {
      title: "DATI\nDI BASE",
      subtitle: "Servono per calcolare intensità indicative basate su formule standard",
      content: (
        <div className="space-y-6">
          <NumberInput label="ETÀ" value={data.age} onChange={(v) => setData({ ...data, age: v })} unit="anni" />
          {showAgeWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                Per chi ha più di 65 anni è particolarmente consigliato un controllo cardiologico prima di iniziare un programma di corsa. Le formule di FC standard perdono precisione in questa fascia.
              </div>
            </div>
          )}
          <NumberInput label="PESO" value={data.weight} onChange={(v) => setData({ ...data, weight: v })} unit="kg" />
          <SegmentedControl
            label="SESSO BIOLOGICO"
            options={[
              { v: "M", l: "Uomo" },
              { v: "F", l: "Donna" },
            ]}
            value={data.sex}
            onChange={(v) => setData({ ...data, sex: v as "M" | "F" })}
          />
          <div>
            <NumberInput
              label="FC A RIPOSO (OPZIONALE)"
              value={data.hrRest ?? 60}
              onChange={(v) => setData({ ...data, hrRest: v > 0 ? v : null })}
              unit="bpm"
            />
            <div className="mt-2 text-xs text-stone-500 leading-relaxed">
              Misurabile la mattina, appena sveglio, prima di alzarti. Se non la sai lasciamo 60 — le zone saranno meno personalizzate ma comunque utili.
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "LE TUE\nABITUDINI",
      subtitle: "Per costruire un piano realistico partendo da quello che già fai",
      content: (
        <div className="space-y-7">
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">
              KM A SETTIMANA (DI SOLITO)
            </div>
            <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
              <input
                type="number"
                min="0"
                max="120"
                value={data.weeklyVolume ?? 0}
                onChange={(e) => updateLevelOrVolume({ weeklyVolume: Math.max(0, parseInt(e.target.value) || 0) })}
                className="display-font text-5xl bg-transparent outline-none w-full"
              />
              <span className="mono-font text-sm text-stone-400">km/sett</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              step="5"
              value={Math.min(80, data.weeklyVolume ?? 0)}
              onChange={(e) => updateLevelOrVolume({ weeklyVolume: parseInt(e.target.value) })}
              className="w-full mt-3 accent-ink"
            />
            <div className="mt-2 text-xs text-stone-500 leading-relaxed">
              Quanti km corri di solito a settimana negli ultimi mesi (anche zero va bene se stai ricominciando).
            </div>
          </div>

          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">
              LUNGO PIÙ LUNGO (ULTIME 4 SETTIMANE)
            </div>
            <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
              <input
                type="number"
                min="0"
                max="240"
                value={data.recentLongRun ?? 0}
                onChange={(e) => setData({ ...data, recentLongRun: Math.max(0, parseInt(e.target.value) || 0) })}
                className="display-font text-5xl bg-transparent outline-none w-full"
              />
              <span className="mono-font text-sm text-stone-400">minuti</span>
            </div>
            <input
              type="range"
              min="0"
              max="180"
              step="5"
              value={Math.min(180, data.recentLongRun ?? 0)}
              onChange={(e) => setData({ ...data, recentLongRun: parseInt(e.target.value) })}
              className="w-full mt-3 accent-ink"
            />
            <div className="mt-2 text-xs text-stone-500 leading-relaxed">
              Durata in minuti della tua corsa più lunga di recente. Sarà il punto di partenza dei lunghi del tuo piano.
            </div>
          </div>

          <SegmentedControl
            label="ESPERIENZA"
            options={[
              { v: "beginner", l: "Principiante" },
              { v: "intermediate", l: "Intermedio" },
              { v: "advanced", l: "Esperto" },
            ]}
            value={data.level}
            onChange={(v) => updateLevelOrVolume({ level: v as Profile["level"] })}
          />
          <div className="bg-stone-100 rounded-2xl p-4 flex gap-3">
            <Info size={18} className="text-stone-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-stone-600 leading-relaxed">
              Questi dati ci servono per dimensionare il volume e la difficoltà del piano. Più sono onesti, più il piano è realistico.
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "LIVELLO\nATTUALE",
      subtitle: dontKnowBest
        ? "Lo stimiamo dai dati che ci hai dato"
        : `Qual è il tuo tempo recente sui ${formatDist(data.raceDistance)} km (anche una stima va bene)`,
      content: (
        <div className="space-y-6">
          {!dontKnowBest && (
            <NumberInput
              label={`TEMPO ${formatDist(data.raceDistance)}K RECENTE`}
              value={data.currentBest}
              onChange={(v) => setData({ ...data, currentBest: v, currentBestEstimated: false })}
              unit="minuti"
            />
          )}
          {dontKnowBest && (
            <div className="bg-stone-100 rounded-2xl p-4">
              <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">
                TEMPO {formatDist(data.raceDistance)}K STIMATO
              </div>
              <div className="display-font text-5xl text-stone-800 mb-1">{data.currentBest}'</div>
              <div className="text-xs text-stone-600 leading-relaxed">
                Stima conservativa basata su livello e volume settimanale. Potrai aggiornarla nelle impostazioni dopo le prime sessioni.
              </div>
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer select-none p-3 -mx-3 rounded-xl hover:bg-stone-50">
            <input
              type="checkbox"
              checked={dontKnowBest}
              onChange={(e) => onToggleDontKnow(e.target.checked)}
              className="mt-1 w-4 h-4 accent-ink"
            />
            <div className="text-sm text-stone-700 leading-snug">
              <div className="font-semibold">Non ho mai corso questa distanza / non ricordo il tempo</div>
              <div className="text-xs text-stone-500 mt-0.5">
                Stimeremo il tempo dai dati che ci hai già dato (livello + volume).
              </div>
            </div>
          </label>
          <div className="bg-stone-100 rounded-2xl p-4 flex gap-3">
            <Info size={18} className="text-stone-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-stone-600 leading-relaxed">
              Questo dato serve solo per calcolare i pace target indicativi del piano, non è una valutazione del tuo livello sportivo.
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "LA TUA\nGARA",
      subtitle: "Quando si corre e a che tempo ti piacerebbe puntare",
      content: (
        <div className="space-y-6">
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">DATA DELLA GARA</div>
            <div className="flex items-center gap-3 border-b-2 border-ink pb-2">
              <CalendarIcon size={20} className="text-stone-500" />
              <input
                type="date"
                value={data.raceDate || ""}
                min={today}
                onChange={(e) => onRaceDateChange(e.target.value)}
                className="display-font text-3xl bg-transparent outline-none w-full mono-font"
              />
            </div>
            <div
              className={`mt-3 rounded-2xl p-3 text-xs leading-relaxed ${
                prepHintTone === "alert"
                  ? "bg-red-50 border border-red-200 text-red-900"
                  : prepHintTone === "warn"
                  ? "bg-amber-50 border border-amber-200 text-amber-900"
                  : "bg-emerald-50 border border-emerald-200 text-emerald-900"
              }`}
            >
              <div className="mono-font font-bold mb-1">
                MANCANO {days} GIORNI · ~{weeks} {weeks === 1 ? "SETTIMANA" : "SETTIMANE"}
              </div>
              <div>{prepHint}</div>
            </div>
          </div>

          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">DISTANZA GARA</div>
            <div className="flex gap-2 bg-stone-200 rounded-full p-1 mb-2">
              {DISTANCE_PRESETS.map((p) => (
                <button
                  key={p.v}
                  onClick={() => onDistancePreset(p.v)}
                  className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
                    isPresetDistance && Math.abs(p.v - data.raceDistance) < 0.001
                      ? "bg-ink text-paper"
                      : "text-stone-600"
                  }`}
                >
                  {p.l}
                </button>
              ))}
              <button
                onClick={() => {
                  setCustomDistance(String(data.raceDistance));
                }}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  !isPresetDistance ? "bg-ink text-paper" : "text-stone-600"
                }`}
              >
                Altro
              </button>
            </div>
            {!isPresetDistance && (
              <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2 mt-3">
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="100"
                  value={customDistance || data.raceDistance}
                  onChange={(e) => onCustomDistance(e.target.value)}
                  className="display-font text-3xl bg-transparent outline-none w-full"
                />
                <span className="mono-font text-sm text-stone-400">km</span>
              </div>
            )}
          </div>

          {volumeWarning && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">{volumeWarning}</div>
            </div>
          )}

          <NumberInput
            label={`TEMPO TARGET SU ${formatDist(data.raceDistance)}K`}
            value={data.targetTime}
            onChange={(v) => setData({ ...data, targetTime: v })}
            unit="minuti"
          />
          <SegmentedControl
            label="ALLENAMENTI/SETTIMANA"
            options={[
              { v: 2, l: "2" },
              { v: 3, l: "3" },
              { v: 4, l: "4" },
            ]}
            value={data.weeklyFreq}
            onChange={(v) => setData({ ...data, weeklyFreq: Number(v) })}
          />
        </div>
      ),
    },
  ];

  const current = steps[step];
  const progress = ((step + 1) / steps.length) * 100;
  const lastStep = steps.length - 1;
  const canAdvance = step !== lastStep || (!!data.raceDate && days > 0);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="p-6 pt-8">
        <div className="h-1 bg-stone-200 rounded-full overflow-hidden mb-8">
          <div className="h-full bg-ink transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">
          PASSO {step + 1} / {steps.length}
        </div>
        <h2 className="display-font text-6xl leading-[0.9] whitespace-pre-line mb-3">{current.title}</h2>
        <p className="text-stone-500 text-sm">{current.subtitle}</p>
      </div>
      <div className="flex-1 px-6">{current.content}</div>
      <div className="p-6 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="px-6 py-5 rounded-full font-bold tracking-wide bg-stone-200 text-stone-700 hover:bg-stone-300 active:scale-[0.98] transition-all"
          >
            INDIETRO
          </button>
        )}
        <button
          disabled={!canAdvance}
          onClick={() => {
            if (step < lastStep) setStep(step + 1);
            else onComplete(data);
          }}
          className={`flex-1 py-5 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            canAdvance ? "bg-ink text-paper hover:bg-ink-soft" : "bg-stone-300 text-stone-500"
          }`}
        >
          {step < lastStep ? "AVANTI" : "CREA IL DIARIO"} <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, unit }: { label: string; value: number; onChange: (n: number) => void; unit: string }) {
  return (
    <div>
      <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-3 border-b-2 border-ink pb-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="display-font text-5xl bg-transparent outline-none w-full"
        />
        <span className="mono-font text-sm text-stone-400">{unit}</span>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">{label}</div>
      <div className="flex gap-2 bg-stone-200 rounded-full p-1">
        {options.map((opt) => (
          <button
            key={String(opt.v)}
            onClick={() => onChange(opt.v)}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
              value === opt.v ? "bg-ink text-paper" : "text-stone-600"
            }`}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}
