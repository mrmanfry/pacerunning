import type { ExtractedSegment } from "@/lib/pace-engine";

interface Props {
  segments: ExtractedSegment[];
  segmentReadings?: { segmentIdx: number; comment: string }[];
}

const KIND_LABEL: Record<ExtractedSegment["type"], string> = {
  warmup: "RISC.",
  interval: "RIPETUTA",
  recovery: "RECUP.",
  cooldown: "DEFAT.",
  steady: "CONTINUO",
  other: "ALTRO",
};

const KIND_COLOR: Record<ExtractedSegment["type"], string> = {
  warmup: "bg-stone-500",
  interval: "bg-signal",
  recovery: "bg-stone-400",
  cooldown: "bg-stone-500",
  steady: "bg-emerald-500",
  other: "bg-stone-400",
};

function fmtDuration(sec: number | null): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}'${String(s).padStart(2, "0")}"`;
}

function fmtPace(secPerKm: number | null): string {
  if (secPerKm == null || !isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

export function SegmentTimeline({ segments, segmentReadings }: Props) {
  if (!segments || segments.length === 0) return null;

  const maxDur = Math.max(1, ...segments.map((s) => s.durationSec ?? 0));
  const readingByIdx = new Map((segmentReadings ?? []).map((r) => [r.segmentIdx, r.comment]));

  return (
    <div className="space-y-2">
      {segments.map((seg) => {
        const widthPct = Math.max(8, ((seg.durationSec ?? 0) / maxDur) * 100);
        const reading = readingByIdx.get(seg.idx);
        return (
          <div key={seg.idx} className="bg-stone-800 border border-stone-700 rounded-2xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <div className="mono-font text-[10px] tracking-widest text-stone-400 w-20 flex-shrink-0">
                {KIND_LABEL[seg.type]}
              </div>
              <div className="flex-1 h-2 bg-stone-700 rounded-full overflow-hidden">
                <div className={`h-full ${KIND_COLOR[seg.type]}`} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="mono-font text-xs font-bold text-paper flex-shrink-0">
                {fmtDuration(seg.durationSec)}
              </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-stone-300 mono-font">
              <span className="truncate flex-1">{seg.label}</span>
              {seg.paceSecPerKm != null && <span>{fmtPace(seg.paceSecPerKm)}</span>}
              {seg.hrAvg != null && <span className="text-signal">{seg.hrAvg} bpm</span>}
              {seg.hrMax != null && <span className="text-stone-400">max {seg.hrMax}</span>}
            </div>
            {reading && (
              <div className="mt-2 pt-2 border-t border-stone-700 text-xs text-stone-200 leading-relaxed">
                {reading}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
