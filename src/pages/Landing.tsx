import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Calendar,
  Camera,
  ChevronRight,
  Heart,
  Info,
  LineChart,
  MessageCircle,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";

/**
 * Landing page pubblica di PACE.
 *
 * Coerenza con l'app:
 *  - Stessa palette (ink, paper, signal)
 *  - Stessi font (Bebas Neue display, JetBrains Mono mono, Inter body)
 *  - Stessa grana, stessi arrotondamenti 3xl, stessi chip mono-font
 *  - Mobile-first, respiro desktop
 *
 * Posizionamento (Porta A/B — coach amico di un runner amatoriale):
 *  - "Diario sportivo con coach AI amichevole"
 *  - Linguaggio descrittivo, non prescrittivo
 *  - Disclaimer "non è medico" già qui, non solo nel friction wall
 */
export default function Landing() {
  const navigate = useNavigate();
  const goToApp = () => navigate("/app");

  return (
    <div className="min-h-screen bg-paper">
      {/* ========================================================= */}
      {/* NAV                                                        */}
      {/* ========================================================= */}
      <nav className="sticky top-0 z-40 bg-paper/90 backdrop-blur-sm border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="display-font text-2xl tracking-wider">PACE</div>
            <div className="mono-font text-[10px] tracking-widest text-stone-500 hidden sm:block">
              / DIARIO DI CORSA
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToApp}
              className="hidden sm:block mono-font text-xs tracking-widest text-stone-600 hover:text-ink px-3 py-2"
            >
              ACCEDI
            </button>
            <button
              onClick={goToApp}
              className="bg-ink text-paper px-5 py-2.5 rounded-full font-bold text-sm tracking-wide hover:bg-ink-soft transition-all active:scale-[0.98]"
            >
              INIZIA
            </button>
          </div>
        </div>
      </nav>

      {/* ========================================================= */}
      {/* HERO                                                       */}
      {/* ========================================================= */}
      <section className="bg-ink text-paper grain relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-20 md:pt-24 md:pb-28 relative">
          <div className="mono-font text-xs tracking-widest text-signal mb-6 flex items-center gap-2">
            ▲ PREP.10K / PER RUNNER AMATORIALI
          </div>

          <h1 className="display-font text-6xl sm:text-7xl md:text-8xl leading-[0.85] mb-6 max-w-4xl">
            IL TUO<br />
            DIARIO DI<br />
            CORSA,<br />
            LETTO DA<br />
            UN <span className="text-signal">AMICO</span><br />
            CHE CAPISCE<br />
            I DATI.
          </h1>

          <p className="text-stone-300 text-lg md:text-xl leading-relaxed max-w-2xl mb-10">
            Registri gli allenamenti. PACE legge i numeri, ti dice com'è andata, e ti suggerisce cosa fare al prossimo. Come un amico esperto, non come un medico.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 max-w-md">
            <button
              onClick={goToApp}
              className="bg-signal text-ink py-4 px-8 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 hover:bg-signal-soft transition-all active:scale-[0.98] shadow-lg shadow-signal/30"
            >
              CREA IL TUO DIARIO <ArrowRight size={18} />
            </button>
            <button
              onClick={() => {
                const el = document.getElementById("come-funziona");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="border border-stone-600 text-paper py-4 px-6 rounded-full font-bold tracking-wide hover:bg-stone-800 transition-all text-sm"
            >
              COME FUNZIONA
            </button>
          </div>

          {/* Disclaimer in hero: prima cosa che si vede */}
          <div className="mt-10 flex items-start gap-3 text-xs text-stone-400 max-w-xl leading-relaxed">
            <ShieldAlert size={14} className="text-signal flex-shrink-0 mt-0.5" />
            <div>
              PACE è uno strumento sportivo amatoriale, <span className="text-paper font-semibold">non un dispositivo medico</span>. Non sostituisce il tuo medico o un allenatore qualificato.
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* PROBLEMA / COSA RISOLVE                                    */}
      {/* ========================================================= */}
      <section className="bg-paper py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">▼ IL PROBLEMA</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-10">
            HAI L'OROLOGIO.<br />
            HAI I DATI.<br />
            MA COSA<br />
            <span className="text-stone-400">CI FAI?</span>
          </h2>

          <div className="space-y-5 text-lg leading-relaxed text-stone-700 max-w-2xl">
            <p>
              Garmin e Strava ti mostrano un grafico di frequenza cardiaca, un passo medio, magari un "Training Effect" con un numerino. Ma nessuno ti spiega cosa farci davvero: se quell'allenamento era al ritmo giusto, se hai spinto troppo, cosa cambiare alla prossima sessione.
            </p>
            <p>
              Un personal trainer costa 60–80 € l'ora. Un piano generico dal blog "10K in 8 settimane" non sa se stai andando troppo forte o se stamattina eri solo stanco.
            </p>
            <p className="text-ink font-semibold">
              PACE sta in mezzo: legge i tuoi numeri, li interpreta come farebbe un amico runner di esperienza, e ti tiene la rotta settimana dopo settimana.
            </p>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* COME FUNZIONA — 3 STEP                                     */}
      {/* ========================================================= */}
      <section id="come-funziona" className="bg-stone-100 py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">▼ COME FUNZIONA</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-12">
            TRE PASSI.<br />
            <span className="text-signal-600">NIENTE DI PIÙ.</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-5">
            <StepCard
              number="01"
              title="DIMMI CHI SEI"
              description="Età, peso, tempo recente sui 10 km, giorni alla gara. 90 secondi. Da qui calcoliamo le tue zone cardiache indicative e ti costruiamo un diario di lavoro settimanale."
              icon={<Target size={20} />}
            />
            <StepCard
              number="02"
              title="REGISTRA LE CORSE"
              description="Dopo ogni allenamento: inserisci i dati a mano oppure carica uno screenshot da Strava/Garmin/Apple Salute. Un AI riconosce i numeri e compila il log per te."
              icon={<Camera size={20} />}
            />
            <StepCard
              number="03"
              title="LEGGI IL COACH"
              description="Per ogni sessione ti diciamo com'è andata davvero, cosa ha funzionato, e cosa fare al prossimo allenamento. Tono da amico, non da libretto di istruzioni."
              icon={<MessageCircle size={20} />}
            />
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* MOCKUP COACH — BLOCCO DIMOSTRATIVO                         */}
      {/* ========================================================= */}
      <section className="bg-paper py-16 md:py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">▼ ESEMPIO DI LETTURA</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-4">
            NON TI DICIAMO<br />
            "BRAVO".
          </h2>
          <p className="text-stone-600 text-lg mb-10 max-w-2xl">
            Ti diciamo perché quel dato significa qualcosa, e cosa farne.
          </p>

          <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 items-start">
            {/* Log sinistro — input */}
            <div className="bg-stone-50 rounded-3xl border border-stone-200 p-6">
              <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">
                ▼ IL TUO LOG
              </div>
              <div className="display-font text-2xl mb-1">RIPETUTE LUNGHE</div>
              <div className="mono-font text-xs text-stone-500 mb-5">SETTIMANA 2 · SESSIONE 1</div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <MiniStat label="DISTANZA" value="5,72 km" />
                <MiniStat label="DURATA" value="34'" />
                <MiniStat label="PACE" value="5'57&quot;/km" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniStat label="FC MEDIA" value="167 bpm" />
                <MiniStat label="FC MAX" value="183 bpm" />
                <MiniStat label="RPE" value="7/10" />
              </div>
            </div>

            {/* Coach destro — output */}
            <div className="bg-ink text-paper rounded-3xl p-6 grain relative">
              <div className="mono-font text-xs tracking-widest text-signal mb-3 flex items-center gap-2">
                <Sparkles size={12} /> IL COACH DICE
              </div>
              <div className="display-font text-2xl leading-tight mb-4 text-signal">
                LAVORO DI QUALITÀ CENTRATO.
              </div>
              <div className="text-sm text-stone-300 leading-relaxed space-y-3">
                <p>
                  FC media all'88% della tua massima stimata, proprio dove dovrebbero stare le ripetute lunghe secondo i riferimenti amatoriali. Sforzo percepito 7/10 coerente: impegnativo ma non al limite, come deve essere.
                </p>
                <p>
                  <span className="text-paper font-semibold">Per il prossimo:</span> in programma c'è un medio continuo da 40'. Visto che oggi hai lavorato bene in soglia, tieni la FC media tra 155 e 162. Se ti senti pesante nei primi 10', riduci di 5' la parte centrale.
                </p>
              </div>
              <div className="mt-4 pt-4 border-t border-stone-700 flex items-center gap-2 text-xs text-stone-500">
                <Info size={12} /> Stima Riegel + normalizzazione FC. Non è una prescrizione.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FEATURES / COSA TROVI DENTRO                               */}
      {/* ========================================================= */}
      <section className="bg-ink text-paper py-16 md:py-24 grain">
        <div className="max-w-5xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-signal mb-4">▼ COSA C'È DENTRO</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-12">
            NON È LO STRAVA<br />
            CHE CONOSCI.
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <FeatureCard
              icon={<Activity size={18} />}
              title="Diario settimanale"
              text="Un piano di massima costruito sui tuoi dati, con sessioni di fondo, medio, ripetute e lungo. Zone cardiache calibrate sulla tua età e sui picchi che osserviamo nei log."
            />
            <FeatureCard
              icon={<Camera size={18} />}
              title="Import da screenshot"
              text="Carichi una foto del riassunto Garmin/Strava/Apple Salute: un AI legge durata, distanza, FC e cadenza. Verifichi e salvi."
            />
            <FeatureCard
              icon={<MessageCircle size={18} />}
              title="Coach AI amichevole"
              text="Ogni allenamento viene commentato in linguaggio semplice, ancorato alla prossima sessione prevista dal piano. Niente tono da manuale."
            />
            <FeatureCard
              icon={<LineChart size={18} />}
              title="Stima tempo gara"
              text="Formula Riegel con normalizzazione sulla frequenza cardiaca, pesata sulle sessioni recenti. Restituisce una banda onesta con livello di confidenza."
            />
            <FeatureCard
              icon={<TrendingUp size={18} />}
              title="Target che si aggiorna"
              text="Se i tuoi numeri dicono che il target è irrealistico, il coach ti propone un obiettivo più sensato. Sta a te accettare o ignorare."
            />
            <FeatureCard
              icon={<Calendar size={18} />}
              title="Saltare è normale"
              text="Hai saltato? Lo registri in due tocchi con una nota opzionale. Il coach ne tiene conto e ti dice come riprendere senza drammi."
            />
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* TECNICO / CREDIBILITÀ METODOLOGICA                         */}
      {/* ========================================================= */}
      <section className="bg-paper py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">▼ METODO</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-10">
            MATEMATICA<br />
            CONSOLIDATA.<br />
            <span className="text-stone-400">NIENTE MAGIA.</span>
          </h2>

          <div className="space-y-3">
            <MethodRow
              label="ZONE CARDIACHE"
              detail="Formula Tanaka (208 − 0,7×età) con blending sui picchi osservati. Zone Karvonen basate sulla FC di riserva, più accurate di %HRmax."
            />
            <MethodRow
              label="STIMA TEMPO GARA"
              detail="Formula di Riegel normalizzata sulla frequenza cardiaca, pesata sulle sessioni recenti. Restituiamo una banda probabile, non un numero secco."
            />
            <MethodRow
              label="CARICO E FORMA"
              detail="TRIMP (Banister-Morton) per il carico della singola sessione. CTL / ATL / TSB come modello fitness-fatigue-form, stesso framework di TrainingPeaks."
            />
            <MethodRow
              label="AI NON CALCOLA"
              detail="Tutti i numeri sono pre-calcolati in codice deterministico. L'AI riceve i valori e li commenta: non inventa passi, FC, né stime."
            />
          </div>

          <div className="mt-8 bg-stone-100 rounded-2xl p-5 flex gap-3">
            <Info size={18} className="text-stone-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-stone-600 leading-relaxed">
              Riferimenti: Tanaka (2001), Karvonen (1957), Banister-Morton (1990), Riegel (1981). Sono formule standard della letteratura amatoriale, non algoritmi proprietari. Il loro limite è noto: funzionano per la popolazione media, non sostituiscono una valutazione individuale.
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* PRIVACY / DISCLAIMER AMPIO                                 */}
      {/* ========================================================= */}
      <section className="bg-stone-100 py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-6">
          <div className="mono-font text-xs tracking-widest text-stone-500 mb-4">▼ COSA PACE NON È</div>
          <h2 className="display-font text-4xl md:text-6xl leading-[0.9] mb-10">
            TI PARLIAMO<br />
            CHIARO<br />
            <span className="text-signal-600">SUBITO.</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            <DisclaimerCard
              icon={<Heart size={18} />}
              title="Non è un dispositivo medico"
              text="Non diagnostica, non cura, non previene. Se avverti dolore al petto, vertigini, battito irregolare o sintomi insoliti: fermati e consulta un medico. Il pronto soccorso viene prima di qualsiasi app."
            />
            <DisclaimerCard
              icon={<Target size={18} />}
              title="Non è un allenatore certificato"
              text="I piani sono costruiti su riferimenti generici della letteratura della corsa amatoriale. Per preparazioni agonistiche serie o recupero da infortuni, un professionista in carne e ossa resta insostituibile."
            />
            <DisclaimerCard
              icon={<Shield size={18} />}
              title="I tuoi dati restano tuoi"
              text="Il profilo e gli allenamenti sono salvati nel tuo account su backend cifrato. Non vendiamo dati a terzi, non li usiamo per pubblicità. Puoi cancellare tutto con un click dalle impostazioni."
            />
            <DisclaimerCard
              icon={<ShieldAlert size={18} />}
              title="Prima di iniziare, un check"
              text="Se hai più di 35 anni, familiarità cardiovascolare, o non corri da tempo, una visita di idoneità sportiva è sempre una buona idea. Non è burocrazia: è la base per correre sereno."
            />
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* CTA FINALE                                                 */}
      {/* ========================================================= */}
      <section className="bg-ink text-paper py-20 md:py-28 grain">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="mono-font text-xs tracking-widest text-signal mb-6">
            ▲ PRONTO?
          </div>
          <h2 className="display-font text-5xl md:text-7xl leading-[0.9] mb-6">
            PROVALO.<br />
            <span className="text-signal">È GRATIS.</span>
          </h2>
          <p className="text-stone-300 text-lg md:text-xl leading-relaxed mb-10 max-w-xl mx-auto">
            Bastano un'email e 90 secondi per creare il tuo diario. Nessuna carta di credito, nessuna prova a tempo. Se non ti serve, cancelli tutto in un click.
          </p>
          <button
            onClick={goToApp}
            className="bg-signal text-ink py-5 px-10 rounded-full font-bold tracking-wide text-lg flex items-center gap-2 mx-auto hover:bg-signal-soft transition-all active:scale-[0.98] shadow-lg shadow-signal/30"
          >
            CREA IL TUO DIARIO <ArrowRight size={20} />
          </button>
          <div className="mt-6 text-xs text-stone-500 mono-font">
            / PER RUNNER AMATORIALI IN BUONA SALUTE /
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* FOOTER                                                     */}
      {/* ========================================================= */}
      <footer className="bg-paper py-10 border-t border-stone-200">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="display-font text-xl tracking-wider mb-1">PACE</div>
            <div className="mono-font text-[10px] tracking-widest text-stone-500">
              DIARIO DI CORSA PER RUNNER AMATORIALI
            </div>
          </div>
          <div className="flex items-center gap-6 mono-font text-xs tracking-wider text-stone-500">
            <a href="/privacy" className="hover:text-ink">PRIVACY</a>
            <a href="/terms" className="hover:text-ink">TERMINI</a>
            <a href="/contact" className="hover:text-ink">CONTATTI</a>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 mt-6 text-[11px] text-stone-400 leading-relaxed">
          PACE è un diario sportivo amatoriale. Non è un dispositivo medico ai sensi del Regolamento UE 2017/745. I suggerimenti forniti sono basati su formule statistiche generaliste e non sostituiscono il parere di un medico o di un allenatore qualificato.
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// COMPONENTI INTERNI
// ============================================================================

