import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v5-2025-04-21-deep";
const TRIAGE_MODEL = "google/gemini-2.5-flash";
const DEEP_MODEL = "google/gemini-2.5-pro";
const MAX_IMAGES = 4;
const HR_SERIES_TARGET_POINTS = 30;

// =====================================================================
// STEP 1 — TRIAGE PROMPT
// =====================================================================
const TRIAGE_SYSTEM_PROMPT = `Sei un classificatore di screenshot di app fitness.
Per ogni immagine ricevuta in ordine, identifica quali di questi blocchi di contenuto sono presenti:

- "summary": riepilogo principale con totali (durata, distanza, FC media...)
- "kmSplits": tabella dei parziali per chilometro
- "segments": elenco di segmenti / lap (riscaldamento, ripetute, recuperi)
- "hrChart": grafico della frequenza cardiaca nel tempo
- "paceChart": grafico del passo nel tempo
- "hrZones": breakdown del tempo per zone di FC
- "other": niente di rilevante

Rispondi via tool call classify_images. Non inventare blocchi che non vedi.`;

const TRIAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "classify_images",
    description: "Classifica i blocchi presenti in ogni screenshot.",
    parameters: {
      type: "object",
      properties: {
        images: {
          type: "array",
          items: {
            type: "object",
            properties: {
              imageIdx: { type: "integer" },
              detectedApp: { type: ["string", "null"] },
              blocks: {
                type: "array",
                items: {
                  type: "string",
                  enum: ["summary", "kmSplits", "segments", "hrChart", "paceChart", "hrZones", "other"],
                },
              },
            },
            required: ["imageIdx", "blocks"],
            additionalProperties: false,
          },
        },
      },
      required: ["images"],
      additionalProperties: false,
    },
  },
};

// =====================================================================
// STEP 2 — DEEP EXTRACTION PROMPT
// =====================================================================
const DEEP_SYSTEM_PROMPT = `<role>
Sei un estrattore di dati profondo da screenshot di app fitness (Apple Salute, Apple Fitness, Strava, Garmin, Nike Run Club, Polar, Coros, ecc.).
Estrai TUTTI i dati visibili in modo strettamente DESCRITTIVO. Mai inventare, mai stimare, mai arrotondare creativamente.
</role>

<multi_image_rules>
L'utente carica fino a ${MAX_IMAGES} screenshot dello STESSO allenamento.
Considera tutte le immagini come UN UNICO allenamento.
Ti viene fornita una mappa "TRIAGE" con quale blocco è in quale immagine: usala per sapere dove cercare cosa.
Per ogni metrica, scegli il valore dalla schermata in cui è più chiaro. Ignora duplicati.
Se un campo non è leggibile in nessuna immagine, usa null. NON INVENTARE.
</multi_image_rules>

<conversion_rules>
- duration: minuti totali in DECIMALE.
  * "h:mm:ss" (es. "0:45:00") -> 45.0
  * "1:05:30" -> 65.5
  * "mm:ss" -> minuti.frazione
- distance: chilometri in DECIMALE.
  * Virgola = punto decimale ("7,59 km" -> 7.59)
  * Metri -> km ("7590 m" -> 7.59)
- hrAvg, hrMax: bpm interi.
- cadence: passi/min INTERI E TOTALI. Apple "ppm" è già totale, non x2.
- paceSecPerKm: secondi per km (intero). "5'56\\"/km" -> 356.
- elevDelta: metri (positivo = salita, negativo = discesa).
- durationSec di un segmento: secondi totali.
</conversion_rules>

<totals>
Riepilogo principale: duration, distance, hrAvg, hrMax, cadence, calories, elevGain.
Se mancano, null. hrMax può venire dall'asse Y in alto del grafico FC se non c'è un valore esplicito altrove.
</totals>

<km_splits>
Se vedi una tabella "Parziali" / "Splits" / "Per km":
una riga per ogni chilometro completato. Estrai TUTTI i km visibili.
Per ogni km: paceSecPerKm, hrAvg, hrMax (se mostrato), elevDelta (se mostrato).
Se l'ultimo km è frazionario (es. 7.59), includilo solo se l'app lo mostra come riga distinta.
</km_splits>

<segments>
Solo se l'app mostra ESPLICITAMENTE lap / segmenti / "intervalli" / "ripetute".
NON inferire segmenti dal grafico FC. Solo lap espliciti.
Per ogni segmento: idx (1-based), label (testo originale o tradotto), type:
- "warmup" (riscaldamento), "interval" (ripetuta veloce), "recovery" (recupero),
- "cooldown" (defaticamento), "steady" (continuo a ritmo costante), "other".
Inferisci type da label e contesto (durata + intensità). Se ambiguo: "other".
durationSec, distanceKm, paceSecPerKm, hrAvg, hrMax: null se non visibili per quel segmento.
</segments>

<hr_series>
Se è visibile un grafico FC nel tempo (curva FC vs tempo):
ricostruisci ~${HR_SERIES_TARGET_POINTS} punti CAMPIONATI UNIFORMEMENTE leggendo la curva.
Per ogni punto: tSec (secondi dall'inizio dell'allenamento), hr (bpm intero, leggi l'altezza della curva contro l'asse Y).
samplingHintSec = intervallo medio tra i punti (durata totale / numero punti).
Se non c'è grafico FC: hrSeries = null.
NON inventare. Se la curva è troppo confusa, restituisci meno punti o null.
</hr_series>

<pace_series>
Se è visibile un grafico del passo nel tempo (raro): stessa logica con paceSecPerKm.
Altrimenti null.
</pace_series>

<hr_zones>
Se l'app mostra il breakdown per zone (es. "Zona 1: 12%, Zona 2: 45%..."):
una entry per zona presente. zone = numero (1..5), percent = percentuale tempo.
Se non mostrato: array vuoto.
</hr_zones>

<visual_patterns>
Sempre, se c'è un grafico FC o passo:
- hrPattern: "stable" | "creep" | "spiky" | "fading" | null
  * stable = curva piatta entro banda stretta
  * creep = sale progressivamente a parità di passo
  * spiky = picchi e valli marcati (ripetute)
  * fading = scende verso la fine
- paceStrategy: "even" | "negative-split" | "positive-split" | "intervals" | null
- observations: 0-3 stringhe DESCRITTIVE in italiano. MAI cliniche.
  OK: "FC sale dai 155 ai 170 negli ultimi 15'", "passo uniforme intorno ai 5'30/km".
  VIETATO: "deriva patologica", "decompensazione", "anomalia".
</visual_patterns>

<output_rules>
Restituisci TUTTO via tool call extract_deep_workout. Tutti i blocchi opzionali: se vuoti restituisci array vuoto o null secondo schema.
NON inventare numeri. Meglio null che un valore inventato.
</output_rules>`;

