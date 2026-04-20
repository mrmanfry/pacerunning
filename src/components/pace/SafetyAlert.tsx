import { AlertTriangle } from "lucide-react";
import type { SafetyResult, WorkoutLog } from "@/lib/pace-engine";

interface Props {
  safety: (SafetyResult & { pendingLog: WorkoutLog }) | null;
  onDismiss: () => void;
  onContinueAnyway: () => void;
}

export function SafetyAlert({ safety, onDismiss, onContinueAnyway }: Props) {
  if (!safety) return null;
  return (
    <div className="min-h-screen bg-amber-50 pb-32">
      <div className="p-6 pt-12">
        <div className="w-16 h-16 rounded-full bg-amber-500 flex items-center justify-center mb-6">
          <AlertTriangle size={32} className="text-white" />
        </div>
        <div className="mono-font text-xs tracking-widest text-amber-700 mb-2">⚠ SEGNALE DI ATTENZIONE</div>
        <h2 className="display-font text-5xl leading-tight mb-4 text-amber-950">{safety.title}</h2>
        <p className="text-amber-900 text-base leading-relaxed mb-6">{safety.message}</p>

        {safety.details && safety.details.length > 0 && (
          <div className="bg-card rounded-2xl p-5 border border-amber-200 mb-6">
            <div className="mono-font text-xs tracking-widest text-amber-700 mb-3">DETTAGLI</div>
            <ul className="space-y-2">
              {safety.details.map((d, i) => (
                <li key={i} className="text-sm text-stone-700 flex gap-2">
                  <span className="text-amber-500">•</span> {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-ink text-paper rounded-2xl p-5 mb-6">
          <div className="text-sm leading-relaxed">
            <strong className="text-signal">Cosa ti consigliamo:</strong> {safety.suggestion}
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6 space-y-2">
        <button
          onClick={onDismiss}
          className="w-full bg-ink text-paper py-4 rounded-full font-bold tracking-wide hover:bg-ink-soft transition-all"
        >
          HO CAPITO, NON SALVO
        </button>
        {safety.allowOverride && (
          <button onClick={onContinueAnyway} className="w-full py-3 text-sm text-stone-500 underline">
            Salva lo stesso (sotto la mia responsabilità)
          </button>
        )}
      </div>
    </div>
  );
}
