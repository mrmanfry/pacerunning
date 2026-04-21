import { useState } from "react";
import { ChevronRight, Mail, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Email non valida" }).max(255),
  password: z.string().min(6, { message: "Almeno 6 caratteri" }).max(100),
});

const emailOnlySchema = z.object({
  email: z.string().trim().email({ message: "Email non valida" }).max(255),
});

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = authSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast({ title: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: "Account creato. Sei dentro." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Qualcosa è andato storto";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      toast({ title: "Inserisci prima la tua email qui sopra", variant: "destructive" });
      return;
    }
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "Email inviata",
        description: "Controlla la posta per il link di reset password.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore nell'invio";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-paper grain flex flex-col">
      <div className="p-6 pt-12 flex-1 flex flex-col">
        <div className="mono-font text-xs tracking-widest text-signal mb-6">▲ PACE / ACCESSO</div>
        <h1 className="display-font text-6xl leading-[0.9] mb-3">
          {mode === "signup" ? (
            <>
              CREA<br />IL TUO<br /><span className="text-signal">DIARIO</span>.
            </>
          ) : (
            <>
              BEN<br />TORNATO,<br /><span className="text-signal">RUNNER</span>.
            </>
          )}
        </h1>
        <p className="text-stone-400 text-sm mb-8">
          {mode === "signup"
            ? "Bastano un'email e una password per ritrovare i tuoi allenamenti su qualsiasi dispositivo."
            : "Accedi per continuare a leggere i tuoi dati."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 flex-1">
          <div>
            <label className="mono-font text-xs tracking-widest text-stone-400 mb-2 block">EMAIL</label>
            <div className="flex items-center gap-3 bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3">
              <Mail size={16} className="text-stone-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
                autoComplete="email"
                className="flex-1 bg-transparent outline-none text-paper placeholder:text-stone-600"
              />
            </div>
          </div>
          <div>
            <label className="mono-font text-xs tracking-widest text-stone-400 mb-2 block">PASSWORD</label>
            <div className="flex items-center gap-3 bg-stone-800 border border-stone-700 rounded-2xl px-4 py-3">
              <Lock size={16} className="text-stone-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="almeno 6 caratteri"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="flex-1 bg-transparent outline-none text-paper placeholder:text-stone-600"
              />
            </div>
            {mode === "signin" && (
              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={resetSending}
                className="mt-2 text-xs text-stone-400 underline hover:text-stone-200 disabled:opacity-50"
              >
                {resetSending ? "Invio in corso..." : "Password dimenticata?"}
              </button>
            )}
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-full font-bold tracking-wide flex items-center justify-center gap-2 transition-all bg-signal text-ink hover:bg-signal-soft active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "ATTENDI..." : mode === "signup" ? "CREA ACCOUNT" : "ACCEDI"}
              <ChevronRight size={20} />
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="w-full mt-4 py-3 text-sm text-stone-400 underline"
            >
              {mode === "signup" ? "Ho già un account, accedi" : "Non ho un account, crealo"}
            </button>
          </div>
        </form>

        <p className="text-[11px] text-stone-500 mt-4">
          Creando un account accetti che i tuoi dati di allenamento siano salvati sul backend cifrato di PACE per
          permetterti di consultarli da più dispositivi. Puoi cancellarli in qualunque momento dalle impostazioni.
          Vedi{" "}
          <Link to="/privacy" className="underline">privacy</Link> e{" "}
          <Link to="/terms" className="underline">termini</Link>.
        </p>
      </div>
    </div>
  );
}
