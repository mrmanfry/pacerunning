import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-stone-600 mb-8 hover:text-stone-900">
          <ArrowLeft size={16} /> Torna alla home
        </Link>

        <h1 className="display-font text-5xl leading-tight mb-2">TERMINI D'USO</h1>
        <p className="mono-font text-xs tracking-widest text-stone-500 mb-8">
          VERSIONE v1-2025-04-21 · ULTIMO AGGIORNAMENTO 21 APRILE 2025
        </p>

        <div className="space-y-6 text-stone-800 leading-relaxed text-sm">
          <Section title="1. Cos'è PACE">
            <p>
              PACE è un diario sportivo digitale per runner amatoriali. Permette di registrare i propri
              allenamenti di corsa e ricevere un'analisi descrittiva generata da un modello AI.
            </p>
            <p>
              PACE è erogato da <strong>[NOME TITOLARE TODO]</strong>, con sede in <strong>[PAESE TODO]</strong>.
              Per contatti: <strong>[EMAIL CONTATTO TODO]</strong>.
            </p>
          </Section>

          <Section title="2. Disclaimer medico (rinforzato)">
            <div className="border-l-4 border-stone-900 pl-4 py-2 bg-stone-100">
              <p className="font-bold mb-2">
                PACE NON È UN DISPOSITIVO MEDICO ai sensi del Regolamento UE 2017/745 (MDR).
              </p>
              <p>
                PACE non fornisce diagnosi, terapie, monitoraggio clinico, predizioni sanitarie o valutazioni
                del rischio. PACE non è un personal trainer certificato, non è un fisioterapista, non è un
                cardiologo, non è un medico dello sport. È uno strumento descrittivo per uso personale
                ricreativo.
              </p>
            </div>
            <p>
              I numeri mostrati e le analisi generate dal modello AI sono <strong>stime basate su formule
              pensate per la popolazione media</strong> e potrebbero non descrivere correttamente il tuo corpo
              individuale. Non vanno interpretate come indicazioni mediche.
            </p>
            <p>
              Prima di iniziare o intensificare un programma di corsa,{" "}
              <strong>consulta sempre il tuo medico</strong>, soprattutto se hai più di 35 anni, se hai
              familiarità per patologie cardiovascolari, se hai avuto sintomi durante sforzo (dolore al petto,
              vertigini, fiato corto anomalo), se sei incinta, o se hai dubbi sulla tua idoneità sportiva.
            </p>
            <p>
              In presenza di sintomi durante o dopo l'attività fisica, <strong>il riferimento è il tuo medico
              o il pronto soccorso, non questa app</strong>.
            </p>
          </Section>

          <Section title="3. Account e responsabilità dell'utente">
            <p>
              Per usare PACE devi creare un account. Sei responsabile della custodia delle tue credenziali e
              dell'accuratezza dei dati che inserisci. Devi avere almeno 16 anni per registrarti.
            </p>
            <p>
              Ti impegni a usare PACE in modo lecito, a non tentare di accedere a dati di altri utenti, a non
              caricare contenuti illeciti.
            </p>
          </Section>

          <Section title="4. Limitazione di responsabilità">
            <p>
              PACE è fornito "così com'è". Nei limiti consentiti dalla legge applicabile, il titolare non
              risponde di danni diretti o indiretti derivanti dall'uso o dall'impossibilità di usare il
              servizio, dall'affidamento prestato alle analisi AI generate, da problemi di salute occorsi
              durante l'attività fisica.
            </p>
            <p>
              <strong>
                L'attività fisica, e in particolare la corsa, comporta rischi per la salute. La decisione di
                allenarsi e l'intensità con cui farlo restano sotto la tua esclusiva responsabilità.
              </strong>
            </p>
          </Section>

          <Section title="5. Privacy e dati personali">
            <p>
              Il trattamento dei tuoi dati personali è regolato dalla{" "}
              <Link to="/privacy" className="underline">nostra informativa privacy</Link>, che ti invitiamo a
              leggere con attenzione. PACE tratta dati relativi alla salute (art. 9 GDPR) sulla base del tuo
              consenso esplicito, che puoi revocare in qualunque momento cancellando l'account.
            </p>
          </Section>

          <Section title="6. Proprietà intellettuale">
            <p>
              Marchio, codice e contenuti di PACE sono protetti da copyright. I dati di allenamento che inserisci
              restano di tua proprietà: puoi scaricarli in qualunque momento dalla schermata Impostazioni.
            </p>
          </Section>

          <Section title="7. Modifiche al servizio">
            <p>
              Possiamo aggiornare PACE in qualunque momento, anche modificando o rimuovendo funzionalità. Se
              modifichiamo questi termini in modo sostanziale, ti chiederemo di accettarli nuovamente al
              successivo accesso.
            </p>
          </Section>

          <Section title="8. Legge applicabile">
            <p>
              Questi termini sono regolati dalla legge dello Stato di sede del titolare (<strong>[PAESE TODO]</strong>),
              salvo le disposizioni inderogabili a tutela del consumatore previste dalla legge della tua residenza
              abituale.
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-6 border-t border-stone-200 flex gap-6 text-sm">
          <Link to="/privacy" className="underline">Informativa privacy</Link>
          <Link to="/contact" className="underline">Contatti GDPR</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display-font text-2xl mb-3 text-stone-900">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
