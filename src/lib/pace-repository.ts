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
  };
  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}

// ---------- Plan ----------
export async function loadPlan(userId: string): Promise<Plan | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("weeks,target,adjusted_estimate")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    weeks: data.weeks as unknown as Plan["weeks"],
    target: data.target,
    adjustedEstimate: data.adjusted_estimate ? Number(data.adjusted_estimate) : null,
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
      },
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
  return (data || []).map((d) => ({
    id: d.id,
    weekIdx: d.week_idx,
    sessionIdx: d.session_idx,
    sessionType: d.session_type as SessionType,
    sessionName: d.session_name,
    duration: Number(d.duration),
    distance: Number(d.distance),
    hrAvg: d.hr_avg,
    hrMax: d.hr_max,
    rpe: d.rpe,
    cadence: d.cadence,
    notes: d.notes ?? "",
    safetyOverridden: d.safety_overridden ?? false,
    loggedAt: d.logged_at,
  }));
}

export async function insertLog(userId: string, log: WorkoutLog) {
  const { error } = await supabase.from("workout_logs").insert({
    user_id: userId,
    week_idx: log.weekIdx ?? null,
    session_idx: log.sessionIdx ?? null,
    session_type: log.sessionType,
    session_name: log.sessionName,
    duration: log.duration,
    distance: log.distance,
    hr_avg: log.hrAvg,
    hr_max: log.hrMax ?? null,
    rpe: log.rpe,
    cadence: log.cadence ?? null,
    notes: log.notes ?? null,
    safety_overridden: log.safetyOverridden ?? false,
  });
  if (error) throw error;
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

// ---------- Reset (full delete for current user) ----------
export async function resetAllForUser(userId: string) {
  await supabase.from("workout_logs").delete().eq("user_id", userId);
  await supabase.from("plans").delete().eq("user_id", userId);
  await supabase.from("profiles").delete().eq("id", userId);
  await supabase.from("consents").delete().eq("user_id", userId);
}
