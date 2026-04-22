import { useState } from "react";
import { ArrowLeft, Activity, Clock, Heart, Flame, Sparkles, Info, Camera, Loader2, Wand2 } from "lucide-react";
import type { ExtractedWorkout, Session, SessionType, WorkoutLog } from "@/lib/pace-engine";
import { uploadWorkoutScreenshot } from "@/lib/pace-repository";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type VisualPatterns = {
  hrPattern?: "stable" | "creep" | "spiky" | "fading" | null;
  paceStrategy?: "even" | "negative-split" | "positive-split" | "intervals" | null;
  observations?: string[];
};

export type ExtractionMeta = {
  extractedWorkout: ExtractedWorkout | null;
  sourceImagePaths: string[];
  promptVersion: string | null;
  model: string | null;
};

interface Props {
  session: { data: Session; weekIdx: number; sessionIdx: number } | null;
  userId: string | null;
  onBack: () => void;
  onSave: (
    log: WorkoutLog,
    visualPatterns?: VisualPatterns | null,
    extraction?: ExtractionMeta | null,
  ) => void;
}

type AutoFlags = {
  duration?: boolean;
  distance?: boolean;
  hrAvg?: boolean;
  hrMax?: boolean;
  cadence?: boolean;
};

type FormData = {
  duration: number | null;
  distance: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  rpe: number;
  cadence: string;
  notes: string;
};

export function LogWorkout({ session, userId, onBack, onSave }: Props) {
  const [data, setData] = useState<FormData>({
    duration: session?.data.duration ?? null,
    distance: null,
    hrAvg: null,
    hrMax: null,
    rpe: 6,
    cadence: "",
    notes: "",
  });
  const [autoFlags, setAutoFlags] = useState<AutoFlags>({});
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractFailed, setExtractFailed] = useState(false);
  const [visualPatterns, setVisualPatterns] = useState<VisualPatterns | null>(null);
  const [extractionMeta, setExtractionMeta] = useState<ExtractionMeta | null>(null);

  const MAX_IMAGES = 4;
  // User has uploaded screenshots but extraction hasn't populated anything yet
  const screenshotsPendingExtraction =
    imagePreviews.length > 0 && !extracting && !extractionMeta && !extractFailed;
  const canSave =
    !extracting &&
    !screenshotsPendingExtraction &&
    (data.duration ?? 0) > 0 &&
    (data.distance ?? 0) > 0 &&
    (data.hrAvg ?? 0) > 0;

  const handleScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !userId) return;
    if (files.length > MAX_IMAGES) {
      toast({ title: `Massimo ${MAX_IMAGES} immagini`, description: "Selezionane meno e riprova.", variant: "destructive" });
      return;
    }
    for (const f of files) {
      if (f.size > 8 * 1024 * 1024) {
        toast({ title: "Immagine troppo grande", description: `${f.name}: massimo 8 MB.`, variant: "destructive" });
        return;
      }
    }

    // Anteprime locali
    const previews: string[] = [];
    await Promise.all(
      files.map(
        (f) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              previews.push(ev.target?.result as string);
              resolve();
            };
            reader.readAsDataURL(f);
          }),
      ),
    );
    setImagePreviews(previews);

    setExtracting(true);
    setExtractFailed(false);
    try {
      const paths = await Promise.all(files.map((f) => uploadWorkoutScreenshot(userId, f)));
      const { data: result, error } = await supabase.functions.invoke("extract-workout-data", {
        body: { imagePaths: paths, sessionType: session?.data.type ?? "freeform" },
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

      const newData: FormData = { ...data };
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

      // Persist deep extraction so Index can pass it to the coach + save it linked to the log
      setExtractionMeta({
        extractedWorkout: result?.extractedWorkout ?? null,
        sourceImagePaths: Array.isArray(result?.sourceImagePaths) ? result.sourceImagePaths : paths,
        promptVersion: result?.promptVersion ?? null,
        model: result?.model ?? null,
      });

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
      const message = err instanceof Error ? err.message : String(err);
      toast({
        title: "Upload fallito",
        description: message || "Errore sconosciuto. Riprova o inserisci a mano.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (field: keyof AutoFlags, value: number | string | null) => {
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

          {imagePreviews.length > 0 && (
            <div className={`mb-3 grid gap-2 ${imagePreviews.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {imagePreviews.map((src, i) => (
                <div key={i} className="rounded-2xl overflow-hidden border border-stone-700 max-h-40">
                  <img src={src} alt={`Screenshot ${i + 1}`} className="w-full h-full object-contain bg-stone-900" />
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] text-stone-400 mb-2 mono-font">
            Puoi caricare fino a {MAX_IMAGES} screenshot dello stesso allenamento (es. totali + grafico FC).
          </div>

          <label className={`block w-full ${extracting ? "opacity-60 pointer-events-none" : "cursor-pointer"}`}>
            <input
              type="file"
              accept="image/*"
              multiple
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
                  <Camera size={16} /> {imagePreviews.length > 0 ? "CAMBIA SCREENSHOT" : "SCEGLI FOTO"}
                </>
              )}
            </div>
          </label>

          {extractFailed && (
            <div className="mt-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-200 leading-relaxed">
              ⚠️ L'AI non è riuscita a leggere i numeri dallo screenshot. <strong>Inserisci i campi sotto a mano</strong> prima di salvare.
            </div>
          )}
        </div>
      </div>

      {(extracting || screenshotsPendingExtraction) && (
        <div className="px-6 mb-4">
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-3 text-xs text-amber-700 leading-relaxed flex items-center gap-2">
            <Loader2 size={14} className="animate-spin flex-shrink-0" />
            <span>
              <strong>STO LEGGENDO LO SCREENSHOT</strong> — aspetta la fine, oppure togli l'immagine per inserire a mano.
            </span>
          </div>
        </div>
      )}

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
                duration: data.duration ?? 0,
                distance: data.distance ?? 0,
                hrAvg: data.hrAvg ?? 0,
                hrMax: data.hrMax ?? null,
                rpe: data.rpe,
                cadence: data.cadence ? parseInt(data.cadence) : null,
                notes: data.notes,
              },
              visualPatterns,
              extractionMeta,
            )
          }
          className={`w-full py-4 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            canSave ? "bg-ink text-paper hover:bg-ink-soft shadow-lg" : "bg-stone-200 text-stone-400"
          }`}
        >
          {extracting ? (
            <>
              <Loader2 size={18} className="animate-spin" /> ESTRAZIONE IN CORSO...
            </>
          ) : (
            <>
              <Sparkles size={18} /> SALVA E LEGGI
            </>
          )}
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
  value: number | null;
  onChange: (n: number | null) => void;
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
          value={value ?? ""}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const n = parseFloat(raw);
            onChange(Number.isFinite(n) ? n : null);
          }}
          className="display-font text-4xl bg-transparent outline-none w-full min-w-0 placeholder:text-stone-300"
        />
        <span className="mono-font text-xs text-stone-400">{unit}</span>
      </div>
    </div>
  );
}