// =====================================================================
// DEEP EXTRACTION TOOL SCHEMA
// =====================================================================
const DEEP_TOOL = {
  type: "function" as const,
  function: {
    name: "extract_deep_workout",
    description: "Estrae il dataset completo dell'allenamento dagli screenshot.",
    parameters: {
      type: "object",
      properties: {
        totals: {
          type: "object",
          properties: {
            duration: { type: ["number", "null"] },
            distance: { type: ["number", "null"] },
            hrAvg: { type: ["integer", "null"] },
            hrMax: { type: ["integer", "null"] },
            cadence: { type: ["integer", "null"] },
            calories: { type: ["integer", "null"] },
            elevGain: { type: ["integer", "null"] },
          },
          required: ["duration", "distance", "hrAvg", "hrMax", "cadence", "calories", "elevGain"],
          additionalProperties: false,
        },
        kmSplits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              km: { type: "integer" },
              paceSecPerKm: { type: ["integer", "null"] },
              hrAvg: { type: ["integer", "null"] },
              hrMax: { type: ["integer", "null"] },
              elevDelta: { type: ["integer", "null"] },
            },
            required: ["km", "paceSecPerKm", "hrAvg", "hrMax", "elevDelta"],
            additionalProperties: false,
          },
        },
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idx: { type: "integer" },
              label: { type: "string" },
              type: {
                type: "string",
                enum: ["warmup", "interval", "recovery", "cooldown", "steady", "other"],
              },
              durationSec: { type: ["integer", "null"] },
              distanceKm: { type: ["number", "null"] },
              paceSecPerKm: { type: ["integer", "null"] },
              hrAvg: { type: ["integer", "null"] },
              hrMax: { type: ["integer", "null"] },
            },
            required: ["idx", "label", "type", "durationSec", "distanceKm", "paceSecPerKm", "hrAvg", "hrMax"],
            additionalProperties: false,
          },
        },
        hrSeries: {
          type: ["object", "null"],
          properties: {
            samplingHintSec: { type: "integer" },
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tSec: { type: "integer" },
                  hr: { type: "integer" },
                },
                required: ["tSec", "hr"],
                additionalProperties: false,
              },
            },
          },
          required: ["samplingHintSec", "points"],
          additionalProperties: false,
        },
        paceSeries: {
          type: ["object", "null"],
          properties: {
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tSec: { type: "integer" },
                  paceSecPerKm: { type: "integer" },
                },
                required: ["tSec", "paceSecPerKm"],
                additionalProperties: false,
              },
            },
          },
          required: ["points"],
          additionalProperties: false,
        },
        hrZones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              zone: { type: "integer" },
              percent: { type: "integer" },
            },
            required: ["zone", "percent"],
            additionalProperties: false,
          },
        },
        visualPatterns: {
          type: "object",
          properties: {
            hrPattern: { type: ["string", "null"], enum: ["stable", "creep", "spiky", "fading", null] },
            paceStrategy: {
              type: ["string", "null"],
              enum: ["even", "negative-split", "positive-split", "intervals", null],
            },
            observations: { type: "array", items: { type: "string" } },
          },
          required: ["hrPattern", "paceStrategy", "observations"],
          additionalProperties: false,
        },
        detectedApp: { type: ["string", "null"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
      },
      required: [
        "totals",
        "kmSplits",
        "segments",
        "hrSeries",
        "paceSeries",
        "hrZones",
        "visualPatterns",
        "confidence",
      ],
      additionalProperties: false,
    },
  },
};

