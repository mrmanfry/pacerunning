import { Target, Lightbulb, Compass } from "lucide-react";
import type { SessionRationale, WeekRationale, PlanPhilosophy } from "@/lib/pace-engine";

/**
 * RationaleBlock — componente riutilizzabile per mostrare il "perché"
 * di una sessione, settimana o piano. Accetta una delle tre varianti.
 *
 * Design: coerente col resto dell'app (bg-ink su sfondi chiari, bg-card
 * in dashboard scure, mono-font per le label, display-font per i titoli,
 * grain opzionale). Tre sezioni verticali con icone discrete sulla
 * sinistra, scansionabili senza dover leggere tutto.
 */

interface SessionRationaleProps {
  variant: "session";
  data: SessionRationale;
}
interface WeekRationaleProps {
  variant: "week";
  data: WeekRationale;
}
interface PlanPhilosophyProps {
  variant: "plan";
  data: PlanPhilosophy;
}
type Props = SessionRationaleProps | WeekRationaleProps | PlanPhilosophyProps;

export function RationaleBlock(props: Props) {
  if (props.variant === "session") {
    const r = props.data;
    return (
      <div className="bg-ink text-paper rounded-3xl p-5 grain">
        <div className="mono-font text-xs tracking-widest text-signal mb-4">
          ▼ PERCHÉ QUESTA SESSIONE
        </div>
        <Row icon={<Target size={16} />} label="OBIETTIVO" body={r.goal} emphasize />
        <Row icon={<Lightbulb size={16} />} label="PERCHÉ SERVE" body={r.why} />
        <Row icon={<Compass size={16} />} label="COME CAPIRE SE STA ANDANDO BENE" body={r.howToExecute} last />
      </div>
    );
  }

  if (props.variant === "week") {
    const r = props.data;
    return (
      <div className="bg-card border border-border rounded-3xl p-5">
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">
          ▼ PERCHÉ QUESTA SETTIMANA
        </div>
        <RowLight icon={<Target size={16} />} label="COSA COSTRUISCE" body={r.buildingBlock} emphasize />
        <RowLight icon={<Lightbulb size={16} />} label="PERCHÉ ADESSO" body={r.whyNow} />
        <RowLight icon={<Compass size={16} />} label="COSA ASPETTARTI" body={r.expectation} last />
      </div>
    );
  }

  // plan
  const r = props.data;
  return (
    <div className="bg-ink text-paper rounded-3xl p-5 grain">
      <div className="mono-font text-xs tracking-widest text-signal mb-2">
        ▼ COME È FATTO IL TUO PIANO
      </div>
      <div className="display-font text-3xl leading-tight mb-3">{r.title}</div>
      <p className="text-sm text-stone-300 leading-relaxed mb-3">{r.explanation}</p>
      <div className="pt-3 border-t border-stone-700">
        <div className="mono-font text-[10px] tracking-widest text-signal mb-1">
          COSA NOTERAI
        </div>
        <p className="text-xs text-stone-300 leading-relaxed">{r.whatYoullSee}</p>
      </div>
    </div>
  );
}

// Variante "dark" per il RationaleBlock di sessione (bg-ink)
function Row({
  icon,
  label,
  body,
  emphasize,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
  emphasize?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${last ? "" : "mb-4 pb-4 border-b border-stone-700"}`}>
      <div className="text-signal flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="mono-font text-[10px] tracking-widest text-signal mb-1">{label}</div>
        <div className={`leading-relaxed ${emphasize ? "text-paper text-base font-semibold" : "text-stone-300 text-sm"}`}>
          {body}
        </div>
      </div>
    </div>
  );
}

// Variante "light" per il RationaleBlock di settimana (bg-card)
function RowLight({
  icon,
  label,
  body,
  emphasize,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
  emphasize?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`flex gap-3 ${last ? "" : "mb-4 pb-4 border-b border-stone-200"}`}>
      <div className="text-stone-600 flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="mono-font text-[10px] tracking-widest text-stone-500 mb-1">{label}</div>
        <div className={`leading-relaxed ${emphasize ? "text-ink text-base font-semibold" : "text-stone-700 text-sm"}`}>
          {body}
        </div>
      </div>
    </div>
  );
}
