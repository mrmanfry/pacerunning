import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-stone-600 mb-8 hover:text-stone-900">
          <ArrowLeft size={16} /> Torna alla home
        </Link>

        <h1 className="display-font text-5xl leading-tight mb-2">INFORMATIVA PRIVACY</h1>
        <p className="mono-font text-xs tracking-widest text-stone-500 mb-8">
          VERSIONE v1-2025-04-21 · ULTIMO AGGIORNAMENTO 21 APRILE 2025
        </p>

        <div className="prose prose-stone max-w-none space-y-6 text-stone-800 leading-relaxed text-sm">
          <Section title="1. Titolare del trattamento">
            <p>
              Il titolare del trattamento dei dati personali è{" "}
              <strong>[NOME TITOLARE TODO]</strong>, con sede in <strong>[PAESE TODO]</strong>.
            </p>
            <p>
              Per qualsiasi richiesta relativa al trattamento dei tuoi dati puoi scrivere a{" "}
              <strong>[EMAIL CONTATTO TODO]</strong>.
            </p>
          </Section>

          <Section title="2. Quali dati raccogliamo">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Dati account</strong>: indirizzo email e password (cifrata con hash, mai in chiaro).</li>
              <li>
                <strong>Profilo fisico</strong>: età, sesso, peso, livello dichiarato, frequenza cardiaca a riposo
                (opzionale), distanza gara, target tempo, frequenza settimanale di allenamento.
              </li>
              <li>
                <strong>Dati di allenamento</strong>: distanza, durata, frequenza cardiaca media e massima, RPE
                (sforzo percepito), cadenza, note testuali, data della sessione.
              </li>
              <li>
                <strong>Screenshot caricati</strong>: immagini opzionali di allenamenti caricate dall'utente,
                conservate cifrate nel nostro storage.
              </li>
              <li>
                <strong>Consensi</strong>: registro delle versioni di privacy e termini accettate, con timestamp.
              </li>
              <li>
                <strong>Log tecnici delle richieste AI</strong>: per ogni analisi generata salviamo la richiesta e
                la risposta del modello AI a fini di debugging, sicurezza e miglioramento del prompt.
              </li>
            </ul>
          </Section>

          <Section title="3. Dati relativi alla salute (art. 9 GDPR)">
            <p>
              Frequenza cardiaca, peso, RPE ed età sono qualificati come <strong>dati relativi alla salute</strong>{" "}
              ai sensi dell'art. 9 del Regolamento UE 2016/679 (GDPR) e quindi appartengono alle{" "}
              <em>"categorie particolari di dati personali"</em>.
            </p>
            <p>
              <strong>Base giuridica</strong>: il trattamento di questi dati avviene esclusivamente sulla base del
              tuo <strong>consenso esplicito</strong> (art. 9, comma 2, lett. a GDPR), che ti chiediamo durante la
              registrazione tramite un consenso dedicato e separato dagli altri.
            </p>
            <p>
              Puoi revocare il consenso in qualunque momento cancellando il tuo account dalla schermata
              Impostazioni → Cancella tutti i miei dati. La revoca non pregiudica la liceità del trattamento basato
              sul consenso prestato prima della revoca.
            </p>
          </Section>

          <Section title="4. Finalità del trattamento">
            <ul className="list-disc pl-5 space-y-1">
              <li>Fornirti un diario sportivo personale dove registrare e ritrovare i tuoi allenamenti.</li>
              <li>
                Generare un'analisi descrittiva della singola sessione tramite un modello AI, esclusivamente a fini
                ricreativi e amatoriali.
              </li>
              <li>Garantire la sicurezza dell'account e prevenire abusi del servizio.</li>
            </ul>
          </Section>

          <Section title="5. Sub-processori">
            <p>Per fornirti il servizio ci avvaliamo dei seguenti sub-processori, scelti per garantire un livello di sicurezza adeguato:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Supabase</strong> (infrastruttura database, autenticazione, storage cifrato) — hosting in
                Unione Europea.
              </li>
              <li>
                <strong>Lovable AI Gateway</strong> — gateway AI europeo che inoltra i dati numerici dei tuoi
                allenamenti al modello che genera l'analisi descrittiva. Le immagini caricate non vengono inviate al
                modello AI: rimangono nel nostro storage cifrato.
              </li>
            </ul>
          </Section>

          <Section title="6. Periodo di conservazione">
            <p>
              I tuoi dati vengono conservati fintantoché il tuo account è attivo. Quando cancelli l'account dalla
              schermata Impostazioni, tutti i tuoi dati (profilo, consensi, allenamenti, analisi, screenshot)
              vengono eliminati.
            </p>
          </Section>

          <Section title="7. I tuoi diritti (artt. 15-22 GDPR)">
            <p>Hai diritto di:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Accedere ai tuoi dati personali (art. 15).</li>
              <li>Chiedere la rettifica di dati inesatti (art. 16).</li>
              <li>Chiedere la cancellazione dei tuoi dati (art. 17) — disponibile direttamente in app.</li>
              <li>Limitare il trattamento (art. 18).</li>
              <li>
                Ricevere i tuoi dati in formato strutturato e leggibile da macchina (art. 20) — disponibile
                direttamente in app dalla schermata Impostazioni → Scarica i miei dati.
              </li>
              <li>Opporti al trattamento (art. 21).</li>
              <li>
                Proporre reclamo all'autorità di controllo competente (in Italia: Garante per la protezione dei
                dati personali, www.garanteprivacy.it).
              </li>
            </ul>
          </Section>

          <Section title="8. Sicurezza dei dati">
            <p>
              I dati sono protetti con misure tecniche e organizzative adeguate: cifratura in transito (HTTPS),
              cifratura a riposo nel database e nello storage, autenticazione tramite password hashata, isolamento
              dei dati per utente tramite Row Level Security a livello di database.
            </p>
          </Section>

          <Section title="9. Trasferimenti extra-UE">
            <p>
              I dati sono ospitati su infrastruttura europea. Eventuali trasferimenti verso Paesi extra-UE avverranno
              esclusivamente nel rispetto delle Clausole Contrattuali Standard approvate dalla Commissione Europea
              o di altre garanzie adeguate previste dal Capo V del GDPR.
            </p>
          </Section>

          <Section title="10. Cookie">
            <p>
              PACE utilizza esclusivamente cookie tecnici di sessione necessari al funzionamento dell'autenticazione.
              Non utilizziamo cookie di profilazione né strumenti di analytics di terze parti.
            </p>
          </Section>

          <Section title="11. Disclaimer — non è dispositivo medico">
            <p>
              <strong>
                PACE non è un dispositivo medico ai sensi del Regolamento UE 2017/745 (MDR).
              </strong>{" "}
              Non fornisce diagnosi, terapie, monitoraggio clinico, predizioni sanitarie o valutazioni del rischio.
              È uno strumento descrittivo per uso personale ricreativo. Per qualsiasi questione medica,
              consulta il tuo medico.
            </p>
          </Section>

          <Section title="12. Modifiche all'informativa">
            <p>
              Se modificheremo questa informativa in modo sostanziale, ti chiederemo di accettare nuovamente i
              consensi al successivo accesso. La versione corrente è indicata in cima a questa pagina.
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-6 border-t border-stone-200 flex gap-6 text-sm">
          <Link to="/terms" className="underline">Termini d'uso</Link>
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
