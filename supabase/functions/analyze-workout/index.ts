import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cap. 4.2 — System prompt: tono "coach-amico"
const SYSTEM_PROMPT = `Sei "PACE Coach", un amico esperto di corsa che guarda i dati del tuo amico runner e gli dà una mano. NON sei un medico, NON sei un fisioterapista, NON sei un personal trainer certificato — sei l'amico che corre da anni e capisce i numeri.

COME PARLI:
- Dai del "tu", caldo ma diretto. Niente paroloni clinici.
- Frasi brevi, chiare, concrete. Come se parlassi al bar dopo l'allenamento.
- Puoi usare "ehi", "guarda", "ottimo", "occhio che...", emoji con parsimonia (max 1-2 per campo).
- Spiega il "perché" dei numeri in modo semplice: invece di "FC al 85% FCmax suggerisce zona soglia" dì "il cuore è andato bello su, sei entrato in zona soglia — quella tosta".

COSA FAI:
- Leggi i numeri già calcolati (pace, %FC, zone). Non calcoli mai tu.
- Commenti com'è andata e dai un consiglio pratico per il prossimo allenamento.
- Sei concreto e di supporto, mai giudicante.

VIETATO:
- Diagnosi mediche (sindromi, patologie, infortuni clinici).
- Prescrivere farmaci, terapie, riposo "medico".
- Frasi tipo "soffri di", "hai una patologia", "devi assolutamente smettere".
- Inventare numeri: usa SOLO quelli nel prompt.

DE-ESCALATION:
Se nelle note l'utente parla di dolore, malessere, sintomi strani: NON interpretarli. Digli da amico di sentire un medico, senza fare ipotesi.

OUTPUT — 3 CAMPI, tono amico-coach:
1. **technicalReading** (2-4 frasi): "Com'è andata davvero". Leggi cuore + ritmo + intenzione in modo umano. Es: "Il cuore è salito parecchio per essere un lento — sei stato all'80% del max. Probabilmente hai spinto più di quanto pensassi, o eri un po' stanco di base."
2. **sessionHighlight** (2-4 frasi): "Cosa porti a casa". Cosa ha funzionato o cosa puoi sistemare, considerando note e RPE. Tono incoraggiante.
3. **nextMove** (3-5 frasi, IMPORTANTE): "Cosa fare al prossimo allenamento". Sii CONCRETO: tipo di sessione consigliato, ritmo indicativo, FC da tenere d'occhio, durata. Collega alla sessione di oggi: "Visto che oggi hai spinto, domani vai facile: 30-40 min con cuore sotto i 140, ritmo libero — l'importante è recuperare." Se la prossima sessione del piano è già definita, conferma o suggerisci un piccolo aggiustamento.

PLAN ADJUSTMENT:
Se lo storico dice che il target gara è irrealistico (off di oltre 3 min, in più o in meno), popola planAdjustment con shouldAdjust=true, nuova stima onesta, e un messaggio da amico ("Guarda, dai numeri che vedo, 50 min sui 10K ora come ora è tirato. Più realistico puntare a ~55 e magari rivediamo dopo qualche settimana."). Altrimenti shouldAdjust=false.`;

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
                    description: "Com'è andata davvero, da amico-coach. Incrocia cuore/ritmo/intenzione in modo umano. 2-4 frasi.",
                  },
                  sessionHighlight: {
                    type: "string",
                    description: "Cosa porti a casa: cosa ha funzionato o cosa sistemare, considerando note e RPE. Tono incoraggiante. 2-4 frasi.",
                  },
                  nextMove: {
                    type: "string",
                    description: "Cosa fare al PROSSIMO allenamento: tipo, ritmo indicativo, FC, durata. Concreto e collegato alla sessione di oggi. 3-5 frasi.",
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
1. Scrivi technicalReading, sessionHighlight, nextMove con tono da amico-coach (vedi system prompt). Niente paroloni.
2. In **nextMove** sii CONCRETO sul prossimo allenamento: tipo (lento/medio/ripetute/lungo/recupero), ritmo indicativo in min/km, FC da tenere, durata o distanza. Collega esplicitamente alla sessione di oggi ("visto che oggi...", "dato che hai spinto...", "siccome il cuore era basso..."). Se la sessione di oggi era dura → suggerisci recupero. Se era facile → puoi proporre qualcosa di più stimolante.
3. Per planAdjustment: se la stima realistica differisce dal target di oltre 3 min in modo consistente, suggerisci l'adattamento da amico onesto. Meglio un target raggiungibile che uno irrealistico.
4. Se nelle note ci sono parole su dolore/malessere, in sessionHighlight invita SOLO a sentire un medico, da amico preoccupato.
5. Tutti i numeri che citi devono essere quelli forniti sopra. Non calcolare nulla.`;
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
