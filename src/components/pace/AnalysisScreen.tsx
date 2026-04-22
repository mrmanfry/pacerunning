import { useState } from "react";
import { Check, Flame, Heart, Info, Wind, Zap, Loader2, Sparkles, TrendingDown, TrendingUp, ChevronDown } from "lucide-react";
import type { Analysis, ExtractedSegment } from "@/lib/pace-engine";
import { SegmentTimeline } from "./SegmentTimeline";
import { HrSparkline } from "./HrSparkline";

const iconMap = {
  wind: Wind,
  check: Check,
  flame: Flame,
  heart: Heart,
  zap: Zap,
};

interface Props {
  analysis: Analysis | null;
  loading?: boolean;
  raceDistance?: number;
  onContinue: () => void;
  onAcceptAdjustment?: () => void;
  onIgnoreAdjustment?: () => void;
}

const VISIBLE_LIMIT = 4;

export function AnalysisScreen({ analysis, loading, raceDistance, onContinue, onAcceptAdjustment, onIgnoreAdjustment }: Props) {
  const [showAllSegments, setShowAllSegments] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink text-paper flex flex-col items-center justify-center grain px-6">
        <Loader2 size={48} className="text-signal animate-spin mb-6" />
        <div className="mono-font text-xs tracking-widest text-signal mb-2">▲ ANALISI IN CORSO</div>
        <h2 className="display-font text-4xl text-center leading-tight mb-3">
          STO LEGGENDO
          <br />
          I TUOI DATI
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          L'AI confronta questa sessione con il tuo storico per darti una lettura descrittiva.
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  const adj = analysis.planAdjustment;
  const showAdjust = adj?.shouldAdjust && typeof adj?.newTargetEstimate === "number";

  // Filter segments: only interval + recovery, drop warmup/cooldown/steady/other
  const ew = analysis.extractedWorkout;
  const allFilteredSegments: ExtractedSegment[] = (ew?.segments ?? []).filter(
    (s) => s.type === "interval" || s.type === "recovery"
  );
  const showAccordion = allFilteredSegments.length > VISIBLE_LIMIT;
  const visibleSegments = showAccordion && !showAllSegments
    ? allFilteredSegments.slice(0, VISIBLE_LIMIT)
    : allFilteredSegments;
  const hiddenCount = allFilteredSegments.length - VISIBLE_LIMIT;

  // Filter readings to interval segments only (drop reading on recovery)
  const intervalIdxs = new Set(
    (ew?.segments ?? []).filter((s) => s.type === "interval").map((s) => s.idx)
  );
  const filteredReadings = (analysis.segmentReadings ?? []).filter((r) => intervalIdxs.has(r.segmentIdx));

  const kmSplits = ew?.kmSplits ?? [];
  const hrSeries = ew?.hrSeries;
  const hrPattern = ew?.visualPatterns?.hrPattern;

  return (
    <div className="min-h-screen bg-ink text-paper pb-28 grain">
      <div className="p-6 pt-12">
        <div className="mono-font text-xs tracking-widest text-signal mb-2">
          ▲ LETTURA / DESCRITTIVA {analysis.source === "ai" && "· AI"}
        </div>
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

        {/* AI Technical Reading (Cap. 3.4) */}
        {analysis.technicalReading ? (
          <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2 text-signal">▼ LETTURA TECNICA</div>
            <div className="text-sm text-stone-200 leading-relaxed whitespace-pre-line">{analysis.technicalReading}</div>
          </div>
        ) : (
          <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2 text-stone-400">OSSERVAZIONE</div>
            <div className="text-lg font-bold mb-2">{analysis.verdictTitle}</div>
            <div className="text-sm text-stone-300 leading-relaxed">{analysis.verdictText}</div>
          </div>
        )}

        {/* Segment timeline (interval + recovery only, accordion if >4) */}
        {allFilteredSegments.length > 0 && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-400 mb-3">
              ▼ BLOCCHI DELL'ALLENAMENTO
            </div>
            <SegmentTimeline segments={visibleSegments} segmentReadings={filteredReadings} />
            {showAccordion && (
              <button
                onClick={() => setShowAllSegments((v) => !v)}
                className="mt-2 w-full text-xs mono-font tracking-widest text-stone-400 hover:text-signal transition-colors py-2 flex items-center justify-center gap-2"
              >
                {showAllSegments ? "MOSTRA MENO" : `MOSTRA ALTRE ${hiddenCount} RIPETUTE`}
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showAllSegments ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        )}

        {/* HR sparkline */}
        {hrSeries && hrSeries.points && hrSeries.points.length >= 6 && (
          <HrSparkline hrSeries={hrSeries} hrPattern={hrPattern} />
        )}

        {/* Km splits table */}
        {kmSplits.length > 0 && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-400 mb-3">▼ PARZIALI PER KM</div>
            <div className="bg-stone-800 border border-stone-700 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-3 mono-font text-[10px] tracking-widest text-stone-400 px-4 py-2 bg-stone-900 border-b border-stone-700">
                <span>KM</span>
                <span className="text-right">PACE</span>
                <span className="text-right">FC</span>
              </div>
              {kmSplits.map((k, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-3 mono-font text-xs px-4 py-2 ${
                    i < kmSplits.length - 1 ? "border-b border-stone-700/60" : ""
                  }`}
                >
                  <span className="text-stone-300">{k.km}</span>
                  <span className="text-right text-paper font-bold">{formatPace(k.paceSecPerKm)}</span>
                  <span className="text-right text-signal">{k.hrAvg != null ? `${k.hrAvg}` : "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Session Highlight */}
        {analysis.sessionHighlight && (
          <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2 text-signal">▼ HIGHLIGHT DELLA SESSIONE</div>
            <div className="text-sm text-stone-200 leading-relaxed whitespace-pre-line">{analysis.sessionHighlight}</div>
          </div>
        )}

        {/* Deterministic insights (always shown if present) */}
        {analysis.insights.length > 0 && (
          <div>
            <div className="mono-font text-xs tracking-widest text-stone-400 mb-3">▼ SPUNTI DAI DATI</div>
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

        {/* Plan adjustment (NEW) */}
        {showAdjust && (
          <div className="bg-signal text-ink rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2 flex items-center gap-2">
              📋 ADATTAMENTO PIANO
            </div>
            <div className="display-font text-4xl leading-none mb-2 flex items-center gap-2">
              {adj!.newTargetEstimate! > analysis.hrAvg ? null : null}
              ~{adj!.newTargetEstimate}'
              {analysis.prediction && adj!.newTargetEstimate! > parseInt(analysis.prediction.time) ? (
                <TrendingUp size={28} />
              ) : (
                <TrendingDown size={28} />
              )}
            </div>
            <div className="text-sm leading-relaxed mb-4">{adj!.message}</div>
            {(onAcceptAdjustment || onIgnoreAdjustment) && (
              <div className="flex gap-2">
                {onAcceptAdjustment && (
                  <button
                    onClick={onAcceptAdjustment}
                    className="flex-1 bg-ink text-paper py-2.5 rounded-full font-bold text-xs tracking-wider hover:bg-ink-soft transition-all"
                  >
                    ACCETTA NUOVO TARGET
                  </button>
                )}
                {onIgnoreAdjustment && (
                  <button
                    onClick={onIgnoreAdjustment}
                    className="px-4 bg-ink/10 text-ink py-2.5 rounded-full font-bold text-xs tracking-wider hover:bg-ink/20 transition-all"
                  >
                    IGNORA
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {analysis.prediction && !showAdjust && (
          <div className="bg-signal text-ink rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest mb-2 flex items-center justify-between gap-2">
              <span>STIMA INDICATIVA {formatRaceDistanceLabel(raceDistance)}</span>
              {analysis.prediction.confidence && (
                <span className="px-2 py-0.5 rounded-full bg-ink text-signal text-[9px] tracking-wider">
                  CONFIDENZA {analysis.prediction.confidence === "high" ? "ALTA" : analysis.prediction.confidence === "medium" ? "MEDIA" : "BASSA"}
                </span>
              )}
            </div>
            {analysis.prediction.confidence === "low" ? (
              <>
                <div className="display-font text-3xl leading-tight mb-1">Raccogliendo dati</div>
                <div className="text-sm">{analysis.prediction.text}</div>
              </>
            ) : (
              <>
                <div className="display-font text-5xl leading-none mb-1">~{analysis.prediction.time}</div>
                {analysis.prediction.low && analysis.prediction.high && (
                  <div className="text-sm mb-1">
                    Banda probabile: <span className="font-bold">{analysis.prediction.low}</span> – <span className="font-bold">{analysis.prediction.high}</span>
                  </div>
                )}
                <div className="text-sm">{analysis.prediction.text}</div>
              </>
            )}
            <div className="text-[11px] mt-2 opacity-70">
              Riegel + normalizzazione FC, pesata sulle sessioni recenti. Non è una previsione.
            </div>
          </div>
        )}

        {/* Next move (AI preferred, fallback to deterministic) */}
        <div className="bg-stone-800 border border-stone-700 rounded-3xl p-5">
          <div className="mono-font text-xs tracking-widest text-signal mb-2 flex items-center gap-2">
            <Sparkles size={12} /> SPUNTO OPERATIVO
          </div>
          <div className="text-sm leading-relaxed whitespace-pre-line">
            {analysis.aiNextMove || analysis.nextMove}
          </div>
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

function formatRaceDistanceLabel(d: number | undefined | null): string {
  const v = d && d > 0 ? d : 10;
  if (Number.isInteger(v)) return `${v}K`;
  return `${Math.round(v)}K`;
}

function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}
