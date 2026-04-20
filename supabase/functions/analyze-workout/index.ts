import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cap. 4.2 — System prompt blindato
const SYSTEM_PROMPT = `Sei "PACE Analista", un analista di dati sportivi per un'app wellness amatoriale. NON sei un medico, NON sei un coach professionista, NON sei un fisioterapista.

LA TUA IDENTITÀ:
- Leggi numeri già calcolati dal codice (pace, %FC, zone). Non calcoli mai tu.
- Commenti pattern statistici tratti dalla letteratura amatoriale.
- Sei descrittivo, mai prescrittivo.

VIETATO ASSOLUTAMENTE:
- Diagnosticare condizioni mediche (sindromi, patologie, infortuni clinici).
- Prescrivere riposo medico, farmaci, terapie.
- Usare frasi imperative come "devi correre a X", "devi smettere", "devi assolutamente".
- Inventare numeri o calcoli: usa SOLO i valori forniti nel prompt.

LESSICO OBBLIGATORIO (condizionale, descrittivo):
- "le metriche suggeriscono", "i dati indicano", "la letteratura amatoriale tipicamente associa"
- "potresti voler considerare", "alcuni runner riferiscono"
- MAI: "devi", "ti prescrivo", "soffri di", "hai una"

DE-ESCALATION:
Se nelle note l'utente segnala dolore, malessere, sintomi insoliti: NON interpretarli. Limitati a invitare a consultare un medico. Non fare ipotesi cliniche.

OUTPUT:
Compila SEMPRE i 3 campi (technicalReading, sessionHighlight, nextMove) seguendo Cap. 3.4. Brevi (2-4 frasi ciascuno). Toni misurati.

PLAN ADJUSTMENT:
Valuta lo storico: se i dati di tutti i log suggeriscono un target irrealistico (troppo ottimistico O troppo pessimistico) di oltre 3 minuti, popola planAdjustment con shouldAdjust=true e una nuova stima realistica. Altrimenti shouldAdjust=false.`;

