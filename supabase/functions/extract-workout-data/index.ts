import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v4-2025-04-21-apple-fitness";
const PRIMARY_MODEL = "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.5-pro";
const MAX_IMAGES = 4;
const MIN_FIELDS_FOR_SUCCESS = 2; // sotto questa soglia tentiamo il fallback su pro

const SYSTEM_PROMPT = `<role>
Sei un estrattore di dati da screenshot di app fitness (Apple Salute / Apple Fitness, Strava, Garmin, Nike Run Club, ecc.).
Estrai numeri visibili e leggi i pattern qualitativi del grafico in modo strettamente DESCRITTIVO.
</role>

<multi_image_rules>
L'utente può caricare fino a ${MAX_IMAGES} screenshot dello STESSO allenamento (es. una schermata col riepilogo, un'altra coi parziali km, un'altra coi segmenti / grafico FC).
- Considera tutte le immagini come UN UNICO allenamento.
- Per ogni metrica, prendi il valore dalla schermata in cui è più chiaro e leggibile.
- Se la stessa metrica appare in più immagini con valori diversi, scegli quella con la fonte più affidabile (riepilogo principale > parziali > segmenti) e ignora le altre.
- Se in nessuna immagine il valore è chiaro, restituisci null per quel campo.
</multi_image_rules>

<extraction_rules>
1. Estrai SOLO numeri chiaramente visibili negli screenshot.
2. Se un valore non è visibile o è ambiguo in tutte le immagini, restituisci null per quel campo.
3. NON inventare valori, NON stimare, NON arrotondare creativamente.
4. Conversioni:
   - duration: minuti totali in DECIMALE.
     * Formato "h:mm:ss" (es. Apple Fitness "0:45:00") -> 45.0
     * Formato "1:05:30" -> 65.5
     * Formato "mm:ss" (es. "32:15") -> 32.25
     * Formato "45 min" o "0h 45m" -> 45.0
   - distance: chilometri in DECIMALE.
     * IMPORTANTE: il separatore decimale può essere VIRGOLA (formato europeo: "7,59 km") o PUNTO ("7.59 km"). Trattali come equivalenti -> 7.59.
     * Se vedi solo metri (es. "7590 m"), converti in km -> 7.59.
   - hrAvg, hrMax: bpm (intero).
   - cadence: passi/min (intero).
     * Apple Fitness mostra "ppm" (passi per minuto) come valore GIÀ TOTALE (somma dei due piedi). Riportalo così com'è (es. "155 ppm" -> 155).
     * Se l'app mostra cadenza "spm" o "passi/min" già totali, idem.
     * NON moltiplicare per 2.
5. Se vedi pace/passo invece della durata, calcola la durata SOLO se hai anche distanza certa.
</extraction_rules>

<hr_max_rules>
La FC massima (hrMax) può apparire in posizioni diverse:
1. Come numero esplicito nel riepilogo (es. "FC max: 183 bpm").
2. Come label sull'asse Y in alto del GRAFICO della frequenza cardiaca (es. Apple Fitness mostra "183" in alto a destra del grafico FC).
3. Come valore massimo nei segmenti / parziali (la riga col bpm più alto).
Usa la fonte più affidabile in quest'ordine: 1 > 2 > 3. Se nessuna è leggibile, hrMax = null.
</hr_max_rules>

<apple_fitness_examples>
Esempi reali di lettura da Apple Fitness / Apple Salute (in italiano):

Riepilogo "Corsa outdoor":
- "Durata allenamento 0:45:00" -> duration = 45.0
- "Distanza 7,59 KM" -> distance = 7.59
- "Media battito 165 BPM" -> hrAvg = 165
- "Media cadenza 155 PPM" -> cadence = 155
- "Media ritmo 5'56'' /KM" -> NON è duration, è pace; usalo solo per validare distance se serve.

Grafico "Frequenza cardiaca":
- Asse Y in alto mostra "183" -> hrMax = 183 (se non c'è un valore esplicito altrove).

Segmenti / Parziali:
- Una colonna "Battito cardiaco" con righe "146 BPM, 171 BPM, ..., 177 BPM, ...": il MAX in quella colonna è hrMax candidato (priorità inferiore al grafico).
- Le righe parziali NON sono la durata totale, sono spezzoni.
</apple_fitness_examples>

<visual_patterns>
Se in una delle immagini è visibile un grafico di frequenza cardiaca o di passo nel tempo, leggi:

- hrPattern (uno tra: "stable", "creep", "spiky", "fading", null se non visibile o non leggibile):
  * stable = la curva resta piatta entro una banda stretta
  * creep = la curva sale in modo progressivo nel tempo a parità di passo
  * spiky = picchi e valli marcati (tipico di ripetute)
  * fading = la curva scende verso la fine (calo)

- paceStrategy (uno tra: "even", "negative-split", "positive-split", "intervals", null):
  * even = passo uniforme dall'inizio alla fine
  * negative-split = la seconda metà è più veloce della prima
  * positive-split = la prima metà è più veloce della seconda
  * intervals = alternanza forte tra spinte e recuperi

- observations: array di 0-3 stringhe DESCRITTIVE in italiano, mai cliniche.
  Esempi OK: "la frequenza è salita dai 155 ai 170 bpm negli ultimi 15'", "passo uniforme intorno ai 5'30/km", "apertura veloce poi assestamento".
  Esempi VIETATI: "deriva cardiaca patologica", "decompensazione", "anomalia ritmica", "soffri di".
</visual_patterns>

<output>
Restituisci SEMPRE l'oggetto via tool call extract_workout_metrics.
Se nessun grafico è leggibile, hrPattern/paceStrategy=null e observations=[].
</output>`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "extract_workout_metrics",
    description: "Restituisce le metriche estratte dagli screenshot e i pattern visivi descrittivi",
    parameters: {
      type: "object",
      properties: {
        duration: { type: ["number", "null"], description: "Durata totale in minuti (decimale)" },
        distance: { type: ["number", "null"], description: "Distanza in chilometri (decimale)" },
        hrAvg: { type: ["integer", "null"], description: "FC media in bpm" },
        hrMax: { type: ["integer", "null"], description: "FC massima in bpm" },
        cadence: { type: ["integer", "null"], description: "Cadenza in passi/min" },
        detectedApp: { type: "string", description: "App di provenienza riconosciuta" },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        hrPattern: {
          type: ["string", "null"],
          enum: ["stable", "creep", "spiky", "fading", null],
          description: "Andamento qualitativo della FC nel grafico, null se non leggibile",
        },
        paceStrategy: {
          type: ["string", "null"],
          enum: ["even", "negative-split", "positive-split", "intervals", null],
          description: "Strategia di passo letta dal grafico, null se non leggibile",
        },
        observations: {
          type: "array",
          items: { type: "string" },
          description: "0-3 osservazioni descrittive in italiano (mai cliniche)",
        },
      },
      required: ["duration", "distance", "hrAvg", "hrMax", "cadence", "confidence"],
      additionalProperties: false,
    },
  },
};