// =====================================================================
// TYPES
// =====================================================================
type TriageResult = {
  images: { imageIdx: number; detectedApp?: string | null; blocks: string[] }[];
};

type DeepExtraction = {
  totals: {
    duration: number | null;
    distance: number | null;
    hrAvg: number | null;
    hrMax: number | null;
    cadence: number | null;
    calories: number | null;
    elevGain: number | null;
  };
  kmSplits: {
    km: number;
    paceSecPerKm: number | null;
    hrAvg: number | null;
    hrMax: number | null;
    elevDelta: number | null;
  }[];
  segments: {
    idx: number;
    label: string;
    type: string;
    durationSec: number | null;
    distanceKm: number | null;
    paceSecPerKm: number | null;
    hrAvg: number | null;
    hrMax: number | null;
  }[];
  hrSeries: { samplingHintSec: number; points: { tSec: number; hr: number }[] } | null;
  paceSeries: { points: { tSec: number; paceSecPerKm: number }[] } | null;
  hrZones: { zone: number; percent: number }[];
  visualPatterns: {
    hrPattern: string | null;
    paceStrategy: string | null;
    observations: string[];
  };
  detectedApp?: string | null;
  confidence: string;
};

// =====================================================================
// AI GATEWAY HELPER
// =====================================================================
async function callGateway(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signedUrls: string[],
  tool: typeof TRIAGE_TOOL,
): Promise<{ ok: true; parsed: any; raw: unknown } | { ok: false; status: number; errText: string }> {
  const userContent: any[] = [{ type: "text", text: userPrompt }];
  for (const url of signedUrls) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: tool.function.name } },
    }),
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text().catch(() => "");
    return { ok: false, status: aiResp.status, errText };
  }

  const aiData = await aiResp.json();
  const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    return { ok: false, status: 500, errText: "no_tool_call" };
  }

  try {
    const parsed = JSON.parse(toolCall.function.arguments);
    return { ok: true, parsed, raw: aiData };
  } catch (e) {
    return { ok: false, status: 500, errText: `parse_error: ${String(e)}` };
  }
}

// =====================================================================
// VALIDATION (deterministic, no AI)
// =====================================================================
function validateExtraction(ex: DeepExtraction) {
  const notes: string[] = [];
  let durationConsistency: "ok" | "mismatch" | "n/a" = "n/a";
  let distanceConsistency: "ok" | "mismatch" | "n/a" = "n/a";
  let hrAvgConsistency: "ok" | "mismatch" | "n/a" = "n/a";

  const totalDurMin = ex.totals.duration;
  const totalDistKm = ex.totals.distance;
  const totalHrAvg = ex.totals.hrAvg;

  // Duration: sum segments ≈ total
  if (totalDurMin != null && ex.segments.length > 0) {
    const segSumMin = ex.segments.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60;
    if (segSumMin > 0) {
      const ratio = segSumMin / totalDurMin;
      if (ratio < 0.85 || ratio > 1.15) {
        durationConsistency = "mismatch";
        notes.push(`Somma durate segmenti (${segSumMin.toFixed(1)}m) ≠ totale (${totalDurMin}m)`);
      } else {
        durationConsistency = "ok";
      }
    }
  }

  // Distance: sum km splits ≈ total
  if (totalDistKm != null && ex.kmSplits.length > 0) {
    const splitDistKm = ex.kmSplits.length; // each split is 1 km nominally
    const ratio = splitDistKm / totalDistKm;
    if (ratio < 0.85 || ratio > 1.15) {
      distanceConsistency = "mismatch";
      notes.push(`# split (${splitDistKm}) non coerente con distanza totale (${totalDistKm}km)`);
    } else {
      distanceConsistency = "ok";
    }
  }

  // HR avg: weighted mean of segments ≈ total
  if (totalHrAvg != null && ex.segments.length > 0) {
    const valid = ex.segments.filter((s) => s.hrAvg != null && (s.durationSec ?? 0) > 0);
    if (valid.length > 0) {
      const totalSec = valid.reduce((a, s) => a + (s.durationSec ?? 0), 0);
      const weighted = valid.reduce((a, s) => a + (s.hrAvg as number) * (s.durationSec ?? 0), 0) / totalSec;
      const diff = Math.abs(weighted - totalHrAvg);
      if (diff > 8) {
        hrAvgConsistency = "mismatch";
        notes.push(`FC media pesata segmenti (${weighted.toFixed(0)}) ≠ FC media dichiarata (${totalHrAvg})`);
      } else {
        hrAvgConsistency = "ok";
      }
    }
  }

  return { durationConsistency, distanceConsistency, hrAvgConsistency, notes };
}