const FORBIDDEN_WORDS = [
  "sindrome",
  "patologia",
  "diagnosi",
  "diagnostico",
  "prescrivo",
  "prescrizione",
  "devi assolutamente",
  "soffri di",
  "soffri della",
  "hai una malattia",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const { computed, log, profile, recentSameType, allLogsSummary } = body || {};
    if (!computed || !log || !profile) return json({ error: "Invalid payload" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // Cap. 3.2 — Sandwich: passa numeri pre-calcolati
    const userPrompt = buildUserPrompt({ computed, log, profile, recentSameType, allLogsSummary });

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_session",
              description: "Restituisce l'analisi descrittiva strutturata della sessione",
              parameters: {
                type: "object",
                properties: {
                  technicalReading: {
                    type: "string",
                    description: "Lettura Tecnica (Cap. 3.4): incrocio battiti/ritmo/intenzione. 2-4 frasi.",
                  },
                  sessionHighlight: {
                    type: "string",
                    description: "Highlight: cosa ha funzionato o cosa correggere, considerando note e RPE. 2-4 frasi.",
                  },
                  nextMove: {
                    type: "string",
                    description: "Spunto Operativo retrospettivo per la prossima sessione. 2-3 frasi.",
                  },
                  planAdjustment: {
                    type: "object",
                    properties: {
                      shouldAdjust: { type: "boolean" },
                      reason: { type: "string", description: "Motivo dell'adattamento, breve" },
                      newTargetEstimate: {
                        type: ["number", "null"],
                        description: "Nuovo target in minuti, o null se non serve adattare",
                      },
                      message: { type: "string", description: "Messaggio per l'utente, breve e descrittivo" },
                    },
                    required: ["shouldAdjust", "reason", "newTargetEstimate", "message"],
                    additionalProperties: false,
                  },
                },
                required: ["technicalReading", "sessionHighlight", "nextMove", "planAdjustment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_session" } },
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
    if (!toolCall?.function?.arguments) return json({ error: "No structured output" }, 500);

    const parsed = JSON.parse(toolCall.function.arguments);

    // Cap. 4.3 — Guardrail post-API
    const sanitized = sanitizeOutput(parsed);
    return json({ analysis: sanitized });
  } catch (e) {
    console.error("analyze-workout error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function buildUserPrompt(args: any): string {
  const { computed, log, profile, recentSameType, allLogsSummary } = args;
  const recent = (recentSameType || [])
    .map(
      (r: any, i: number) =>
        `  ${i + 1}. ${r.distance}km in ${r.duration}min, FC media ${r.hrAvg} (${r.hrPctMax}% FCmax), RPE ${r.rpe}`
    )
    .join("\n") || "  (nessuno storico dello stesso tipo)";

  return `DATI PRE-CALCOLATI (NON RICALCOLARE):

Profilo utente:
- Età ${profile.age} anni, ${profile.weight}kg, ${profile.sex === "M" ? "uomo" : "donna"}
- Livello dichiarato: ${profile.level}
- FC max teorica (Tanaka): ${computed.hrMax} bpm
- 10K recente dichiarato: ${profile.currentBest} min
- Target gara: ${profile.targetTime} min (ritmo gara teorico ${computed.targetPace}/km)

Sessione corrente:
- Tipo dichiarato: ${log.sessionType} (${log.sessionName})
- Distanza: ${log.distance} km
- Durata: ${log.duration} min
- PASSO calcolato: ${computed.paceFormatted}/km
- FC media: ${log.hrAvg} bpm = ${computed.hrPctMax}% FC max
- FC max sessione: ${log.hrMax || "n/d"} bpm
- Karvonen %FCR: ${computed.hrPctReserve}%
- Zona di intensità: ${computed.intensityZone} (${computed.intensityLabel})
- RPE: ${log.rpe}/10
- Cadenza: ${log.cadence || "n/d"} ${log.cadence ? "passi/min" : ""}
- Note utente: ${log.notes ? `"${log.notes}"` : "(vuote)"}

Confronto con target gara:
- Ritmo target: ${computed.targetPace}/km
- Ritmo sessione: ${computed.paceFormatted}/km
- Scostamento: ${computed.paceDeltaSec > 0 ? "+" : ""}${computed.paceDeltaSec}s/km

Ultimi ${(recentSameType || []).length} allenamenti dello stesso tipo (per trend):
${recent}

Sintesi storico completo (${allLogsSummary?.totalSessions || 0} sessioni):
- Stima realistica dai log (proiezione 10K): ${allLogsSummary?.projectedTime || "n/d"} min
- Scostamento dal target dichiarato: ${allLogsSummary?.deltaFromTarget || 0} min

ISTRUZIONI:
1. Scrivi technicalReading, sessionHighlight, nextMove seguendo Cap. 3.4.
2. Per planAdjustment: se la stima realistica differisce dal target di oltre 3 min in modo consistente, suggerisci l'adattamento. Sii onesto: meglio un target raggiungibile che uno irrealistico.
3. Se nelle note ci sono parole su dolore/malessere, in sessionHighlight invita SOLO a consultare un medico.
4. Tutti i numeri che citi devono essere quelli forniti sopra. Non calcolare nulla.`;
}

function sanitizeOutput(parsed: any) {
  const FALLBACK = "I dati sono stati elaborati. Per maggiori dettagli sulla tua sessione, controlla i numeri qui sopra.";
  const fields = ["technicalReading", "sessionHighlight", "nextMove"] as const;
  const sanitized = { ...parsed };

  for (const f of fields) {
    const text = (sanitized[f] || "").toLowerCase();
    if (FORBIDDEN_WORDS.some((w) => text.includes(w))) {
      console.warn(`Guardrail: forbidden word in ${f}`);
      sanitized[f] = FALLBACK;
    }
  }

  if (sanitized.planAdjustment?.message) {
    const t = sanitized.planAdjustment.message.toLowerCase();
    if (FORBIDDEN_WORDS.some((w) => t.includes(w))) {
      sanitized.planAdjustment = { shouldAdjust: false, reason: "", newTargetEstimate: null, message: "" };
    }
  }

  return sanitized;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
