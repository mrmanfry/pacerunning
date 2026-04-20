import { Activity, Check, ChevronRight, Info } from "lucide-react";
import type { Plan, Profile, WorkoutLog, Session } from "@/lib/pace-engine";
import { computeZones, findNextSession, formatTime, getTypeStyles, paceFromTime } from "@/lib/pace-engine";

interface Props {
  profile: Profile;
  plan: Plan;
  logs: WorkoutLog[];
  onOpenSession: (s: { data: Session; weekIdx: number; sessionIdx: number }) => void;
  onLogFreeform: () => void;
  onOpenSettings: () => void;
}

export function Dashboard({ profile, plan, logs, onOpenSession, onLogFreeform, onOpenSettings }: Props) {
  const zones = computeZones(profile);
  const completedCount = logs.length;
  const totalSessions = plan.weeks.reduce((a, w) => a + w.sessions.length, 0);
  const nextSession = findNextSession(plan, logs);
  const displayTime = plan.adjustedEstimate || profile.targetTime;

  return (
    <div className="min-h-screen bg-paper pb-28">
      <div className="bg-ink text-paper p-6 pt-12 grain rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="mono-font text-xs tracking-widest text-signal">▲ PACE / DIARIO</div>
          <button onClick={onOpenSettings} className="mono-font text-xs text-stone-400 hover:text-stone-200">
            IMPOSTAZIONI
          </button>
        </div>

        <div className="mb-2 mono-font text-xs tracking-widest text-stone-400">TEMPO IPOTETICO 10 KM</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <div className="display-font text-7xl leading-none">{formatTime(displayTime)}</div>
          <div className="mono-font text-sm text-stone-400">min</div>
          {plan.adjustedEstimate && Math.abs(plan.adjustedEstimate - profile.targetTime) > 0.5 && (
            <div className="mono-font text-xs px-2 py-1 bg-stone-700 text-stone-200 rounded-full">STIMA RIVISTA</div>
          )}
        </div>
        <div className="mt-2 text-xs text-stone-500">
          Ritmo indicativo: <span className="mono-font text-stone-300">{paceFromTime(displayTime)}/km</span> · stima dai dati inseriti
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <StatTile label="GIORNI" value={Math.max(0, profile.daysUntilRace - completedCount * 2)} />
          <StatTile label="SESSIONI" value={`${completedCount}/${totalSessions}`} />
          <StatTile label="FC MAX *" value={zones.hrMax} />
        </div>
        <div className="mt-2 text-[10px] text-stone-500 mono-font">* stima da formula, non misurata</div>
      </div>

      {nextSession && (
        <div className="p-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ PROSSIMO SPUNTO</div>
          <button
            onClick={() => onOpenSession(nextSession)}
            className="w-full text-left bg-ink text-paper rounded-3xl p-6 relative overflow-hidden hover:bg-ink-soft transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="flex-1 min-w-0">
                <div className="mono-font text-xs text-stone-400 mb-1">
                  SETTIMANA {nextSession.weekIdx + 1} · SESSIONE {nextSession.sessionIdx + 1}
                </div>
                <div className="display-font text-4xl leading-tight">{nextSession.data.name.toUpperCase()}</div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${getTypeStyles(nextSession.data.type)}`}>
                {nextSession.data.type.toUpperCase()}
              </div>
            </div>
            <div className="space-y-1.5 mono-font text-sm text-stone-300">
              {nextSession.data.blocks.slice(0, 3).map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-signal mt-0.5">▸</span> <span className="flex-1">{b}</span>
                </div>
              ))}
              {nextSession.data.blocks.length > 3 && (
                <div className="text-stone-500 text-xs">+ {nextSession.data.blocks.length - 3} altri spunti</div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-1 text-signal text-sm font-bold">
              APRI DETTAGLI <ChevronRight size={16} />
            </div>
          </button>
        </div>
      )}

      <div className="p-6 pt-2">
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ PANORAMICA SPUNTI</div>
        <div className="space-y-4">
          {plan.weeks.map((week, wi) => (
            <div key={wi} className="bg-card rounded-3xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="display-font text-2xl">SETTIMANA {wi + 1}</div>
                <div className="mono-font text-xs text-stone-500">{week.theme}</div>
              </div>
              <div className="space-y-2">
                {week.sessions.map((s, si) => {
                  const done = logs.some((l) => l.weekIdx === wi && l.sessionIdx === si);
                  const isNext = nextSession && nextSession.weekIdx === wi && nextSession.sessionIdx === si;
                  return (
                    <button
                      key={si}
                      onClick={() => onOpenSession({ data: s, weekIdx: wi, sessionIdx: si })}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all ${
                        done
                          ? "bg-lime-50 border border-lime-200"
                          : isNext
                          ? "bg-stone-100 border-2 border-ink"
                          : "bg-stone-50 border border-stone-200 hover:border-stone-400"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          done
                            ? "bg-lime-500 text-white"
                            : isNext
                            ? "bg-ink text-paper"
                            : "bg-stone-200 text-stone-500"
                        }`}
                      >
                        {done ? <Check size={16} /> : <span className="mono-font text-xs font-bold">{si + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{s.name}</div>
                        <div className="mono-font text-xs text-stone-500">
                          {s.duration} min · {s.type}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-stone-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-stone-100 rounded-2xl p-4 flex gap-3">
          <Info size={18} className="text-stone-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-stone-600 leading-relaxed">
            Gli spunti che vedi sono riferimenti generici tratti dalla letteratura della corsa amatoriale. Non sono
            prescrizioni né piani personalizzati. Ascolta sempre il tuo corpo e, in caso di dubbi, un professionista
            qualificato.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6">
        <button
          onClick={onLogFreeform}
          className="w-full bg-signal text-ink py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-signal/30 hover:bg-signal-soft transition-all active:scale-[0.98]"
        >
          <Activity size={18} /> REGISTRA ALLENAMENTO
        </button>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-stone-800/50 rounded-2xl p-3 border border-stone-700">
      <div className="mono-font text-[10px] tracking-wider text-stone-400 mb-1">{label}</div>
      <div className="display-font text-2xl text-paper">{value}</div>
    </div>
  );
}
