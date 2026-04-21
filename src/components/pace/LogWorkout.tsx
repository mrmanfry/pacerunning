import { useState } from "react";
import { ArrowLeft, Activity, Clock, Heart, Flame, Sparkles, Info, Camera, Loader2, Wand2 } from "lucide-react";
import type { Session, SessionType, WorkoutLog } from "@/lib/pace-engine";
import { uploadWorkoutScreenshot } from "@/lib/pace-repository";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type VisualPatterns = {
  hrPattern?: "stable" | "creep" | "spiky" | "fading" | null;
  paceStrategy?: "even" | "negative-split" | "positive-split" | "intervals" | null;
  observations?: string[];
};

interface Props {
  session: { data: Session; weekIdx: number; sessionIdx: number } | null;
  userId: string | null;
  onBack: () => void;
  onSave: (log: WorkoutLog, visualPatterns?: VisualPatterns | null) => void;
}

type AutoFlags = {
  duration?: boolean;
  distance?: boolean;
  hrAvg?: boolean;
  hrMax?: boolean;
  cadence?: boolean;
};

export function LogWorkout({ session, userId, onBack, onSave }: Props) {
  const [data, setData] = useState({
    duration: session?.data.duration || 45,
    distance: 5,
    hrAvg: 150,
    hrMax: 170,
    rpe: 6,
    cadence: "",
    notes: "",
  });
  const [autoFlags, setAutoFlags] = useState<AutoFlags>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractFailed, setExtractFailed] = useState(false);
  const [visualPatterns, setVisualPatterns] = useState<VisualPatterns | null>(null);

  const canSave = data.duration > 0 && data.distance > 0 && data.hrAvg > 0;

  const handleScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Immagine troppo grande", description: "Massimo 8 MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setExtracting(true);
    setExtractFailed(false);
    try {
      const path = await uploadWorkoutScreenshot(userId, file);
      const { data: result, error } = await supabase.functions.invoke("extract-workout-data", {
        body: { imagePath: path, sessionType: session?.data.type ?? "freeform" },
      });

      if (error) {
        const status = (error as any).context?.status;
        if (status === 429) toast({ title: "Limite richieste raggiunto", description: "Riprova tra poco.", variant: "destructive" });
        else if (status === 402) toast({ title: "Crediti AI esauriti", description: "Aggiungi crediti per continuare.", variant: "destructive" });
        else toast({ title: "Estrazione fallita", description: "Inserisci i dati a mano o riprova.", variant: "destructive" });
        setExtractFailed(true);
        return;
      }

      const ext = result?.extracted;
      if (!ext) {
        toast({ title: "Nessun dato leggibile", description: "Inserisci a mano.", variant: "destructive" });
        setExtractFailed(true);
        return;
      }

      const newData = { ...data };
      const flags: AutoFlags = {};
      if (typeof ext.duration === "number") { newData.duration = Math.round(ext.duration * 100) / 100; flags.duration = true; }
      if (typeof ext.distance === "number") { newData.distance = Math.round(ext.distance * 100) / 100; flags.distance = true; }
      if (typeof ext.hrAvg === "number") { newData.hrAvg = ext.hrAvg; flags.hrAvg = true; }
      if (typeof ext.hrMax === "number") { newData.hrMax = ext.hrMax; flags.hrMax = true; }
      if (typeof ext.cadence === "number") { newData.cadence = String(ext.cadence); flags.cadence = true; }
      setData(newData);
      setAutoFlags(flags);

      // Pattern qualitativi dal grafico (vision estesa)
      const vp: VisualPatterns = {
        hrPattern: ext.hrPattern ?? null,
        paceStrategy: ext.paceStrategy ?? null,
        observations: Array.isArray(ext.observations) ? ext.observations : [],
      };
      const hasVp = vp.hrPattern || vp.paceStrategy || (vp.observations && vp.observations.length > 0);
      setVisualPatterns(hasVp ? vp : null);

      const filledCount = Object.keys(flags).length;
      if (filledCount === 0) {
        setExtractFailed(true);
        toast({
          title: "Nessun valore riconosciuto",
          description: "L'AI non è riuscita a leggere i numeri. Inserisci a mano.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `Estratti ${filledCount} valori`,
          description: ext.detectedApp ? `Da: ${ext.detectedApp} (confidenza ${ext.confidence})` : "Verifica i numeri prima di salvare.",
        });
      }
    } catch (err) {
      console.error(err);
      setExtractFailed(true);
      toast({ title: "Errore upload", description: "Riprova più tardi.", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (field: keyof AutoFlags, value: number | string) => {
    setData({ ...data, [field]: value });
    if (autoFlags[field]) setAutoFlags({ ...autoFlags, [field]: false });
  };

  return (
    <div className="min-h-screen bg-paper pb-32">
      <div className="p-6 pt-12">
        <button onClick={onBack} className="mb-6">
          <ArrowLeft size={24} className="text-stone-700" />
        </button>
        <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">▲ LOG / ALLENAMENTO</div>
        <h2 className="display-font text-5xl leading-tight mb-2">
          COM'È
          <br />
          ANDATA?
        </h2>
        <p className="text-stone-500 text-sm">
          {session ? `Sessione: ${session.data.name}` : "Inserisci i dati dell'allenamento"}
        </p>
      </div>

      {/* Screenshot import */}
      <div className="px-6 mb-6">
        <div className="bg-ink text-paper rounded-3xl p-5 grain">
          <div className="mono-font text-xs tracking-widest text-signal mb-2">📸 IMPORTA DA SCREENSHOT</div>
          <div className="text-sm text-stone-300 mb-3 leading-relaxed">
            Carica uno screenshot da Apple Salute, Strava, Garmin... L'AI legge i numeri e compila il form.
          </div>

          {imagePreview && (
            <div className="mb-3 rounded-2xl overflow-hidden border border-stone-700 max-h-48">
              <img src={imagePreview} alt="Screenshot allenamento" className="w-full object-contain bg-stone-900" />
            </div>
          )}

          <label className={`block w-full ${extracting ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleScreenshot}
              disabled={extracting || !userId}
              className="hidden"
            />
            <div className="bg-signal text-ink py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-signal-soft transition-all">
              {extracting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> STO LEGGENDO I DATI...
                </>
              ) : (
                <>
                  <Camera size={16} /> {imagePreview ? "CAMBIA SCREENSHOT" : "SCEGLI FOTO"}
                </>
              )}
            </div>
          </label>

          {extractFailed && (
            <div className="mt-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-200 leading-relaxed">
              ⚠️ L'AI non è riuscita a leggere i numeri dallo screenshot. <strong>Controlla i campi sotto e correggili a mano</strong> prima di salvare: i valori attuali sono solo placeholder.
            </div>
          )}
        </div>
      </div>

      <div className="px-6 space-y-6">
        <div className="grid grid-cols-2 gap-3">
          <MetricCard icon={<Clock size={16} />} label="DURATA" value={data.duration} onChange={(v) => updateField("duration", v)} unit="min" auto={autoFlags.duration} />
          <MetricCard icon={<Activity size={16} />} label="DISTANZA" value={data.distance} onChange={(v) => updateField("distance", v)} unit="km" step={0.1} auto={autoFlags.distance} />
          <MetricCard icon={<Heart size={16} />} label="FC MEDIA" value={data.hrAvg} onChange={(v) => updateField("hrAvg", v)} unit="bpm" auto={autoFlags.hrAvg} />
          <MetricCard icon={<Flame size={16} />} label="FC MAX" value={data.hrMax} onChange={(v) => updateField("hrMax", v)} unit="bpm" auto={autoFlags.hrMax} />
        </div>

        <div className="bg-card rounded-3xl p-5 border border-border">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-3">SFORZO PERCEPITO</div>
          <div className="display-font text-6xl mb-3">
            {data.rpe}
            <span className="text-stone-400 text-3xl">/10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={data.rpe}
            onChange={(e) => setData({ ...data, rpe: parseInt(e.target.value) })}
            className="w-full accent-lime-500"
          />
          <div className="flex justify-between mono-font text-[10px] text-stone-400 mt-1">
            <span>FACILE</span>
            <span>MEDIO</span>
            <span>AL MASSIMO</span>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 border border-border space-y-4">
          <div className="mono-font text-xs tracking-widest text-stone-500">OPZIONALE</div>
          <div>
            <div className="text-xs text-stone-500 mb-1 flex items-center gap-2">
              Cadenza (passi/min)
              {autoFlags.cadence && <AutoBadge />}
            </div>
            <input
              type="number"
              value={data.cadence}
              onChange={(e) => updateField("cadence", e.target.value)}
              placeholder="es. 165"
              className="w-full bg-stone-50 rounded-xl px-4 py-3 outline-none text-sm mono-font"
            />
          </div>
          <div>
            <div className="text-xs text-stone-500 mb-1">Note (sensazioni, dolori, stanchezza...)</div>
            <textarea
              value={data.notes}
              onChange={(e) => setData({ ...data, notes: e.target.value })}
              placeholder="Come ti sentivi? Segnala qui eventuali dolori o malessere."
              rows={3}
              maxLength={1000}
              className="w-full bg-stone-50 rounded-xl px-4 py-3 outline-none text-sm resize-none"
            />
          </div>
        </div>

        <div className="bg-stone-100 rounded-2xl p-4 flex gap-3">
          <Info size={16} className="text-stone-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-stone-600 leading-relaxed">
            Se hai avvertito dolore, malessere o sintomi insoliti, segnalali nelle note. Se sono seri, prima di salvare
            ti invitiamo a consultare un medico.
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-md w-full px-6">
        <button
          disabled={!canSave}
          onClick={() =>
            onSave(
              {
                weekIdx: session?.weekIdx ?? null,
                sessionIdx: session?.sessionIdx ?? null,
                sessionType: (session?.data.type ?? "freeform") as SessionType,
                sessionName: session?.data.name || "Allenamento libero",
                duration: data.duration,
                distance: data.distance,
                hrAvg: data.hrAvg,
                hrMax: data.hrMax,
                rpe: data.rpe,
                cadence: data.cadence ? parseInt(data.cadence) : null,
                notes: data.notes,
              },
              visualPatterns,
            )
          }
          className={`w-full py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            canSave ? "bg-ink text-paper hover:bg-ink-soft shadow-lg" : "bg-stone-200 text-stone-400"
          }`}
        >
          <Sparkles size={18} /> SALVA E LEGGI
        </button>
      </div>
    </div>
  );
}

function AutoBadge() {
  return (
    <span className="inline-flex items-center gap-1 mono-font text-[9px] px-1.5 py-0.5 bg-signal/20 text-signal-soft rounded-full">
      <Wand2 size={9} /> AUTO
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  onChange,
  unit,
  step = 1,
  auto,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (n: number) => void;
  unit: string;
  step?: number;
  auto?: boolean;
}) {
  return (
    <div className={`bg-card rounded-3xl p-4 border ${auto ? "border-signal/60" : "border-border"}`}>
      <div className="flex items-center justify-between mb-2 text-stone-500">
        <div className="flex items-center gap-2">
          {icon}
          <div className="mono-font text-[10px] tracking-wider">{label}</div>
        </div>
        {auto && <AutoBadge />}
      </div>
      <div className="flex items-baseline gap-1">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="display-font text-4xl bg-transparent outline-none w-full min-w-0"
        />
        <span className="mono-font text-xs text-stone-400">{unit}</span>
      </div>
    </div>
  );
}
