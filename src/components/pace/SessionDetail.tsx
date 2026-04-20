import { ArrowLeft, AlertTriangle, Check } from "lucide-react";
import type { Profile, Session } from "@/lib/pace-engine";
import { computeZones, getTypeBg } from "@/lib/pace-engine";

interface Props {
  session: { data: Session; weekIdx: number; sessionIdx: number };
  profile: Profile;
  onBack: () => void;
  onLog: () => void;
}

export function SessionDetail({ session, profile, onBack, onLog }: Props) {
  const zones = computeZones(profile);
  const s = session.data;

  return (
    <div className="min-h-screen bg-paper pb-28">
      <div className={`p-6 pt-12 rounded-b-3xl ${getTypeBg(s.type)} grain`}>
        <button onClick={onBack} className="mb-6 text-ink">
          <ArrowLeft size={24} />
        </button>
        <div className="mono-font text-xs tracking-widest text-stone-800 mb-2">
          SETTIMANA {session.weekIdx + 1} · SESSIONE {session.sessionIdx + 1}
        </div>
        <h2 className="display-font text-5xl leading-none mb-3 text-ink">{s.name.toUpperCase()}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Pill>{s.duration} min circa</Pill>
          <Pill>{s.type}</Pill>
          {s.targetHR && <Pill>~{s.targetHR} bpm</Pill>}
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div>
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ SPUNTI PER LA SESSIONE</div>
          <div className="bg-card rounded-3xl p-5 border border-border space-y-3">
            {s.blocks.map((b, i) => (
              <div key={i} className="flex gap-3 items-start">
                <div className="mono-font text-xs text-stone-400 mt-0.5 w-6">{String(i + 1).padStart(2, "0")}</div>
                <div className="text-sm text-stone-800 flex-1">{b}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ INTENSITÀ INDICATIVE</div>
          <div className="text-xs text-stone-500 mb-3">Stime da formule standard, non misurazioni individuali.</div>
          <div className="space-y-2">
            {zones.zones.map((z, i) => (
              <div
                key={i}
                className={`rounded-2xl p-4 border ${
                  z.highlight ? "bg-ink text-paper border-ink" : "bg-card border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold">{z.name}</div>
                    <div className={`text-xs ${z.highlight ? "text-stone-400" : "text-stone-500"}`}>{z.description}</div>
                  </div>
                  <div className="mono-font text-sm font-bold flex-shrink-0">{z.range} bpm</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {s.notes && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ NOTE DESCRITTIVE</div>
            <div className="bg-ink text-paper rounded-3xl p-5 text-sm leading-relaxed">{s.notes}</div>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            Se durante l'allenamento avverti dolore al petto, vertigini, battito irregolare o affanno insolito, fermati
            e consulta un medico. Questi spunti non sono adatti a chi ha condizioni cardiovascolari non controllate.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6">
        <button
          onClick={onLog}
          className="w-full bg-ink text-paper py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg hover:bg-ink-soft transition-all active:scale-[0.98]"
        >
          <Check size={18} /> REGISTRA QUESTO ALLENAMENTO
        </button>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <div className="bg-ink/10 text-ink px-3 py-1 rounded-full text-xs font-bold">{children}</div>;
}
