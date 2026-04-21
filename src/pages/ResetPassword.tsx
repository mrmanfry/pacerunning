import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Lock } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const passwordSchema = z.object({
  password: z.string().min(6, { message: "Almeno 6 caratteri" }).max(100),
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Quando l'utente arriva da link recovery, Supabase emette PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Verifica anche se c'è già una sessione valida
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ password });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (error) throw error;
      toast({ title: "Password aggiornata. Sei dentro." });
      navigate("/app");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore nell'aggiornamento";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-paper grain flex flex-col">
      <div className="max-w-md mx-auto w-full p-6 pt-12 flex-1 flex flex-col">
        <div className="mono-font text-xs tracking-widest text-signal mb-6">▲ PACE / RESET PASSWORD</div>
        <h1 className="display-font text-5xl leading-[0.9] mb-3">
          IMPOSTA<br />UNA NUOVA<br /><span className="text-signal">PASSWORD</span>.
        </h1>
        <p className="text-stone-400 text-sm mb-8">
          {ready
            ? "Scegli una nuova password di almeno 6 caratteri. Dopo il salvataggio sarai dentro al tuo diario."
            : "Sto verificando il link di recupero. Se sei arrivato qui da un link via email, attendi un istante."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mono-font text-xs tracking-widest text-stone-400 mb-2 block">NUOVA PASSWORD</label>
            <div className="flex items-center gap-3 bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3">
              <Lock size={16} className="text-stone-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="almeno 6 caratteri"
                autoComplete="new-password"
                disabled={!ready}
                className="flex-1 bg-transparent outline-none text-paper placeholder:text-stone-600 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !ready}
              className="w-full py-5 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all bg-signal text-ink hover:bg-signal-soft active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "ATTENDI..." : "SALVA NUOVA PASSWORD"}
              <ChevronRight size={20} />
            </button>
            <button
              type="button"
              onClick={() => navigate("/app")}
              className="w-full mt-4 py-3 text-sm text-stone-400 underline"
            >
              Annulla, torna al login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
