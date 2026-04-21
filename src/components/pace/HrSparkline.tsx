import type { ExtractedWorkout } from "@/lib/pace-engine";

interface Props {
  hrSeries: NonNullable<ExtractedWorkout["hrSeries"]>;
  hrPattern?: ExtractedWorkout["visualPatterns"]["hrPattern"];
  width?: number;
  height?: number;
}

const PATTERN_LABEL: Record<NonNullable<Props["hrPattern"]>, string> = {
  stable: "STABILE",
  creep: "IN SALITA PROGRESSIVA",
  spiky: "A PICCHI",
  fading: "IN CALO",
};

export function HrSparkline({ hrSeries, hrPattern, width = 320, height = 80 }: Props) {
  const pts = hrSeries.points ?? [];
  if (pts.length < 2) return null;

  const xs = pts.map((p) => p.tSec);
  const ys = pts.map((p) => p.hr);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys) - 2;
  const maxY = Math.max(...ys) + 2;
  const xSpan = Math.max(1, maxX - minX);
  const ySpan = Math.max(1, maxY - minY);

  const path = pts
    .map((p, i) => {
      const x = ((p.tSec - minX) / xSpan) * width;
      const y = height - ((p.hr - minY) / ySpan) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <div className="bg-stone-800 border border-stone-700 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="mono-font text-[10px] tracking-widest text-stone-400">FREQUENZA CARDIACA</div>
        {hrPattern && (
          <div className="mono-font text-[9px] tracking-widest text-signal px-2 py-0.5 bg-signal/10 rounded-full">
            {PATTERN_LABEL[hrPattern]}
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20" preserveAspectRatio="none">
        <path d={area} fill="hsl(var(--signal) / 0.15)" stroke="none" />
        <path d={path} fill="none" stroke="hsl(var(--signal))" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between mono-font text-[10px] text-stone-500 mt-1">
        <span>{Math.round(minY)} bpm</span>
        <span>{Math.round(maxY)} bpm</span>
      </div>
    </div>
  );
}
