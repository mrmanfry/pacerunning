import { ChevronRight, ShieldAlert, Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface Props {
  onAccept: (c: { c1: boolean; c2: boolean; c3: boolean; c4HealthData: boolean }) => void;
}

export function FrictionWall({ onAccept }: Props) {
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [c3, setC3] = useState(false);
  const [c4, setC4] = useState(false);
  const canProceed = c1 && c2 && c3 && c4;

  return (
    <div className="min-h-screen bg-ink text-paper grain flex flex-col">
      <div className="p-6 pt-12 flex-1">
        <div className="mono-font text-xs tracking-widest text-signal mb-6 flex items-center gap-2">
          <ShieldAlert size={14} /> LEGGI PRIMA DI CONTINUARE
        </div>
        <h1 className="display-font text-5xl leading-[0.9] mb-6">
          PACE È UN<br />
          <span className="text-signal">DIARIO</span>,<br />
          NON UN MEDICO.
        </h1>

        <div className="space-y-4 text-sm text-stone-300 leading-relaxed mb-8">
          <p>
            <span className="text-paper font-semibold">Che cos'è.</span> Un diario sportivo digitale che aiuta a leggere i dati dei tuoi allenamenti e mostra spunti generici ispirati alla letteratura della corsa amatoriale.
          </p>
          <p>
            <span className="text-paper font-semibold">Che cosa NON è.</span> PACE non è un dispositivo medico ai sensi del Regolamento UE 2017/745 (MDR), non è un personal trainer, non è un cardiologo. Non diagnostica nulla, non cura nulla, non previene nulla, non monitora condizioni cliniche, non valuta rischi sanitari. I numeri sono stime da formule pensate per la popolazione media, che potrebbero non descrivere il tuo corpo individuale.
          </p>
          <p>
            <span className="text-paper font-semibold">Cosa ti chiediamo.</span> Prima di iniziare o intensificare un programma di corsa, consulta il tuo medico — soprattutto se hai più di 35 anni, se hai familiarità cardiovascolare, se hai avuto sintomi durante sforzo (dolore al petto, vertigini, fiato corto anomalo), se sei incinta, o se hai dubbi sulla tua idoneità sportiva.
          </p>
          <p>
            <span className="text-paper font-semibold">Trasparenza AI.</span> I dati numerici dei tuoi allenamenti vengono inviati a un servizio AI europeo (Lovable AI Gateway) per generare l'analisi descrittiva. Le immagini caricate restano sui nostri server cifrati e non vengono inviate al modello AI.
          </p>
          <p className="text-stone-400 text-xs pt-2 border-t border-stone-700">
            I tuoi dati vengono salvati in modo cifrato sul tuo account PACE per permetterti di ritrovare il diario su qualsiasi dispositivo. Puoi cancellarli completamente in qualunque momento dalle impostazioni. Per i dettagli completi leggi l'{" "}
            <Link to="/privacy" className="underline text-stone-300">informativa privacy</Link> e i{" "}
            <Link to="/terms" className="underline text-stone-300">termini d'uso</Link>.
          </p>
        </div>

        <div className="space-y-3">
          <ConsentBox checked={c1} onChange={setC1} label="Ho letto e compreso che PACE è uno strumento sportivo amatoriale, non un dispositivo medico ai sensi del Reg. UE 2017/745 (MDR)." />
          <ConsentBox checked={c2} onChange={setC2} label="Dichiaro di essere in buono stato di salute generale e di non avere controindicazioni note all'attività fisica intensa." />
          <ConsentBox checked={c3} onChange={setC3} label="Acconsento al trattamento dei miei dati personali (account, profilo, allenamenti) come descritto nell'informativa privacy." />
          <ConsentBox
            checked={c4}
            onChange={setC4}
            label="Acconsento espressamente al trattamento dei miei dati relativi alla salute (frequenza cardiaca, peso, RPE, età) ai sensi dell'art. 9 GDPR, per generare analisi descrittive dei miei allenamenti."
            highlight
          />
        </div>
      </div>

      <div className="p-6 sticky bottom-0 bg-ink border-t border-stone-800">
        <button
          disabled={!canProceed}
          onClick={() => onAccept({ c1, c2, c3, c4HealthData: c4 })}
          className={`w-full py-5 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all ${
            canProceed ? "bg-signal text-ink hover:bg-signal-soft active:scale-[0.98]" : "bg-stone-700 text-stone-500 cursor-not-allowed"
          }`}
        >
          {canProceed ? "HO CAPITO, CONTINUA" : "SPUNTA TUTTE LE CASELLE"}
          {canProceed && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}

function ConsentBox({
  checked,
  onChange,
  label,
  highlight,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex gap-3 items-start ${
        checked
          ? "bg-stone-800 border-signal"
          : highlight
            ? "bg-stone-800/70 border-signal/40"
            : "bg-stone-800/50 border-stone-700"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-md flex-shrink-0 border-2 flex items-center justify-center transition-all ${
          checked ? "bg-signal border-signal" : highlight ? "border-signal/60" : "border-stone-500"
        }`}
      >
        {checked && <Check size={14} className="text-ink" strokeWidth={3} />}
      </div>
      <div className="text-sm text-stone-200 leading-relaxed">
        {highlight && <span className="mono-font text-[10px] tracking-widest text-signal block mb-1">ART. 9 GDPR — DATI SANITARI</span>}
        {label}
      </div>
    </button>
  );
}
