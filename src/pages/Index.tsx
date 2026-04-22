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
  checkDataPlausibility,
  checkSafetyFlags,
  computeEstimateDetail,
  computeMetrics,
  findNextSession,
  generatePlan,
  getLastCompletedLog,
  type Analysis,
  type Plan,
  type Profile,
  type SafetyResult,
  type Session,
  type WorkoutLog,
} from "@/lib/pace-engine";
import { computeLoadState, buildAIPromptLoadBlock, type LoadState } from "@/lib/load-model";
import {
  insertLog,
  loadLatestAnalysis,
  loadLatestConsents,
  loadLogs,
  loadPlan,
  loadProfile,
  loadRecentAnalyses,
  resetAllForUser,
  saveAnalysis,
  saveConsents,
  saveExtraction,
  savePlan,
  saveProfile,
  type StoredAnalysis,
} from "@/lib/pace-repository";
import { CURRENT_CONSENT_VERSION, CURRENT_TERMS_VERSION } from "@/lib/legal-versions";

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

// Uniformly downsample a series to at most `target` points by taking
// evenly-spaced indices. Keeps first + last for shape preservation.
function downsamplePoints<T>(points: T[], target: number): T[] {
  if (!Array.isArray(points) || points.length <= target) return points ?? [];
  const out: T[] = [];
  const step = (points.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

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
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [safetyBlock, setSafetyBlock] = useState<(SafetyResult & { pendingLog: WorkoutLog }) | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<StoredAnalysis | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<StoredAnalysis[]>([]);
  const [loadState, setLoadState] = useState<LoadState | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setScreen("auth");
      return;
    }
    (async () => {
      try {
        const [c, p, pl, lg, la, ra] = await Promise.all([
          loadLatestConsents(user.id),
          loadProfile(user.id),
          loadPlan(user.id),
          loadLogs(user.id),
          loadLatestAnalysis(user.id),
          loadRecentAnalyses(user.id, 3),
        ]);
        const okConsents = !!(
          c &&
          c.c1 &&
          c.c2 &&
          c.c3 &&
          c.c4HealthData &&
          c.consentVersion === CURRENT_CONSENT_VERSION &&
          c.termsVersion === CURRENT_TERMS_VERSION
        );
        setConsentsAccepted(okConsents);
        if (p) setProfile(p);
        if (pl) setPlan(pl);
        setLogs(lg);
        setLastAnalysis(la);
        setRecentAnalyses(ra);
        if (p) {
          setLoadState(
            computeLoadState(
              lg.map((l) => ({
                loggedAt: l.loggedAt ?? null,
                duration: l.duration,
                hrAvg: l.hrAvg,
                hrMax: l.hrMax ?? null,
                rpe: l.rpe,
                sessionType: l.sessionType,
                skipped: l.skipped,
              })),
              { age: p.age, sex: p.sex, hrRest: p.hrRest ?? null },
            ),
          );
        }

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

  const acceptConsents = async (c: { c1: boolean; c2: boolean; c3: boolean; c4HealthData: boolean }) => {
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

  const saveLog = async (
    log: WorkoutLog,
    visualPatterns?: import("@/components/pace/LogWorkout").VisualPatterns | null,
    extraction?: import("@/components/pace/LogWorkout").ExtractionMeta | null,
  ) => {
    if (!user || !profile || !plan) return;
    const safety = checkSafetyFlags(log, profile, logs);
    if (safety.block) {
      setSafetyBlock({ ...safety, pendingLog: log });
      setScreen("safetyAlert");
      return;
    }
    await persistLog(log, visualPatterns ?? null, extraction ?? null);
  };

  const persistLog = async (
    log: WorkoutLog,
    visualPatterns?: import("@/components/pace/LogWorkout").VisualPatterns | null,
    extraction?: import("@/components/pace/LogWorkout").ExtractionMeta | null,
  ) => {
    if (!user || !profile || !plan) return;
    try {
      const inserted = await insertLog(user.id, log);
      const fullLog: WorkoutLog = { ...log, id: inserted.id, loggedAt: inserted.loggedAt };
      const newLogs = [...logs, fullLog];
      setLogs(newLogs);

      // Persist deep extraction (if any) linked to this freshly created log
      const extractedWorkout = extraction?.extractedWorkout ?? null;
      if (extraction && extractedWorkout) {
        try {
          await saveExtraction(user.id, fullLog.id ?? null, extractedWorkout, {
            sourceImagePaths: extraction.sourceImagePaths,
            promptVersion: extraction.promptVersion,
            model: extraction.model,
          });
        } catch (extErr) {
          console.error("saveExtraction error:", extErr);
        }
      }

      // Recompute load state with the new log included
      const loadInputs = newLogs.map((l) => ({
        loggedAt: l.loggedAt ?? null,
        duration: l.duration,
        hrAvg: l.hrAvg,
        hrMax: l.hrMax ?? null,
        rpe: l.rpe,
        sessionType: l.sessionType,
        skipped: l.skipped,
      }));
      const profileForLoad = { age: profile.age, sex: profile.sex, hrRest: profile.hrRest ?? null };
      const newLoadState = computeLoadState(loadInputs, profileForLoad);
      setLoadState(newLoadState);

      // Compute new estimate detail (Riegel + HR + weighted)
      const estimateDetail = computeEstimateDetail(newLogs, profile);
      let updatedPlan = plan;
      if (newLogs.length >= 1) {
        updatedPlan = {
          ...plan,
          adjustedEstimate: estimateDetail.method === "riegel-hr" ? estimateDetail.estimate : null,
          estimateLow: estimateDetail.method === "riegel-hr" ? estimateDetail.low : null,
          estimateHigh: estimateDetail.method === "riegel-hr" ? estimateDetail.high : null,
          estimateConfidence: estimateDetail.confidence,
        };
        setPlan(updatedPlan);
        await savePlan(user.id, updatedPlan);
      }

      // Show loading screen and start AI analysis
      setAnalysis(null);
      setAnalysisLoading(true);
      setScreen("analysis");

      // Compute deterministic metrics first (Cap. 3.2 — sandwich layer 1)
      const baseAnalysis = analyzeWorkout(fullLog, profile, updatedPlan, newLogs);
      const computed = computeMetrics(fullLog, profile, newLogs);
      const loadBlock = buildAIPromptLoadBlock(newLoadState);

      // Override prediction with the new weighted estimate (Riegel + HR, banded)
      const predictionText =
        estimateDetail.method === "target-fallback"
          ? `Servono altre ${Math.max(0, 3 - estimateDetail.usableSessions)} sessioni di qualità per una stima affidabile dai tuoi numeri.`
          : `Stima dai tuoi log (${estimateDetail.usableSessions} sessioni utili). Target dichiarato: ${profile.targetTime}'. ${
              estimateDetail.estimate < profile.targetTime - 1
                ? "I dati suggeriscono margine."
                : estimateDetail.estimate <= profile.targetTime + 1
                ? "I dati sono in linea col target."
                : "I dati suggeriscono che il target era ambizioso."
            }`;
      baseAnalysis.prediction = {
        time: `${estimateDetail.estimate}'`,
        low: `${estimateDetail.low}'`,
        high: `${estimateDetail.high}'`,
        confidence: estimateDetail.confidence,
        text: predictionText,
      };

      // Recent same-type logs for context (last 3) — exclude skipped
      const recentSameType = newLogs
        .filter((l) => !l.skipped && l.sessionType === fullLog.sessionType && l.id !== fullLog.id)
        .slice(-3)
        .map((l) => {
          const c = computeMetrics(l, profile, newLogs);
          return {
            distance: l.distance,
            duration: l.duration,
            hrAvg: l.hrAvg,
            hrPctMax: c.hrPctMax,
            rpe: l.rpe,
          };
        });

      const allLogsSummary = {
        totalSessions: newLogs.length,
        projectedTime: estimateDetail.estimate,
        projectedLow: estimateDetail.low,
        projectedHigh: estimateDetail.high,
        confidence: estimateDetail.confidence,
        usableSessions: estimateDetail.usableSessions,
        method: estimateDetail.method,
        deltaFromTarget:
          Math.round((estimateDetail.estimate - profile.targetTime) * 10) / 10,
      };

      // Pass the next planned session so the coach can ANCHOR advice on it,
      // not invent a new workout.
      const next = findNextSession(updatedPlan, newLogs);
      const nextPlanned = next
        ? {
            weekIdx: next.weekIdx,
            sessionIdx: next.sessionIdx,
            name: next.data.name,
            type: next.data.type,
            duration: next.data.duration,
            targetHR: next.data.targetHR ?? null,
            blocks: next.data.blocks,
          }
        : null;

      // The CURRENT planned session — the one we just executed. The coach reads
      // segments and kmSplits AGAINST these blocks (warmup, intervals, recovery, cooldown)
      // so it can comment lap-by-lap instead of averaging everything to "easy".
      const currentPlanned =
        log.weekIdx != null &&
        log.sessionIdx != null &&
        updatedPlan.weeks[log.weekIdx]?.sessions[log.sessionIdx]
          ? (() => {
              const s = updatedPlan.weeks[log.weekIdx!].sessions[log.sessionIdx!];
              return {
                name: s.name,
                type: s.type,
                duration: s.duration,
                targetHR: s.targetHR ?? null,
                blocks: s.blocks,
              };
            })()
          : null;

      const plausibility = checkDataPlausibility(fullLog);

      // Compress payload before sending: keep the curve but small. The full
      // hrSeries lives in workout_extractions for the UI; the coach only needs
      // a coarse trend. paceSeries is dropped entirely (segments + kmSplits
      // already give plenty of pace info).
      const compactExtractedWorkout = extractedWorkout
        ? {
            ...extractedWorkout,
            hrSeries: extractedWorkout.hrSeries
              ? {
                  samplingHintSec: extractedWorkout.hrSeries.samplingHintSec,
                  points: downsamplePoints(extractedWorkout.hrSeries.points, 12),
                }
              : null,
            paceSeries: null,
          }
        : null;

      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke("analyze-workout", {
          body: {
            computed,
            log: fullLog,
            profile,
            recentSameType,
            allLogsSummary,
            nextPlanned,
            currentPlanned,
            plausibility,
            loadBlock,
            visualPatterns: visualPatterns ?? null,
            extractedWorkout: compactExtractedWorkout,
          },
        });

        if (aiError) {
          const status = (aiError as any).context?.status;
          if (status === 429) toast({ title: "Limite richieste AI", description: "Mostro analisi base.", variant: "destructive" });
          else if (status === 402) toast({ title: "Crediti AI esauriti", description: "Mostro analisi base.", variant: "destructive" });
          else toast({ title: "Analisi AI non disponibile", description: "Mostro analisi base.", variant: "destructive" });
          setAnalysis(baseAnalysis);
        } else if (aiData?.analysis) {
          const ai = aiData.analysis;
          const promptVersion: string | null = aiData?.promptVersion ?? null;
          const segmentReadings = Array.isArray(ai.segmentReadings) ? ai.segmentReadings : [];
          setAnalysis({
            ...baseAnalysis,
            technicalReading: ai.technicalReading,
            sessionHighlight: ai.sessionHighlight,
            aiNextMove: ai.nextMove,
            planAdjustment: ai.planAdjustment,
            segmentReadings,
            extractedWorkout: extractedWorkout ?? null,
            source: "ai",
          });
          // Persist coach analysis tied to this log (incl. segmentReadings)
          try {
            await saveAnalysis(user.id, fullLog.id!, {
              technicalReading: ai.technicalReading ?? null,
              sessionHighlight: ai.sessionHighlight ?? null,
              nextMove: ai.nextMove ?? null,
              segmentReadings: segmentReadings.length > 0 ? segmentReadings : null,
              promptVersion,
            });
            const fresh: StoredAnalysis = {
              id: `local-${Date.now()}`,
              logId: fullLog.id!,
              technicalReading: ai.technicalReading ?? null,
              sessionHighlight: ai.sessionHighlight ?? null,
              nextMove: ai.nextMove ?? null,
              segmentReadings: segmentReadings.length > 0 ? segmentReadings : null,
              createdAt: new Date().toISOString(),
            };
            setLastAnalysis(fresh);
            setRecentAnalyses((prev) => [fresh, ...prev].slice(0, 3));
          } catch (saveErr) {
            console.error("saveAnalysis error:", saveErr);
          }
        } else {
          setAnalysis({ ...baseAnalysis, extractedWorkout: extractedWorkout ?? null });
        }
      } catch (err) {
        console.error("AI analysis error:", err);
        const msg = err instanceof Error ? err.message : "Errore di rete";
        toast({ title: "Analisi AI fallita", description: msg, variant: "destructive" });
        setAnalysis({ ...baseAnalysis, extractedWorkout: extractedWorkout ?? null });
      } finally {
        setAnalysisLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast({ title: msg, variant: "destructive" });
      setAnalysisLoading(false);
    }
  };

  const acceptAdjustment = async () => {
    if (!user || !profile || !plan || !analysis?.planAdjustment?.newTargetEstimate) return;
    const newTarget = Math.round(analysis.planAdjustment.newTargetEstimate);
    try {
      const updatedProfile: Profile = { ...profile, targetTime: newTarget };
      const updatedPlan: Plan = { ...plan, target: newTarget, adjustedEstimate: newTarget };
      await Promise.all([saveProfile(user.id, updatedProfile), savePlan(user.id, updatedPlan)]);
      setProfile(updatedProfile);
      setPlan(updatedPlan);
      setAnalysis({ ...analysis, planAdjustment: { ...analysis.planAdjustment, shouldAdjust: false } });
      toast({ title: "Target aggiornato", description: `Nuovo obiettivo: ${newTarget}'` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore nel salvataggio";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const ignoreAdjustment = () => {
    if (!analysis?.planAdjustment) return;
    setAnalysis({ ...analysis, planAdjustment: { ...analysis.planAdjustment, shouldAdjust: false } });
  };

  const skipSession = async (reason: string) => {
    if (!user || !selectedSession || !profile || !plan) return;
    try {
      const skipLog: WorkoutLog = {
        weekIdx: selectedSession.weekIdx,
        sessionIdx: selectedSession.sessionIdx,
        sessionType: selectedSession.data.type,
        sessionName: selectedSession.data.name,
        duration: 0,
        distance: 0,
        hrAvg: 0,
        rpe: 0,
        skipped: true,
        skipReason: reason || null,
      };
      const inserted = await insertLog(user.id, skipLog);
      const fullLog: WorkoutLog = { ...skipLog, id: inserted.id, loggedAt: inserted.loggedAt };
      setLogs((prev) => [...prev, fullLog]);
      toast({
        title: "Allenamento segnato come saltato",
        description: "Il prossimo spunto del diario è disponibile in Dashboard.",
      });
      setScreen("dashboard");
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
      setLastAnalysis(null);
      setRecentAnalyses([]);
      setLoadState(null);
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
    setLastAnalysis(null);
    setRecentAnalyses([]);
    setLoadState(null);
    setConsentsAccepted(false);
    setScreen("auth");
  };

  // Helper: find a logged workout for a given (weekIdx, sessionIdx)
  const findLogFor = (weekIdx: number, sessionIdx: number): WorkoutLog | undefined =>
    logs.find((l) => l.weekIdx === weekIdx && l.sessionIdx === sessionIdx);

  const lastLog = getLastCompletedLog(logs);
  const selectedLoggedData = selectedSession
    ? findLogFor(selectedSession.weekIdx, selectedSession.sessionIdx)
    : undefined;

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
            lastLog={lastLog}
            lastAnalysis={lastAnalysis}
            loadState={loadState}
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

        {screen === "session" && selectedSession && profile && (() => {
          const suggested = plan ? findNextSession(plan, logs) : null;
          const isSuggested =
            !!suggested &&
            suggested.weekIdx === selectedSession.weekIdx &&
            suggested.sessionIdx === selectedSession.sessionIdx;
          return (
            <SessionDetail
              session={selectedSession}
              profile={profile}
              loggedData={selectedLoggedData}
              recentAnalyses={recentAnalyses}
              suggestedSessionName={!isSuggested && suggested ? suggested.data.name : null}
              onBack={() => setScreen("dashboard")}
              onLog={() => setScreen("logWorkout")}
              onSkip={skipSession}
            />
          );
        })()}

        {screen === "logWorkout" && (
          <LogWorkout
            session={selectedSession}
            userId={user?.id ?? null}
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
          <AnalysisScreen
            analysis={analysis}
            loading={analysisLoading}
            raceDistance={profile?.raceDistance}
            onContinue={() => setScreen("dashboard")}
            onAcceptAdjustment={acceptAdjustment}
            onIgnoreAdjustment={ignoreAdjustment}
          />
        )}

        {screen === "settings" && (
          <Settings
            email={user?.email ?? null}
            userId={user?.id ?? null}
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
