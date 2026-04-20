import { useState } from "react";
import { ChevronRight, AlertTriangle, Info } from "lucide-react";
import type { Profile } from "@/lib/pace-engine";

interface Props {
  onComplete: (p: Profile) => void;
}

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Profile>({
    age: 29,
    weight: 60,
    sex: "M",
    currentBest: 58,
    targetTime: 55,
    weeklyFreq: 3,
    daysUntilRace: 18,
    level: "intermediate",
  });

  const showAgeWarning = data.age >= 65;

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
        </div>
      ),
    },
    {
      title: "LIVELLO\nATTUALE",
      subtitle: "Qual è il tuo tempo recente sui 10 km (anche una stima va bene)",
      content: (
        <div className="space-y-6">
          <NumberInput label="TEMPO 10K RECENTE" value={data.currentBest} onChange={(v) => setData({ ...data, currentBest: v })} unit="minuti" />
          <SegmentedControl
            label="ESPERIENZA"
            options={[
              { v: "beginner", l: "Principiante" },
              { v: "intermediate", l: "Intermedio" },
              { v: "advanced", l: "Esperto" },
            ]}
            value={data.level}
            onChange={(v) => setData({ ...data, level: v as Profile["level"] })}
          />
          <div className="bg-stone-100 rounded-2xl p-4 flex gap-3">
            <Info size={18} className="text-stone-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-stone-600 leading-relaxed">
              Questi dati servono solo per mostrarti spunti più pertinenti, non sono una valutazione del tuo livello sportivo.
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "LA TUA\nGARA",
      subtitle: "Quando vuoi correre e a che tempo ti piacerebbe puntare",
      content: (
        <div className="space-y-6">
          <NumberInput label="GIORNI ALLA GARA" value={data.daysUntilRace} onChange={(v) => setData({ ...data, daysUntilRace: v })} unit="giorni" />
          <NumberInput label="TEMPO A CUI PUNTERESTI" value={data.targetTime} onChange={(v) => setData({ ...data, targetTime: v })} unit="minuti" />
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
      <div className="p-6">
        <button
          onClick={() => {
            if (step < steps.length - 1) setStep(step + 1);
            else onComplete(data);
          }}
          className="w-full bg-ink text-paper py-5 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-ink-soft transition-all active:scale-[0.98]"
        >
          {step < steps.length - 1 ? "AVANTI" : "CREA IL DIARIO"} <ChevronRight size={20} />
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
