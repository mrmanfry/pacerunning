import { supabase } from "@/integrations/supabase/client";
import type { Plan, Profile, WorkoutLog, SessionType } from "./pace-engine";

export interface ConsentRecord {
  c1: boolean;
  c2: boolean;
  c3: boolean;
}

// ---------- Consents ----------
export async function saveConsents(userId: string, c: ConsentRecord) {
  const { error } = await supabase.from("consents").insert({
    user_id: userId,
    c1: c.c1,
    c2: c.c2,
    c3: c.c3,
  });
  if (error) throw error;
}

export async function loadLatestConsents(userId: string): Promise<ConsentRecord | null> {
  const { data, error } = await supabase
    .from("consents")
    .select("c1,c2,c3")
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { c1: data.c1, c2: data.c2, c3: data.c3 } : null;
}

// ---------- Profile ----------
export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    age: data.age,
    weight: data.weight,
    sex: data.sex as "M" | "F",
    currentBest: data.current_best,
    targetTime: data.target_time,
    weeklyFreq: data.weekly_freq,
    daysUntilRace: data.days_until_race,
    raceDate: (data as any).race_date ?? null,
    level: data.level as Profile["level"],
    raceDistance: (data as any).race_distance != null ? Number((data as any).race_distance) : 10,
    hrRest: (data as any).hr_rest != null ? Number((data as any).hr_rest) : null,
  };
}

export async function saveProfile(userId: string, p: Profile) {
  const row: any = {
    id: userId,
    age: p.age,
    weight: p.weight,
    sex: p.sex,
    current_best: p.currentBest,
    target_time: p.targetTime,
    weekly_freq: p.weeklyFreq,
    days_until_race: p.daysUntilRace,
    race_date: p.raceDate ?? null,
    level: p.level,
    race_distance: p.raceDistance ?? 10,
    hr_rest: p.hrRest ?? null,
  };
  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

// ---------- Plan ----------
export async function loadPlan(userId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("weeks,target,adjusted_estimate,estimate_low,estimate_high,estimate_confidence")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d: any = data;
  return {
    weeks: d.weeks as unknown as Plan["weeks"],
    target: d.target,
    adjustedEstimate: d.adjusted_estimate != null ? Number(d.adjusted_estimate) : null,
    estimateLow: d.estimate_low != null ? Number(d.estimate_low) : null,
    estimateHigh: d.estimate_high != null ? Number(d.estimate_high) : null,
    estimateConfidence: (d.estimate_confidence ?? null) as Plan["estimateConfidence"],
  };
}

export async function savePlan(userId: string, plan: Plan) {
  const { error } = await supabase.from("plans").upsert(
    [
      {
        user_id: userId,
        weeks: plan.weeks as unknown as never,
        target: plan.target,
        adjusted_estimate: plan.adjustedEstimate,
        estimate_low: plan.estimateLow ?? null,
        estimate_high: plan.estimateHigh ?? null,
        estimate_confidence: plan.estimateConfidence ?? null,
      } as any,
    ],
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

// ---------- Workout logs ----------
export async function loadLogs(userId: string): Promise<WorkoutLog[]> {
  const { data, error } = await supabase
    .from("workout_logs")
    .select("*")
    .eq("user_id", userId)
    .order("logged_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((d: any) => ({
    id: d.id,
    weekIdx: d.week_idx,
    sessionIdx: d.session_idx,
    sessionType: d.session_type as SessionType,
    sessionName: d.session_name,
    duration: d.duration != null ? Number(d.duration) : 0,
    distance: d.distance != null ? Number(d.distance) : 0,
    hrAvg: d.hr_avg ?? 0,
    hrMax: d.hr_max,
    rpe: d.rpe ?? 0,
    cadence: d.cadence,
    notes: d.notes ?? "",
    safetyOverridden: d.safety_overridden ?? false,
    loggedAt: d.logged_at,
    skipped: d.skipped ?? false,
    skipReason: d.skip_reason ?? null,
  }));
}

export async function insertLog(userId: string, log: WorkoutLog): Promise<{ id: string; loggedAt: string }> {
  const isSkip = !!log.skipped;
  const { data, error } = await supabase
    .from("workout_logs")
    .insert({
      user_id: userId,
      week_idx: log.weekIdx ?? null,
      session_idx: log.sessionIdx ?? null,
      session_type: log.sessionType,
      session_name: log.sessionName,
      duration: isSkip ? null : log.duration,
      distance: isSkip ? null : log.distance,
      hr_avg: isSkip ? null : log.hrAvg,
      hr_max: isSkip ? null : (log.hrMax ?? null),
      rpe: isSkip ? null : log.rpe,
      cadence: isSkip ? null : (log.cadence ?? null),
      notes: log.notes ?? null,
      safety_overridden: log.safetyOverridden ?? false,
      skipped: isSkip,
      skip_reason: log.skipReason ?? null,
    } as any)
    .select("id,logged_at")
    .single();
  if (error) throw error;
  return { id: data.id, loggedAt: data.logged_at };
}

// ---------- Storage: workout screenshots ----------
export async function uploadWorkoutScreenshot(userId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("workout-screenshots")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

// ---------- Workout analyses (AI coach output) ----------
export interface StoredAnalysis {
  id: string;
  logId: string;
  technicalReading: string | null;
  sessionHighlight: string | null;
  nextMove: string | null;
  createdAt: string;
}

export async function saveAnalysis(
  userId: string,
  logId: string,
  a: { technicalReading?: string | null; sessionHighlight?: string | null; nextMove?: string | null }
) {
  const { error } = await supabase.from("workout_analyses").insert({
    user_id: userId,
    log_id: logId,
    technical_reading: a.technicalReading ?? null,
    session_highlight: a.sessionHighlight ?? null,
    next_move: a.nextMove ?? null,
  });
  if (error) throw error;
}

export async function loadLatestAnalysis(userId: string): Promise<StoredAnalysis | null> {
  const { data, error } = await supabase
    .from("workout_analyses")
    .select("id,log_id,technical_reading,session_highlight,next_move,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    logId: data.log_id,
    technicalReading: data.technical_reading,
    sessionHighlight: data.session_highlight,
    nextMove: data.next_move,
    createdAt: data.created_at,
  };
}

export async function loadRecentAnalyses(userId: string, limit = 3): Promise<StoredAnalysis[]> {
  const { data, error } = await supabase
    .from("workout_analyses")
    .select("id,log_id,technical_reading,session_highlight,next_move,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((d) => ({
    id: d.id,
    logId: d.log_id,
    technicalReading: d.technical_reading,
    sessionHighlight: d.session_highlight,
    nextMove: d.next_move,
    createdAt: d.created_at,
  }));
}

// ---------- Reset (full delete for current user) ----------
export async function resetAllForUser(userId: string) {
  await supabase.from("workout_analyses").delete().eq("user_id", userId);
  await supabase.from("workout_logs").delete().eq("user_id", userId);
  await supabase.from("plans").delete().eq("user_id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.from("consents").delete().eq("user_id", userId);
}
