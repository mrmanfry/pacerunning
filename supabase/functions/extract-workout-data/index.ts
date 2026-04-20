import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Sei un estrattore di dati da screenshot di app fitness (Apple Salute, Strava, Garmin, Nike Run Club, ecc.).

REGOLE FERREE:
1. Estrai SOLO numeri chiaramente visibili nello screenshot.
2. Se un valore non è visibile o è ambiguo, restituisci null per quel campo.
3. NON inventare valori, NON stimare, NON arrotondare creativamente.
4. Converti tutto nelle unità richieste:
   - duration: minuti totali (numero decimale, es. "32:15" -> 32.25)
   - distance: chilometri (numero decimale)
   - hrAvg, hrMax: battiti per minuto (intero)
   - cadence: passi al minuto (intero, somma dei due piedi)
5. Se vedi pace/passo invece di durata, calcola la durata SOLO se hai anche distanza certa.

Restituisci SEMPRE un oggetto strutturato via tool call.`;

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

    const body = await req.json();
    const { imagePath, sessionType } = body || {};
    if (!imagePath || typeof imagePath !== "string") {
      return json({ error: "imagePath required" }, 400);
    }

    // Generate signed URL for the image
    const { data: signed, error: signedErr } = await supabase.storage
      .from("workout-screenshots")
      .createSignedUrl(imagePath, 60);

    if (signedErr || !signed?.signedUrl) {
      console.error("Signed URL error:", signedErr);
      return json({ error: "Image not accessible" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Estrai i dati di questo allenamento (tipo: ${sessionType || "freeform"}). Solo numeri visibili. null per i campi mancanti.`,
              },
              { type: "image_url", image_url: { url: signed.signedUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_workout_metrics",
              description: "Restituisce le metriche estratte dallo screenshot",
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
      if (aiResp.status === 429) return json({ error: "rate_limit" }, 429);
      if (aiResp.status === 402) return json({ error: "credits_exhausted" }, 402);
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ error: "No structured output from AI" }, 500);
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    return json({ extracted });
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
