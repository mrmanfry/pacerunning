import { useState } from "react";
import { ArrowLeft, Activity, Clock, Heart, Flame, Sparkles, Info } from "lucide-react";
import type { Session, SessionType, WorkoutLog } from "@/lib/pace-engine";

interface Props {
  session: { data: Session; weekIdx: number; sessionIdx: number } | null;
  onBack: () => void;
  onSave: (log: WorkoutLog) => void;
}

export function LogWorkout({ session, onBack, onSave }: Props) {
  const [data, setData] = useState({
    duration: session?.data.duration || 45,
    distance: 5,
    hrAvg: 150,
    hrMax: 170,
    rpe: 6,
    cadence: "",
    notes: "",
  });

  const canSave = data.duration > 0 && data.distance > 0 && data.hrAvg > 0;

  return (
    <div className="min-h-screen bg-paper pb-32">
      <div className="p-6 pt-12">
        <button onClick={onBack} className="mb-6">
          <ArrowLeft size={24} className="text-stone-700" />
        </button>
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">▲ LOG / ALLENAMENTO</div>
        <h2 className="display-font text-5xl leading-tight mb-2">
          COM'È
          <br />
          ANDATA?
        </h2>
        <p className="text-stone-500 text-sm">
          {session ? `Sessione: ${session.data.name}` : "Inserisci i dati dell'allenamento"}
        </p>
      </div>

      <div className="px-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={<Clock size={16} />} label="DURATA" value={data.duration} onChange={(v) => setData({ ...data, duration: v })} unit="min" />
          <MetricCard icon={<Activity size={16} />} label="DISTANZA" value={data.distance} onChange={(v) => setData({ ...data, distance: v })} unit="km" step={0.1} />
          <MetricCard icon={<Heart size={16} />} label="FC MEDIA" value={data.hrAvg} onChange={(v) => setData({ ...data, hrAvg: v })} unit="bpm" />
          <MetricCard icon={<Flame size={16} />} label="FC MAX" value={data.hrMax} onChange={(v) => setData({ ...data, hrMax: v })} unit="bpm" />
        </div>

        <div className="bg-card rounded-3xl p-5 border border-border">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">SFORZO PERCEPITO</div>
          <div className="display-font text-6xl mb-3">
            {data.rpe}
            <span className="text-stone-400 text-3xl">/10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={data.rpe}
            onChange={(e) => setData({ ...data, rpe: parseInt(e.target.value) })}
            className="w-full accent-lime-500"
          />
          <div className="flex justify-between mono-font text-[10px] text-stone-400 mt-1">
            <span>FACILE</span>
            <span>MEDIO</span>
            <span>AL MASSIMO</span>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 border border-border space-y-4">
          <div className="mono-font text-xs tracking-widest text-stone-500">OPZIONALE</div>
          <div>
            <div className="text-xs text-stone-500 mb-1">Cadenza (passi/min)</div>
            <input
              type="number"
              value={data.cadence}
              onChange={(e) => setData({ ...data, cadence: e.target.value })}
              placeholder="es. 165"
              className="w-full bg-stone-50 rounded-xl px-4 py-3 outline-none text-sm mono-font"
            />
          </div>
          <div>
            <div className="text-xs text-stone-500 mb-1">Note (sensazioni, dolori, stanchezza...)</div>
            <textarea
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              placeholder="Come ti sentivi? Segnala qui eventuali dolori o malessere."
              rows={3}
              maxLength={1000}
              className="w-full bg-stone-50 rounded-xl px-4 py-3 outline-none text-sm resize-none"
            />
          </div>
        </div>

        <div className="bg-stone-100 rounded-2xl p-4 flex gap-3">
          <Info size={16} className="text-stone-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-stone-600 leading-relaxed">
            Se hai avvertito dolore, malessere o sintomi insoliti, segnalali nelle note. Se sono seri, prima di salvare
            ti invitiamo a consultare un medico.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6">
        <button
          disabled={!canSave}
          onClick={() =>
            onSave({
              weekIdx: session?.weekIdx ?? null,
              sessionIdx: session?.sessionIdx ?? null,
              sessionType: (session?.data.type ?? "freeform") as SessionType,
              sessionName: session?.data.name || "Allenamento libero",
              duration: data.duration,
              distance: data.distance,
              hrAvg: data.hrAvg,
              hrMax: data.hrMax,
              rpe: data.rpe,
              cadence: data.cadence ? parseInt(data.cadence) : null,
              notes: data.notes,
            })
          }
          className={`w-full py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            canSave ? "bg-ink text-paper hover:bg-ink-soft shadow-lg" : "bg-stone-200 text-stone-400"
          }`}
        >
          <Sparkles size={18} /> SALVA E LEGGI
        </button>
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  onChange,
  unit,
  step = 1,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit: string;
  step?: number;
}) {
  return (
    <div className="bg-card rounded-3xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2 text-stone-500">
        {icon}
        <div className="mono-font text-[10px] tracking-wider">{label}</div>
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="display-font text-4xl bg-transparent outline-none w-full min-w-0"
        />
        <span className="mono-font text-xs text-stone-400">{unit}</span>
      </div>
    </div>
  );
}
