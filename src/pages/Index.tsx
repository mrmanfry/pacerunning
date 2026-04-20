import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/pace/LoadingScreen";
import { FrictionWall } from "@/components/pace/FrictionWall";
import { Onboarding } from "@/components/pace/Onboarding";
import { AuthScreen } from "@/components/pace/AuthScreen";
import { Dashboard } from "@/components/pace/Dashboard";
import { SessionDetail } from "@/components/pace/SessionDetail";
import { LogWorkout } from "@/components/pace/LogWorkout";
import { SafetyAlert } from "@/components/pace/SafetyAlert";
import { AnalysisScreen } from "@/components/pace/AnalysisScreen";
import { Settings } from "@/components/pace/Settings";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  analyzeWorkout,
  checkSafetyFlags,
  computeAdjustedEstimate,
  generatePlan,
  type Analysis,
  type Plan,
  type Profile,
  type SafetyResult,
  type Session,
  type WorkoutLog,
} from "@/lib/pace-engine";
import {
  insertLog,
  loadLatestConsents,
  loadLogs,
  loadPlan,
  loadProfile,
  resetAllForUser,
  saveConsents,
  savePlan,
  saveProfile,
} from "@/lib/pace-repository";

type Screen =
  | "loading"
  | "auth"
  | "frictionWall"
  | "onboarding"
  | "dashboard"
  | "session"
  | "logWorkout"
  | "safetyAlert"
  | "analysis"
  | "settings";

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const [screen, setScreen] = useState<Screen>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [consentsAccepted, setConsentsAccepted] = useState(false);
  const [selectedSession, setSelectedSession] = useState<{
    data: Session;
    weekIdx: number;
    sessionIdx: number;
  } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [safetyBlock, setSafetyBlock] = useState<(SafetyResult & { pendingLog: WorkoutLog }) | null>(null);

  // Boot: route based on auth + remote state
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setScreen("auth");
      return;
    }
    (async () => {
      try {
        const [c, p, pl, lg] = await Promise.all([
          loadLatestConsents(user.id),
          loadProfile(user.id),
          loadPlan(user.id),
          loadLogs(user.id),
        ]);
        const okConsents = !!(c && c.c1 && c.c2 && c.c3);
        setConsentsAccepted(okConsents);
        if (p) setProfile(p);
        if (pl) setPlan(pl);
        setLogs(lg);

        if (!okConsents) setScreen("frictionWall");
        else if (!p || !pl) setScreen("onboarding");
        else setScreen("dashboard");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore di caricamento";
        toast({ title: msg, variant: "destructive" });
        setScreen("auth");
      }
    })();
  }, [authLoading, user]);

  const acceptConsents = async (c: { c1: boolean; c2: boolean; c3: boolean }) => {
    if (!user) return;
    try {
      await saveConsents(user.id, c);
      setConsentsAccepted(true);
      setScreen(profile && plan ? "dashboard" : "onboarding");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const completeOnboarding = async (p: Profile) => {
    if (!user) return;
    try {
      const generated = generatePlan(p);
      await Promise.all([saveProfile(user.id, p), savePlan(user.id, generated)]);
      setProfile(p);
      setPlan(generated);
      setScreen("dashboard");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const saveLog = async (log: WorkoutLog) => {
    if (!user || !profile || !plan) return;
    const safety = checkSafetyFlags(log, profile, logs);
    if (safety.block) {
      setSafetyBlock({ ...safety, pendingLog: log });
      setScreen("safetyAlert");
      return;
    }
    await persistLog(log);
  };

  const persistLog = async (log: WorkoutLog) => {
    if (!user || !profile || !plan) return;
    try {
      await insertLog(user.id, log);
      const newLogs = [...logs, log];
      setLogs(newLogs);

      const newAnalysis = analyzeWorkout(log, profile, plan, newLogs);
      setAnalysis(newAnalysis);

      if (newLogs.length >= 2) {
        const updated: Plan = {
          ...plan,
          adjustedEstimate: computeAdjustedEstimate(newLogs, profile),
        };
        setPlan(updated);
        await savePlan(user.id, updated);
      }
      setScreen("analysis");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const resetAll = async () => {
    if (!user) return;
    try {
      await resetAllForUser(user.id);
      setProfile(null);
      setPlan(null);
      setLogs([]);
      setConsentsAccepted(false);
      setScreen("frictionWall");
      toast({ title: "Tutti i tuoi dati sono stati cancellati." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nella cancellazione";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setPlan(null);
    setLogs([]);
    setConsentsAccepted(false);
    setScreen("auth");
  };

  // ---------- Render ----------
  if (authLoading || screen === "loading") return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-paper">
      <div className="max-w-md mx-auto min-h-screen bg-paper relative overflow-hidden">
        {screen === "auth" && <AuthScreen />}

        {screen === "frictionWall" && <FrictionWall onAccept={acceptConsents} />}

        {screen === "onboarding" && consentsAccepted && (
          <Onboarding onComplete={completeOnboarding} />
        )}

        {screen === "dashboard" && profile && plan && (
          <Dashboard
            profile={profile}
            plan={plan}
            logs={logs}
            onOpenSession={(s) => {
              setSelectedSession(s);
              setScreen("session");
            }}
            onLogFreeform={() => {
              setSelectedSession(null);
              setScreen("logWorkout");
            }}
            onOpenSettings={() => setScreen("settings")}
          />
        )}

        {screen === "session" && selectedSession && profile && (
          <SessionDetail
            session={selectedSession}
            profile={profile}
            onBack={() => setScreen("dashboard")}
            onLog={() => setScreen("logWorkout")}
          />
        )}

        {screen === "logWorkout" && (
          <LogWorkout
            session={selectedSession}
            onBack={() => setScreen(selectedSession ? "session" : "dashboard")}
            onSave={saveLog}
          />
        )}

        {screen === "safetyAlert" && safetyBlock && (
          <SafetyAlert
            safety={safetyBlock}
            onDismiss={() => {
              setSafetyBlock(null);
              setScreen("dashboard");
            }}
            onContinueAnyway={async () => {
              const log = { ...safetyBlock.pendingLog, safetyOverridden: true };
              setSafetyBlock(null);
              await persistLog(log);
            }}
          />
        )}

        {screen === "analysis" && (
          <AnalysisScreen analysis={analysis} onContinue={() => setScreen("dashboard")} />
        )}

        {screen === "settings" && (
          <Settings
            email={user?.email ?? null}
            onBack={() => setScreen("dashboard")}
            onReset={resetAll}
            onSignOut={signOut}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