type Extracted = {
  duration: number | null;
  distance: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  cadence: number | null;
  detectedApp?: string;
  confidence?: string;
  hrPattern?: string | null;
  paceStrategy?: string | null;
  observations?: string[];
};

function countNumericFields(e: Extracted): number {
  return ["duration", "distance", "hrAvg", "hrMax", "cadence"].reduce((acc, k) => {
    const v = (e as any)[k];
    return acc + (typeof v === "number" && !Number.isNaN(v) ? 1 : 0);
  }, 0);
}

async function callGateway(
  apiKey: string,
  model: string,
  userPrompt: string,
  signedUrls: string[],
): Promise<{ ok: true; extracted: Extracted; raw: unknown } | { ok: false; status: number; errText: string }> {
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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "extract_workout_metrics" } },
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
    const extracted = JSON.parse(toolCall.function.arguments) as Extracted;
    return { ok: true, extracted, raw: aiData };
  } catch (e) {
    return { ok: false, status: 500, errText: `parse_error: ${String(e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const { imagePath, imagePaths, sessionType } = body || {};

    const paths: string[] = Array.isArray(imagePaths) && imagePaths.length > 0
      ? imagePaths
      : (typeof imagePath === "string" ? [imagePath] : []);

    if (paths.length === 0) {
      return json({ error: "imagePath or imagePaths required" }, 400);
    }
    if (paths.length > MAX_IMAGES) {
      return json({ error: `Massimo ${MAX_IMAGES} immagini` }, 400);
    }

    const signedUrls: string[] = [];
    for (const p of paths) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("workout-screenshots")
        .createSignedUrl(p, 60);
      if (signedErr || !signed?.signedUrl) {
        console.error("Signed URL error:", signedErr);
        return json({ error: "Image not accessible" }, 400);
      }
      signedUrls.push(signed.signedUrl);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const userPrompt = `Estrai i dati di questo allenamento (tipo: ${sessionType || "freeform"}) leggendo TUTTE le ${signedUrls.length} immagini come un unico allenamento. Solo numeri visibili, null per i campi mancanti. Ricorda: la virgola è separatore decimale (7,59 km = 7.59), il formato durata "0:45:00" significa 45 minuti, "ppm" Apple è già cadenza totale. Se un grafico FC/pace è visibile in una delle immagini, popola anche hrPattern, paceStrategy e observations in modo descrittivo (mai clinico). Per hrMax leggi anche il numero in alto sull'asse Y del grafico FC se non c'è un valore esplicito.`;

    // === Primo tentativo: gemini-2.5-flash ===
    let modelUsed = PRIMARY_MODEL;
    let retried = false;
    let attempt = await callGateway(LOVABLE_API_KEY, PRIMARY_MODEL, userPrompt, signedUrls);

    if (!attempt.ok) {
      // errori HTTP gateway: forward dei codici utili (rate/credits) senza retry
      if (attempt.status === 429) {
        void logRequest(supabase, userId, modelUsed, userPrompt, signedUrls.length, null, "error", `429: ${attempt.errText.slice(0, 300)}`);
        return json({ error: "rate_limit" }, 429);
      }
      if (attempt.status === 402) {
        void logRequest(supabase, userId, modelUsed, userPrompt, signedUrls.length, null, "error", `402: ${attempt.errText.slice(0, 300)}`);
        return json({ error: "credits_exhausted" }, 402);
      }
      console.error("Primary model error:", attempt.status, attempt.errText);
      void logRequest(supabase, userId, modelUsed, userPrompt, signedUrls.length, null, "error", `${attempt.status}: ${attempt.errText.slice(0, 300)}`);
      return json({ error: "AI gateway error" }, 500);
    }

    let extracted = attempt.extracted;
    let filled = countNumericFields(extracted);

    // === Retry su pro se troppo pochi campi ===
    if (filled < MIN_FIELDS_FOR_SUCCESS) {
      console.log(`Primary returned only ${filled} fields, retrying with ${FALLBACK_MODEL}`);
      const retry = await callGateway(LOVABLE_API_KEY, FALLBACK_MODEL, userPrompt, signedUrls);
      retried = true;
      if (retry.ok) {
        const retryFilled = countNumericFields(retry.extracted);
        if (retryFilled > filled) {
          extracted = retry.extracted;
          filled = retryFilled;
          modelUsed = FALLBACK_MODEL;
        }
      } else if (retry.status === 429 || retry.status === 402) {
        // se il fallback va in rate limit/credit non blocchiamo: teniamo il primo risultato
        console.warn(`Fallback ${FALLBACK_MODEL} rate/credit limited (${retry.status}), keeping primary result`);
      } else {
        console.warn(`Fallback ${FALLBACK_MODEL} failed: ${retry.status} ${retry.errText.slice(0, 200)}`);
      }
    }

    // Sanity check sul linguaggio delle observations
    if (Array.isArray(extracted.observations)) {
      const banned = ["patolog", "diagnos", "decompens", "deriva cardiaca patologica", "anomalia"];
      extracted.observations = extracted.observations
        .filter((o: any) => typeof o === "string" && o.length > 0 && o.length < 200)
        .filter((o: string) => !banned.some((b) => o.toLowerCase().includes(b)))
        .slice(0, 3);
    } else {
      extracted.observations = [];
    }

    void logRequest(supabase, userId, modelUsed, userPrompt, signedUrls.length, extracted as Record<string, unknown>, "success", null);

    return json({
      extracted,
      promptVersion: PROMPT_VERSION,
      model: modelUsed,
      imagesUsed: signedUrls.length,
      retried,
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
      system_prompt: SYSTEM_PROMPT,
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
