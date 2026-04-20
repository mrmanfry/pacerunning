import { Check, Flame, Heart, Info, Wind, Zap } from "lucide-react";
import type { Analysis } from "@/lib/pace-engine";

const iconMap = {
  wind: Wind,
  check: Check,
  flame: Flame,
  heart: Heart,
  zap: Zap,
};

interface Props {
  analysis: Analysis | null;
  onContinue: () => void;
}

export function AnalysisScreen({ analysis, onContinue }: Props) {
  if (!analysis) return null;

  return (
    <div className="min-h-screen bg-ink text-paper pb-28 grain">
      <div className="p-6 pt-12">
        <div className="mono-font text-xs tracking-widest text-signal mb-2">▲ LETTURA / DESCRITTIVA</div>
        <h2 className="display-font text-5xl leading-tight mb-2">
          COSA
          <br />
          <span className="text-signal">DICONO</span> I DATI
        </h2>
        <p className="text-stone-400 text-sm">{analysis.summary}</p>
      </div>

      <div className="px-6 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="PACE" value={analysis.pace} unit="/km" />
          <Stat label="FC MEDIA" value={analysis.hrAvg} unit="bpm" />
          <Stat label="INTENSITÀ" value={analysis.intensityLabel} unit="" />
        </div>

        <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
          <div className="mono-font text-xs tracking-widest mb-2 text-stone-400">OSSERVAZIONE</div>
          <div className="text-lg font-bold mb-2">{analysis.verdictTitle}</div>
          <div className="text-sm text-stone-300 leading-relaxed">{analysis.verdictText}</div>
        </div>

        {analysis.insights.length > 0 && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-400 mb-3">▼ SPUNTI DI LETTURA</div>
            <div className="space-y-2">
              {analysis.insights.map((ins, i) => {
                const Icon = iconMap[ins.iconKey];
                return (
                  <div key={i} className="bg-stone-800 border border-stone-700 rounded-2xl p-4 flex gap-3">
                    <div className="text-signal mt-0.5">
                      <Icon size={16} />
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-sm mb-1">{ins.title}</div>
                      <div className="text-xs text-stone-400 leading-relaxed">{ins.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {analysis.prediction && (
          <div className="bg-signal text-ink rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2">STIMA INDICATIVA</div>
            <div className="display-font text-5xl leading-none mb-1">~{analysis.prediction.time}</div>
            <div className="text-sm">{analysis.prediction.text}</div>
            <div className="text-[11px] mt-2 opacity-70">
              Stima statistica, non una previsione. Il tempo reale dipende da molti fattori individuali.
            </div>
          </div>
        )}

        <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
          <div className="mono-font text-xs tracking-widest text-signal mb-2">▼ RIFLESSIONE</div>
          <div className="text-sm leading-relaxed">{analysis.nextMove}</div>
        </div>

        <div className="bg-stone-800/50 border border-stone-700 rounded-2xl p-4 flex gap-3">
          <Info size={16} className="text-stone-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-stone-500 leading-relaxed">
            Le osservazioni sono letture statistiche dei numeri inseriti. Non sono diagnosi né prescrizioni. Se qualcosa
            non torna nel tuo corpo, ascolta il corpo, non l'app.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6">
        <button
          onClick={onContinue}
          className="w-full bg-signal text-ink py-4 rounded-full font-bold tracking-wide hover:bg-signal-soft transition-all active:scale-[0.98]"
        >
          TORNA AL DIARIO
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <div className="bg-stone-800 border border-stone-700 rounded-2xl p-3">
      <div className="mono-font text-[10px] tracking-wider text-stone-400 mb-1">{label}</div>
      <div className="display-font text-2xl">
        {value}
        <span className="text-stone-500 text-xs ml-1">{unit}</span>
      </div>
    </div>
  );
}
