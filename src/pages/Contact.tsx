import { Link } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-stone-600 mb-8 hover:text-stone-900">
          <ArrowLeft size={16} /> Torna alla home
        </Link>

        <h1 className="display-font text-5xl leading-tight mb-2">CONTATTI</h1>
        <p className="mono-font text-xs tracking-widest text-stone-500 mb-8">
          ESERCIZIO DEI DIRITTI GDPR
        </p>

        <div className="space-y-8 text-stone-800 leading-relaxed text-sm">
          <section>
            <h2 className="display-font text-2xl mb-3">Titolare del trattamento</h2>
            <p>
              <strong>[NOME TITOLARE TODO]</strong>
              <br />
              Sede: <strong>[PAESE TODO]</strong>
            </p>
          </section>

          <section>
            <h2 className="display-font text-2xl mb-3">Email per richieste GDPR</h2>
            <a
              href="mailto:[EMAIL CONTATTO TODO]"
              className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-3 rounded-full font-bold tracking-wide"
            >
              <Mail size={16} /> [EMAIL CONTATTO TODO]
            </a>
            <p className="mt-4">
              Scrivici a questo indirizzo per esercitare uno qualsiasi dei diritti previsti dagli articoli 15-22
              del GDPR (accesso, rettifica, cancellazione, portabilità, limitazione, opposizione). Risponderemo
              entro un mese dalla ricezione della richiesta.
            </p>
          </section>

          <section>
            <h2 className="display-font text-2xl mb-3">Azioni disponibili in app</h2>
            <p>Molti diritti li puoi esercitare direttamente da PACE senza scriverci:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>
                <strong>Cancellazione</strong>: Impostazioni → Cancella tutti i miei dati.
              </li>
              <li>
                <strong>Portabilità</strong>: Impostazioni → Scarica i miei dati (export JSON).
              </li>
              <li>
                <strong>Revoca consenso</strong>: equivale alla cancellazione dell'account.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="display-font text-2xl mb-3">Reclamo all'autorità di controllo</h2>
            <p>
              Se ritieni che il trattamento dei tuoi dati violi il GDPR, puoi proporre reclamo all'autorità di
              controllo competente. In Italia:{" "}
              <a
                href="https://www.garanteprivacy.it"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Garante per la protezione dei dati personali
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-stone-200 flex gap-6 text-sm">
          <Link to="/privacy" className="underline">Informativa privacy</Link>
          <Link to="/terms" className="underline">Termini d'uso</Link>
        </div>
      </div>
    </div>
  );
}