// =====================================================================
// LANGUAGE GUARDRAIL on observations
// =====================================================================
function sanitizeObservations(obs: string[]): string[] {
  const banned = ["patolog", "diagnos", "decompens", "deriva cardiaca patologica", "anomalia"];
  return obs
    .filter((o) => typeof o === "string" && o.length > 0 && o.length < 200)
    .filter((o) => !banned.some((b) => o.toLowerCase().includes(b)))
    .slice(0, 3);
}

// =====================================================================
// HTTP HANDLER
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { imagePath, imagePaths, sessionType } = body || {};

    const paths: string[] = Array.isArray(imagePaths) && imagePaths.length > 0
      ? imagePaths
      : (typeof imagePath === "string" ? [imagePath] : []);

    if (paths.length === 0) return json({ error: "imagePath or imagePaths required" }, 400);
    if (paths.length > MAX_IMAGES) return json({ error: `Massimo ${MAX_IMAGES} immagini` }, 400);

    // Sign URLs (longer TTL because we make 2 sequential AI calls)
    const signedUrls: string[] = [];
    for (const p of paths) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("workout-screenshots")
        .createSignedUrl(p, 180);
      if (signedErr || !signed?.signedUrl) {
        console.error("Signed URL error:", signedErr);
        return json({ error: "Image not accessible" }, 400);
      }
      signedUrls.push(signed.signedUrl);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // ==========================================
    // STEP 1: TRIAGE
    // ==========================================
    const triagePrompt = `Classifica questi ${signedUrls.length} screenshot dell'allenamento (tipo dichiarato: ${sessionType || "freeform"}). Indica per ciascuna immagine quali blocchi contiene.`;

    const triageRes = await callGateway(
      LOVABLE_API_KEY,
      TRIAGE_MODEL,
      TRIAGE_SYSTEM_PROMPT,
      triagePrompt,
      signedUrls,
      TRIAGE_TOOL,
    );

    let triageMap: TriageResult = { images: [] };
    let detectedApp: string | null = null;

    if (triageRes.ok) {
      triageMap = triageRes.parsed as TriageResult;
      detectedApp = triageMap.images.find((i) => i.detectedApp)?.detectedApp ?? null;
    } else {
      // Triage non bloccante: continuiamo senza hint
      if (triageRes.status === 429) {
        return json({ error: "rate_limit" }, 429);
      }
      if (triageRes.status === 402) {
        return json({ error: "credits_exhausted" }, 402);
      }
      console.warn("Triage failed, continuing without hints:", triageRes.status, triageRes.errText.slice(0, 200));
    }

    // ==========================================
    // STEP 2: DEEP EXTRACTION (gemini-2.5-pro)
    // ==========================================
    const triageHint = triageMap.images.length > 0
      ? "MAPPA TRIAGE (quale blocco è in quale immagine):\n" +
        triageMap.images
          .map((i) => `- Immagine #${i.imageIdx + 1}: ${i.blocks.join(", ") || "(nulla di rilevante)"}`)
          .join("\n")
      : "MAPPA TRIAGE: non disponibile, ispeziona tutte le immagini.";

    const deepPrompt = `Estrai TUTTI i dati di questo allenamento (tipo: ${sessionType || "freeform"}) leggendo TUTTE le ${signedUrls.length} immagini come UN UNICO allenamento.

${triageHint}

Ricorda:
- Virgola = separatore decimale (7,59 km = 7.59).
- "0:45:00" = 45 minuti.
- "ppm" Apple è cadenza totale (non x2).
- Per hrMax leggi anche l'asse Y in alto del grafico FC.
- Per kmSplits: estrai TUTTI i km visibili nella tabella parziali.
- Per segments: SOLO se l'app mostra lap espliciti. Mai inferirli dal grafico FC.
- Per hrSeries: ~${HR_SERIES_TARGET_POINTS} punti uniformi dal grafico FC, leggendo la curva. Se assente, hrSeries = null.
- Mai inventare. Meglio null che un numero stimato.`;

    const deepRes = await callGateway(
      LOVABLE_API_KEY,
      DEEP_MODEL,
      DEEP_SYSTEM_PROMPT,
      deepPrompt,
      signedUrls,
      DEEP_TOOL,
    );

    if (!deepRes.ok) {
      if (deepRes.status === 429) return json({ error: "rate_limit" }, 429);
      if (deepRes.status === 402) return json({ error: "credits_exhausted" }, 402);
      console.error("Deep extraction error:", deepRes.status, deepRes.errText);
      void logRequest(supabase, userId, DEEP_MODEL, deepPrompt, signedUrls.length, null, "error", `${deepRes.status}: ${deepRes.errText.slice(0, 300)}`);
      return json({ error: "AI gateway error" }, 500);
    }

    const extracted = deepRes.parsed as DeepExtraction;

    // Sanitize observations
    if (Array.isArray(extracted.visualPatterns?.observations)) {
      extracted.visualPatterns.observations = sanitizeObservations(extracted.visualPatterns.observations);
    } else {
      extracted.visualPatterns = {
        hrPattern: extracted.visualPatterns?.hrPattern ?? null,
        paceStrategy: extracted.visualPatterns?.paceStrategy ?? null,
        observations: [],
      };
    }

    // Cap hrSeries length defensively
    if (extracted.hrSeries?.points && extracted.hrSeries.points.length > 120) {
      extracted.hrSeries.points = extracted.hrSeries.points.slice(0, 120);
    }

    // Validation
    const validation = validateExtraction(extracted);

    // Compose the final ExtractedWorkout
    const result = {
      totals: extracted.totals,
      kmSplits: extracted.kmSplits ?? [],
      segments: extracted.segments ?? [],
      hrSeries: extracted.hrSeries ?? null,
      paceSeries: extracted.paceSeries ?? null,
      hrZones: extracted.hrZones ?? [],
      visualPatterns: extracted.visualPatterns,
      detectedApp: extracted.detectedApp ?? detectedApp ?? null,
      confidence: (extracted.confidence ?? "medium") as "high" | "medium" | "low",
      sourceImagesUsed: signedUrls.length,
      validation,
    };

    void logRequest(supabase, userId, DEEP_MODEL, deepPrompt, signedUrls.length, result as Record<string, unknown>, "success", null);

    // Backwards-compat: also expose a flat "extracted" with the basic 5 fields,
    // so the existing client form-fill logic keeps working.
    const extractedFlat = {
      duration: result.totals.duration,
      distance: result.totals.distance,
      hrAvg: result.totals.hrAvg,
      hrMax: result.totals.hrMax,
      cadence: result.totals.cadence,
      detectedApp: result.detectedApp,
      confidence: result.confidence,
      hrPattern: result.visualPatterns.hrPattern,
      paceStrategy: result.visualPatterns.paceStrategy,
      observations: result.visualPatterns.observations,
    };

    return json({
      extracted: extractedFlat,
      extractedWorkout: result,
      promptVersion: PROMPT_VERSION,
      model: DEEP_MODEL,
      triageModel: TRIAGE_MODEL,
      imagesUsed: signedUrls.length,
      sourceImagePaths: paths,
    });
  } catch (e) {
    console.error("extract-workout-data error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function logRequest(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  model: string,
  userPrompt: string,
  imageCount: number,
  response: Record<string, unknown> | null,
  status: "success" | "error",
  errorMessage: string | null,
) {
  try {
    await supabase.from("ai_requests").insert({
      user_id: userId,
      function_name: "extract-workout-data",
      model,
      prompt_version: PROMPT_VERSION,
      log_id: null,
      system_prompt: DEEP_SYSTEM_PROMPT,
      user_prompt: `${userPrompt} [images: ${imageCount}]`,
      response,
      status,
      error_message: errorMessage,
    });
  } catch (e) {
    console.error("logRequest failed:", e);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
