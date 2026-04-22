import { Activity, AlertTriangle, Check, ChevronRight, Info, MessageCircle, SkipForward } from "lucide-react";
import type { Plan, Profile, WorkoutLog, Session } from "@/lib/pace-engine";
import { computeZones, daysBetween, findNextSession, formatTime, getTypeStyles, paceFromTime } from "@/lib/pace-engine";
import type { StoredAnalysis } from "@/lib/pace-repository";
import { readinessLabel, readinessDescription, type LoadState } from "@/lib/load-model";
import { RationaleBlock } from "./RationaleBlock";

interface Props {
  profile: Profile;
  plan: Plan;
  logs: WorkoutLog[];
  lastLog?: WorkoutLog | null;
  lastAnalysis?: StoredAnalysis | null;
  loadState?: LoadState | null;
  onOpenSession: (s: { data: Session; weekIdx: number; sessionIdx: number }) => void;
  onLogFreeform: () => void;
  onOpenSettings: () => void;
}

export function Dashboard({
  profile,
  plan,
  logs,
  lastLog,
  lastAnalysis,
  loadState,
  onOpenSession,
  onLogFreeform,
  onOpenSettings,
}: Props) {
  const zones = computeZones(profile, undefined, logs);
  const completedCount = logs.length;
  const totalSessions = plan.weeks.reduce((a, w) => a + w.sessions.length, 0);
  const nextSession = findNextSession(plan, logs);
  

  // Real days remaining from raceDate
  const today = new Date().toISOString().slice(0, 10);
  const daysLeft = profile.raceDate
    ? Math.max(0, daysBetween(today, profile.raceDate))
    : profile.daysUntilRace;

  // Coach excerpt: first 1-2 sentences of nextMove
  const coachExcerpt = lastAnalysis?.nextMove
    ? truncateToSentences(lastAnalysis.nextMove, 2)
    : null;

  return (
    <div className="min-h-screen bg-paper pb-28">
      {/* Short prep warning */}
      {plan.veryShortPrep && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex gap-3">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-900 leading-relaxed">
            <strong>Tempi molto stretti.</strong> La gara è tra meno di 2 settimane: il diario è essenziale e il target deve essere considerato orientativo.
          </div>
        </div>
      )}
      {!plan.veryShortPrep && plan.shortPrep && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex gap-3">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <strong>Preparazione breve.</strong> Approccio conservativo: meglio arrivare riposati che spingere troppo.
          </div>
        </div>
      )}

      <div className="bg-ink text-paper p-6 pt-12 grain rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="mono-font text-xs tracking-widest text-signal">▲ PACE / DIARIO</div>
          <button onClick={onOpenSettings} className="mono-font text-xs text-stone-400 hover:text-stone-200">
            IMPOSTAZIONI
          </button>
        </div>

        <div className="mb-2 mono-font text-xs tracking-widest text-stone-400">
          TEMPO IPOTETICO {formatRaceDistance(profile.raceDistance)} KM
        </div>
        {(() => {
          const conf = plan.estimateConfidence ?? null;
          const hasBand =
            plan.adjustedEstimate != null &&
            plan.estimateLow != null &&
            plan.estimateHigh != null &&
            conf !== "low";

          if (!hasBand) {
            // Not enough data — show declared target + collecting-data note
            return (
              <>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <div className="display-font text-7xl leading-none">{formatTime(profile.targetTime)}</div>
                  <div className="mono-font text-sm text-stone-400">min · target</div>
                  <div className="mono-font text-[10px] px-2 py-1 bg-stone-700 text-stone-300 rounded-full tracking-wider">
                    RACCOGLIENDO DATI
                  </div>
                </div>
                <div className="mt-2 text-xs text-stone-500 leading-relaxed">
                  Servono ancora 2-3 sessioni di qualità (medio, ripetute o lungo) per una stima affidabile dai tuoi numeri.
                </div>
              </>
            );
          }

          const central = plan.adjustedEstimate!;
          const low = plan.estimateLow!;
          const high = plan.estimateHigh!;
          const confChipBg =
            conf === "high"
              ? "bg-signal text-ink"
              : conf === "medium"
              ? "bg-stone-600 text-stone-100"
              : "bg-stone-700 text-stone-300";
          const confLabel = conf === "high" ? "ALTA" : conf === "medium" ? "MEDIA" : "BASSA";

          return (
            <>
              <div className="flex items-baseline gap-3 flex-wrap">
                <div className="display-font text-7xl leading-none">{formatTime(central)}</div>
                <div className="mono-font text-sm text-stone-400">min</div>
                <div className={`mono-font text-[10px] px-2 py-1 rounded-full tracking-wider ${confChipBg}`}>
                  CONFIDENZA {confLabel}
                </div>
              </div>
              <div className="mt-2 text-xs text-stone-500">
                Banda probabile:{" "}
                <span className="mono-font text-stone-300">
                  {formatTime(low)} – {formatTime(high)}
                </span>{" "}
                · ritmo centrale <span className="mono-font text-stone-300">{paceFromTime(central, profile.raceDistance)}/km</span>
              </div>
              <div className="mt-1 text-[10px] text-stone-500 leading-relaxed">
                Stima Riegel + normalizzazione FC, pesata sulle sessioni recenti. Non è una previsione.
              </div>
            </>
          );
        })()}

        <div className="mt-6 grid grid-cols-3 gap-2">
          <StatTile label="GIORNI" value={daysLeft} />
          <StatTile label="SESSIONI" value={`${completedCount}/${totalSessions}`} />
          <StatTile
            label={loadState && loadState.readiness !== "insufficient-data" ? "FORMA" : "FC MAX"}
            value={
              loadState && loadState.readiness !== "insufficient-data"
                ? `${loadState.tsb >= 0 ? "+" : ""}${loadState.tsb}`
                : zones.hrMax
            }
            sub={
              loadState && loadState.readiness !== "insufficient-data"
                ? readinessLabel(loadState.readiness)
                : zones.hrMaxSource === "blended"
                ? "stima dai tuoi log"
                : "stima da formula"
            }
          />
        </div>
        {loadState && loadState.readiness !== "insufficient-data" && (
          <div className="mt-2 text-[10px] text-stone-500 leading-relaxed">
            {readinessDescription(loadState)}
          </div>
        )}
        {(!loadState || loadState.readiness === "insufficient-data") && (
          <div className="mt-2 text-[10px] text-stone-500 mono-font">
            {zones.hrMaxSource === "blended"
              ? `* FC max stimata da ${zones.hrMaxSampleSize} sessioni intense (confidenza ${zones.hrMaxConfidence === "high" ? "alta" : zones.hrMaxConfidence === "medium" ? "media" : "bassa"})`
              : "* stima da formula, non misurata"}
          </div>
        )}
      </div>

      {/* Last workout recap */}
      {lastLog && (
        <div className="p-6 pb-2">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ ULTIMO ALLENAMENTO</div>
          <div className="bg-card rounded-3xl p-5 border border-border">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0">
                <div className="display-font text-2xl leading-tight truncate">{lastLog.sessionName}</div>
                <div className="mono-font text-xs text-stone-500 mt-0.5">
                  {lastLog.loggedAt ? formatLoggedDate(lastLog.loggedAt) : ""}
                </div>
              </div>
              <div className={`px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${getTypeStyles(lastLog.sessionType)}`}>
                {lastLog.sessionType.toUpperCase()}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-1">
              <RecapStat label="DISTANZA" value={`${lastLog.distance.toFixed(2)} km`} />
              <RecapStat label="DURATA" value={`${Math.round(lastLog.duration)}'`} />
              <RecapStat label="PACE" value={`${formatPace(lastLog.duration / lastLog.distance)}/km`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <RecapStat label="FC MEDIA" value={`${lastLog.hrAvg} bpm`} />
              <RecapStat label="RPE" value={`${lastLog.rpe}/10`} />
              <RecapStat label="FC MAX" value={lastLog.hrMax ? `${lastLog.hrMax} bpm` : "—"} />
            </div>

            {coachExcerpt && (
              <div className="mt-4 bg-ink text-paper rounded-2xl p-4 flex gap-3">
                <MessageCircle size={18} className="text-signal flex-shrink-0 mt-0.5" />
                <div className="text-sm leading-relaxed">
                  <div className="mono-font text-[10px] tracking-widest text-signal mb-1">IL COACH DICE</div>
                  {coachExcerpt}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {nextSession && (
        <div className="p-6 pt-2">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-1">▼ SUGGERITA OGGI</div>
          <div className="text-xs text-stone-500 mb-3 leading-relaxed">
            È solo un suggerimento. Puoi fare un'altra sessione della settimana — clicca qui sotto per scegliere.
          </div>
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

            {coachExcerpt && (
              <div className="mt-4 pt-4 border-t border-stone-700">
                <div className="mono-font text-[10px] tracking-widest text-signal mb-1">CONSIGLIO DALL'ULTIMO ALLENAMENTO</div>
                <div className="text-sm text-stone-300 leading-relaxed">{coachExcerpt}</div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-1 text-signal text-sm font-bold">
              APRI DETTAGLI <ChevronRight size={16} />
            </div>
          </button>
        </div>
      )}

      <div className="p-6 pt-2">
        {profile.currentBestEstimated && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <Info size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <strong>Il piano è basato su una stima del tuo livello attuale.</strong>{" "}
              Dopo le prime 2-3 sessioni reali potrai aggiornare i tuoi dati nelle impostazioni — i pace target diventeranno più precisi.
            </div>
          </div>
        )}
        {plan.philosophy && (
          <div className="mb-4">
            <RationaleBlock variant="plan" data={plan.philosophy} />
          </div>
        )}
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ PANORAMICA SPUNTI</div>
        <div className="space-y-4">
          {plan.weeks.map((week, wi) => (
            <div key={wi} className="bg-card rounded-3xl p-5 border border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="display-font text-2xl">SETTIMANA {wi + 1}</div>
                <div className="mono-font text-xs text-stone-500">{week.theme}</div>
              </div>
              {week.rationale && (
                <div className="mb-4 bg-stone-50 rounded-2xl p-4 border border-stone-200">
                  <div className="mono-font text-[10px] tracking-widest text-stone-500 mb-1">COSA COSTRUISCE</div>
                  <p className="text-sm text-stone-800 font-semibold mb-2 leading-snug">{week.rationale.buildingBlock}</p>
                  <p className="text-xs text-stone-600 leading-relaxed">{week.rationale.whyNow}</p>
                </div>
              )}
              <div className="space-y-2">
                {week.sessions.map((s, si) => {
                  const log = logs.find((l) => l.weekIdx === wi && l.sessionIdx === si);
                  const done = !!log && !log.skipped;
                  const skipped = !!log?.skipped;
                  const isNext = nextSession && nextSession.weekIdx === wi && nextSession.sessionIdx === si;
                  return (
                    <button
                      key={si}
                      onClick={() => onOpenSession({ data: s, weekIdx: wi, sessionIdx: si })}
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all ${
                        done
                          ? "bg-lime-50 border border-lime-200"
                          : skipped
                          ? "bg-stone-100 border border-stone-300 opacity-75"
                          : isNext
                          ? "bg-stone-100 border-2 border-ink"
                          : "bg-stone-50 border border-stone-200 hover:border-stone-400"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          done
                            ? "bg-lime-500 text-white"
                            : skipped
                            ? "bg-stone-400 text-white"
                            : isNext
                            ? "bg-ink text-paper"
                            : "bg-stone-200 text-stone-500"
                        }`}
                      >
                        {done ? (
                          <Check size={16} />
                        ) : skipped ? (
                          <SkipForward size={14} />
                        ) : (
                          <span className="mono-font text-xs font-bold">{si + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold text-sm truncate ${skipped ? "line-through text-stone-500" : ""}`}>
                          {s.name}
                        </div>
                        <div className="mono-font text-xs text-stone-500">
                          {skipped ? "saltato" : `${s.duration} min · ${s.type}`}
                        </div>
                      </div>
                      {!done && !skipped && (
                        <span className={`mono-font text-[9px] tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 ${
                          isNext ? "bg-ink text-paper" : "bg-lime-100 text-lime-800 border border-lime-300"
                        }`}>
                          {isNext ? "SUGGERITA" : "DISPONIBILE"}
                        </span>
                      )}
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

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-stone-800/50 rounded-2xl p-3 border border-stone-700">
      <div className="mono-font text-[10px] tracking-wider text-stone-400 mb-1">{label}</div>
      <div className="display-font text-2xl text-paper">{value}</div>
      {sub && <div className="mono-font text-[9px] text-stone-500 mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function RecapStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-stone-50 rounded-xl p-2.5 border border-stone-200">
      <div className="mono-font text-[9px] tracking-wider text-stone-500 mb-0.5">{label}</div>
      <div className="mono-font text-sm font-bold text-ink truncate">{value}</div>
    </div>
  );
}

function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function formatRaceDistance(d: number | undefined | null): string {
  const v = d && d > 0 ? d : 10;
  // Show no decimals for integers (5, 10, 42), one for half-marathon-like (21.1)
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, "");
}

function formatLoggedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function truncateToSentences(text: string, maxSentences: number): string {
  const parts = text.split(/(?<=[.!?])\s+/).slice(0, maxSentences);
  return parts.join(" ").trim();
}