function StepCard({
  number,
  title,
  description,
  icon,
}: {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-paper rounded-3xl border border-stone-200 p-6 hover:border-ink transition-all">
      <div className="flex items-center justify-between mb-5">
        <div className="display-font text-5xl text-stone-200">{number}</div>
        <div className="w-10 h-10 rounded-full bg-ink text-signal flex items-center justify-center">
          {icon}
        </div>
      </div>
      <div className="display-font text-2xl leading-tight mb-3">{title}</div>
      <div className="text-sm text-stone-600 leading-relaxed">{description}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper rounded-xl p-2.5 border border-stone-200">
      <div className="mono-font text-[9px] tracking-wider text-stone-500 mb-0.5">{label}</div>
      <div className="mono-font text-sm font-bold text-ink truncate">{value}</div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="bg-stone-800/50 border border-stone-700 rounded-3xl p-5">
      <div className="flex items-center gap-2 mb-3 text-signal">
        {icon}
        <div className="mono-font text-[10px] tracking-widest text-stone-400">FEATURE</div>
      </div>
      <div className="display-font text-2xl leading-tight mb-2">{title}</div>
      <div className="text-sm text-stone-400 leading-relaxed">{text}</div>
    </div>
  );
}

function MethodRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="bg-stone-50 rounded-2xl border border-stone-200 p-5 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-6">
      <div className="mono-font text-xs tracking-widest text-ink font-bold sm:w-48 flex-shrink-0">
        {label}
      </div>
      <div className="text-sm text-stone-700 leading-relaxed flex-1">{detail}</div>
    </div>
  );
}

function DisclaimerCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="bg-paper rounded-3xl border border-stone-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-stone-100 text-ink flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="display-font text-xl leading-tight">{title}</div>
      </div>
      <div className="text-sm text-stone-600 leading-relaxed">{text}</div>
    </div>
  );
}
