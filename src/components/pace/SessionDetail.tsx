import { ArrowLeft, AlertTriangle, Check, CheckCircle2, MessageCircle, SkipForward, X } from "lucide-react";
import { useState } from "react";
import type { Profile, Session, WorkoutLog } from "@/lib/pace-engine";
import { computeZones, getTypeBg } from "@/lib/pace-engine";
import type { StoredAnalysis } from "@/lib/pace-repository";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  session: { data: Session; weekIdx: number; sessionIdx: number };
  profile: Profile;
  loggedData?: WorkoutLog;
  recentAnalyses?: StoredAnalysis[];
  /** If set, the system was suggesting a different session — name shown in info banner. */
  suggestedSessionName?: string | null;
  onBack: () => void;
  onLog: () => void;
  onSkip?: (reason: string) => Promise<void> | void;
}

export function SessionDetail({ session, profile, loggedData, recentAnalyses, suggestedSessionName, onBack, onLog, onSkip }: Props) {
  const zones = computeZones(profile, session.data.type);
  const s = session.data;
  const isCompleted = !!loggedData;
  const isSkipped = !!loggedData?.skipped;

  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [skipping, setSkipping] = useState(false);

  const handleConfirmSkip = async () => {
    if (!onSkip) return;
    setSkipping(true);
    try {
      await onSkip(skipReason.trim());
      setShowSkipDialog(false);
      setSkipReason("");
    } finally {
      setSkipping(false);
    }
  };

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

        {isCompleted && !isSkipped && (
          <div className="mt-4 bg-lime-500 text-lime-950 rounded-full px-4 py-2 inline-flex items-center gap-2 text-xs font-bold">
            <CheckCircle2 size={16} /> ALLENAMENTO COMPLETATO
            {loggedData?.loggedAt && (
              <span className="mono-font text-[10px] opacity-80">· {formatLoggedDate(loggedData.loggedAt)}</span>
            )}
          </div>
        )}

        {isSkipped && (
          <div className="mt-4 bg-stone-700 text-paper rounded-full px-4 py-2 inline-flex items-center gap-2 text-xs font-bold">
            <SkipForward size={16} /> ALLENAMENTO SALTATO
            {loggedData?.loggedAt && (
              <span className="mono-font text-[10px] opacity-80">· {formatLoggedDate(loggedData.loggedAt)}</span>
            )}
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {isSkipped && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ HAI SALTATO QUESTA SESSIONE</div>
            <div className="bg-stone-100 border border-stone-200 rounded-3xl p-5">
              {loggedData?.skipReason ? (
                <>
                  <div className="mono-font text-[10px] tracking-widest text-stone-500 mb-1">MOTIVO</div>
                  <div className="text-sm text-stone-800 leading-relaxed">{loggedData.skipReason}</div>
                </>
              ) : (
                <div className="text-sm text-stone-600">Nessun motivo registrato.</div>
              )}
              <div className="mt-3 text-xs text-stone-500 leading-relaxed">
                Saltare un allenamento ogni tanto è normale. Il prossimo spunto del diario è comunque disponibile in
                Dashboard, e il coach ne tiene conto nel suggerirti come riprendere.
              </div>
            </div>
          </div>
        )}

        {isCompleted && !isSkipped && loggedData && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">▼ COSA HAI FATTO</div>
            <div className="bg-ink text-paper rounded-3xl p-5 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <DataStat label="DISTANZA" value={`${loggedData.distance.toFixed(2)} km`} />
                <DataStat label="DURATA" value={`${Math.round(loggedData.duration)}'`} />
                <DataStat label="PACE" value={`${formatPace(loggedData.duration / loggedData.distance)}/km`} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <DataStat label="FC MEDIA" value={`${loggedData.hrAvg} bpm`} />
                <DataStat label="FC MAX" value={loggedData.hrMax ? `${loggedData.hrMax} bpm` : "—"} />
                <DataStat label="RPE" value={`${loggedData.rpe}/10`} />
              </div>
              {loggedData.cadence && (
                <div className="grid grid-cols-3 gap-2">
                  <DataStat label="CADENZA" value={`${loggedData.cadence} spm`} />
                </div>
              )}
              {loggedData.notes && (
                <div className="pt-2 border-t border-stone-700">
                  <div className="mono-font text-[10px] tracking-widest text-stone-400 mb-1">NOTE</div>
                  <div className="text-sm text-stone-200 leading-relaxed">{loggedData.notes}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {isCompleted && !isSkipped && recentAnalyses && recentAnalyses.length > 0 && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">
              ▼ STORICO COACH (ULTIMI {recentAnalyses.length})
            </div>
            <div className="text-xs text-stone-500 mb-3">Vedi come si sta evolvendo il consiglio nel tempo.</div>
            <div className="space-y-3">
              {recentAnalyses.map((a, i) => {
                const isCurrent = loggedData?.id && a.logId === loggedData.id;
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl p-4 border ${
                      isCurrent ? "bg-ink text-paper border-ink" : "bg-card border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <MessageCircle size={14} className={isCurrent ? "text-signal" : "text-stone-500"} />
                        <span
                          className={`mono-font text-[10px] tracking-widest ${
                            isCurrent ? "text-signal" : "text-stone-500"
                          }`}
                        >
                          {isCurrent ? "QUESTA SESSIONE" : `${i === 0 ? "ULTIMA" : i === 1 ? "PRECEDENTE" : "PRIMA"}`}
                        </span>
                      </div>
                      <span
                        className={`mono-font text-[10px] ${isCurrent ? "text-stone-400" : "text-stone-400"}`}
                      >
                        {formatLoggedDate(a.createdAt)}
                      </span>
                    </div>
                    {a.nextMove && (
                      <div
                        className={`text-sm leading-relaxed ${isCurrent ? "text-paper" : "text-stone-800"}`}
                      >
                        {a.nextMove}
                      </div>
                    )}
                    {!a.nextMove && a.sessionHighlight && (
                      <div
                        className={`text-sm leading-relaxed ${isCurrent ? "text-paper" : "text-stone-800"}`}
                      >
                        {a.sessionHighlight}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">
            ▼ {isCompleted ? "COSA ERA PREVISTO" : "SPUNTI PER LA SESSIONE"}
          </div>
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

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6 space-y-2">
        {isCompleted ? (
          <button
            onClick={onBack}
            className="w-full bg-stone-200 text-ink py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg hover:bg-stone-300 transition-all active:scale-[0.98]"
          >
            <ArrowLeft size={18} /> TORNA AL DIARIO
          </button>
        ) : (
          <>
            <button
              onClick={onLog}
              className="w-full bg-ink text-paper py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 shadow-lg hover:bg-ink-soft transition-all active:scale-[0.98]"
            >
              <Check size={18} /> REGISTRA QUESTO ALLENAMENTO
            </button>
            {onSkip && (
              <button
                onClick={() => setShowSkipDialog(true)}
                className="w-full bg-stone-100 text-stone-700 py-3 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-stone-200 transition-all active:scale-[0.98] text-sm border border-stone-300"
              >
                <SkipForward size={16} /> HO SALTATO QUESTO ALLENAMENTO
              </button>
            )}
          </>
        )}
      </div>

      <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hai saltato questo allenamento?</DialogTitle>
            <DialogDescription>
              Lo segniamo come "saltato". Il coach ne terrà conto e ti dirà cosa fare al prossimo. Capita a tutti.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="mono-font text-xs tracking-widest text-stone-500">MOTIVO (FACOLTATIVO)</label>
            <Textarea
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="Es: troppo stanco, impegni di lavoro, brutto tempo..."
              rows={3}
              maxLength={300}
            />
          </div>
          <DialogFooter className="gap-2">
            <button
              onClick={() => setShowSkipDialog(false)}
              disabled={skipping}
              className="px-5 py-2.5 rounded-full text-sm font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition-all flex items-center gap-2"
            >
              <X size={14} /> Annulla
            </button>
            <button
              onClick={handleConfirmSkip}
              disabled={skipping}
              className="px-5 py-2.5 rounded-full text-sm font-bold bg-ink text-paper hover:bg-ink-soft transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <SkipForward size={14} /> {skipping ? "Salvo..." : "Conferma salto"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <div className="bg-ink/10 text-ink px-3 py-1 rounded-full text-xs font-bold">{children}</div>;
}

function DataStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-stone-800/60 rounded-xl p-2.5 border border-stone-700">
      <div className="mono-font text-[9px] tracking-wider text-stone-400 mb-0.5">{label}</div>
      <div className="mono-font text-sm font-bold text-paper truncate">{value}</div>
    </div>
  );
}

function formatPace(minPerKm: number): string {
  if (!isFinite(minPerKm) || minPerKm <= 0) return "—";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function formatLoggedDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}
