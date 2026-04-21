import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT_VERSION = "v3-2025-04-21-multi-image";
const MODEL = "google/gemini-2.5-flash-lite";
const MAX_IMAGES = 4;

const SYSTEM_PROMPT = `<role>
Sei un estrattore di dati da screenshot di app fitness (Apple Salute, Strava, Garmin, Nike Run Club, ecc.).
Estrai numeri visibili e leggi i pattern qualitativi del grafico in modo strettamente DESCRITTIVO.
</role>

<multi_image_rules>
L'utente può caricare fino a ${MAX_IMAGES} screenshot dello STESSO allenamento (es. una schermata con i totali, un'altra col grafico FC, un'altra con la cadenza).
- Considera tutte le immagini come UN UNICO allenamento.
- Per ogni metrica, prendi il valore dalla schermata in cui è più chiaro e leggibile.
- Se la stessa metrica appare in più immagini con valori diversi, scegli quella con la fonte più affidabile (riepilogo > grafico parziale) e ignora le altre.
- Se in nessuna immagine il valore è chiaro, restituisci null per quel campo.
</multi_image_rules>

<extraction_rules>
1. Estrai SOLO numeri chiaramente visibili negli screenshot.
2. Se un valore non è visibile o è ambiguo in tutte le immagini, restituisci null per quel campo.
3. NON inventare valori, NON stimare, NON arrotondare creativamente.
4. Conversioni:
   - duration: minuti totali (decimale; es. "32:15" -> 32.25)
   - distance: chilometri (decimale)
   - hrAvg, hrMax: bpm (intero)
   - cadence: passi/min (intero, somma dei due piedi)
5. Se vedi pace/passo invece della durata, calcola la durata SOLO se hai anche distanza certa.
</extraction_rules>

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

    // Normalizza in array, accetta sia il vecchio imagePath che il nuovo imagePaths
    const paths: string[] = Array.isArray(imagePaths) && imagePaths.length > 0
      ? imagePaths
      : (typeof imagePath === "string" ? [imagePath] : []);

    if (paths.length === 0) {
      return json({ error: "imagePath or imagePaths required" }, 400);
    }
    if (paths.length > MAX_IMAGES) {
      return json({ error: `Massimo ${MAX_IMAGES} immagini` }, 400);
    }

    // Genera signed URL per ognuna
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

    const userPrompt = `Estrai i dati di questo allenamento (tipo: ${sessionType || "freeform"}) leggendo TUTTE le ${signedUrls.length} immagini come un unico allenamento. Solo numeri visibili, null per i campi mancanti. Se un grafico FC/pace è visibile in una delle immagini, popola anche hrPattern, paceStrategy e observations in modo descrittivo (mai clinico).`;

    const userContent: any[] = [{ type: "text", text: userPrompt }];
    for (const url of signedUrls) {
      userContent.push({ type: "image_url", image_url: { url } });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
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
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_workout_metrics" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      void supabase.from("ai_requests").insert({
        user_id: userId,
        function_name: "extract-workout-data",
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        log_id: null,
        system_prompt: SYSTEM_PROMPT,
        user_prompt: `${userPrompt} [images: ${signedUrls.length}]`,
        response: null,
        status: "error",
        error_message: `${aiResp.status}: ${errText.slice(0, 500)}`,
      });
      if (aiResp.status === 429) return json({ error: "rate_limit" }, 429);
      if (aiResp.status === 402) return json({ error: "credits_exhausted" }, 402);
      console.error("AI gateway error:", aiResp.status, errText);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      void supabase.from("ai_requests").insert({
        user_id: userId,
        function_name: "extract-workout-data",
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        log_id: null,
        system_prompt: SYSTEM_PROMPT,
        user_prompt: `${userPrompt} [images: ${signedUrls.length}]`,
        response: aiData ?? null,
        status: "error",
        error_message: "No structured output",
      });
      return json({ error: "No structured output from AI" }, 500);
    }

    const extracted = JSON.parse(toolCall.function.arguments);

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

    void supabase.from("ai_requests").insert({
      user_id: userId,
      function_name: "extract-workout-data",
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      log_id: null,
      system_prompt: SYSTEM_PROMPT,
      user_prompt: `${userPrompt} [images: ${signedUrls.length}]`,
      response: extracted as Record<string, unknown>,
      status: "success",
      error_message: null,
    });

    return json({ extracted, promptVersion: PROMPT_VERSION, model: MODEL, imagesUsed: signedUrls.length });
  } catch (e) {
    console.error("extract-workout-data error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
