import { useState } from "react";
import { ArrowLeft, LogOut, Download, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { exportAllUserData } from "@/lib/pace-repository";
import { toast } from "@/hooks/use-toast";

interface Props {
  email?: string | null;
  userId?: string | null;
  onBack: () => void;
  onReset: () => void;
  onSignOut: () => void;
}

export function Settings({ email, userId, onBack, onReset, onSignOut }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const blob = await exportAllUserData(userId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().slice(0, 10);
      a.download = `pace-export-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Export pronto", description: "Il file JSON è stato scaricato." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nell'export";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper pb-28">
      <div className="p-6 pt-12">
        <button onClick={onBack} className="mb-6">
          <ArrowLeft size={24} className="text-stone-700" />
        </button>
        <h2 className="display-font text-5xl leading-tight mb-6">IMPOSTAZIONI</h2>

        <div className="space-y-4">
          {email && (
            <div className="bg-card rounded-3xl p-5 border border-border">
              <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">ACCOUNT</div>
              <p className="text-sm text-stone-700 mb-3">{email}</p>
              <button
                onClick={onSignOut}
                className="text-sm font-semibold text-stone-700 underline flex items-center gap-2"
              >
                <LogOut size={14} /> Esci
              </button>
            </div>
          )}

          <div className="bg-card rounded-3xl p-5 border border-border">
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">I TUOI DATI</div>
            <p className="text-sm text-stone-700 leading-relaxed mb-4">
              Il tuo profilo, i tuoi allenamenti e i tuoi consensi sono salvati nel tuo account PACE in modo cifrato. Solo tu puoi accedervi grazie al login. Puoi cancellare tutto in qualunque momento.
            </p>
            <button
              onClick={handleExport}
              disabled={!userId || exporting}
              className="w-full bg-ink text-paper py-3 rounded-full font-bold tracking-wide hover:opacity-90 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Download size={14} /> {exporting ? "PREPARO..." : "SCARICA I MIEI DATI (JSON)"}
            </button>
            <p className="text-[11px] text-stone-500 mt-2 leading-snug">
              Diritto di portabilità — art. 20 GDPR. Esporti profilo, consensi, allenamenti e analisi in formato JSON.
            </p>
          </div>

          <div className="bg-card rounded-3xl p-5 border border-border">
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">DOCUMENTI LEGALI</div>
            <div className="flex flex-col gap-2">
              <Link to="/privacy" className="text-sm text-stone-700 underline flex items-center gap-2">
                <FileText size={14} /> Informativa privacy
              </Link>
              <Link to="/terms" className="text-sm text-stone-700 underline flex items-center gap-2">
                <FileText size={14} /> Termini d'uso
              </Link>
              <Link to="/contact" className="text-sm text-stone-700 underline flex items-center gap-2">
                <FileText size={14} /> Contatti per richieste GDPR
              </Link>
            </div>
          </div>

          <div className="bg-card rounded-3xl p-5 border border-border">
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">COSA PACE NON È</div>
            <ul className="text-sm text-stone-700 leading-relaxed space-y-1.5">
              <li>• Un dispositivo medico (Reg. UE 2017/745 — MDR)</li>
              <li>• Un personal trainer certificato</li>
              <li>• Un sostituto del tuo medico o cardiologo</li>
              <li>• Un sistema diagnostico o di monitoraggio clinico</li>
            </ul>
          </div>

          <div className="bg-card rounded-3xl p-5 border border-border">
            <div className="mono-font text-xs tracking-widest text-stone-500 mb-2">SUPPORTO</div>
            <p className="text-sm text-stone-700 leading-relaxed">
              Per qualsiasi problema di salute durante la corsa, il riferimento è sempre il tuo medico di base o il
              pronto soccorso, non questa app.
            </p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-3xl p-5">
            <div className="mono-font text-xs tracking-widest text-red-700 mb-2">ZONA PERICOLOSA</div>
            <p className="text-sm text-red-900 leading-relaxed mb-4">
              Puoi cancellare in modo definitivo tutti i dati del tuo profilo PACE (allenamenti, profilo, consensi).
              Questa azione non può essere annullata.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full bg-card text-red-700 py-3 rounded-full font-bold tracking-wide border-2 border-red-300 hover:bg-red-100 transition-all text-sm"
              >
                CANCELLA TUTTI I MIEI DATI
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-red-800 font-bold mb-2">Sicuro? Tutto verrà eliminato.</p>
                <button
                  onClick={onReset}
                  className="w-full bg-red-600 text-white py-3 rounded-full font-bold tracking-wide hover:bg-red-700 transition-all text-sm"
                >
                  SÌ, CANCELLA TUTTO
                </button>
                <button onClick={() => setConfirmDelete(false)} className="w-full py-2 text-red-700 text-sm underline">
                  Annulla
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
