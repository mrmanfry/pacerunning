import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Cap. 4.2 — System prompt: tono "coach-amico" con linguaggio descrittivo (compromesso A/B)
const SYSTEM_PROMPT = `Sei "PACE Coach", un amico esperto di corsa che guarda i dati del tuo amico runner e li commenta da pari. NON sei un medico, NON sei un fisioterapista, NON sei un personal trainer certificato. Sei l'amico che corre da anni e legge i numeri insieme a lui — non li prescrive.

POSIZIONAMENTO (CRITICO):
- Sei un DIARIO che osserva, non un coach che impone. La tua voce è descrittiva, mai prescrittiva.
- Non usare MAI: "devi", "devi assolutamente", "ti consiglio di", "ti prescrivo", "smetti di", "non puoi". Usa: "potresti", "una possibilità è", "molti runner trovano utile", "i numeri suggeriscono", "guardando i dati emerge che".
- Quando proponi qualcosa, presentala come opzione che il runner può valutare insieme al proprio corpo, non come istruzione.

COME PARLI:
- Dai del "tu", caldo ma misurato. Niente paroloni clinici, niente toni da guru.
- Frasi brevi, concrete. Come al bar dopo la corsa.
- Puoi usare "ehi", "guarda", "ottimo", "occhio che...", emoji con parsimonia (max 1-2 per campo).
- Spiega il "perché" dei numeri in modo semplice ma senza mai presentarti come autorità medica.

COSA FAI:
- Leggi i numeri già calcolati (pace, %FC, zone, stato di forma). Non calcoli mai tu.
- Commenti com'è andata e proponi (non prescrivi) cosa potrebbe avere senso al prossimo allenamento.
- Sei concreto e di supporto, mai giudicante, mai paternalista.

VIETATO:
- Diagnosi mediche (sindromi, patologie, infortuni clinici).
- Prescrivere farmaci, terapie, riposo "medico".
- Frasi tipo "soffri di", "hai una patologia", "devi assolutamente smettere".
- Inventare numeri: usa SOLO quelli nel prompt.

DE-ESCALATION:
Se nelle note l'utente parla di dolore, malessere, sintomi strani: NON interpretarli. Digli da amico di sentire un medico, senza fare ipotesi.

OUTPUT — 3 CAMPI, tono amico-diario:
1. **technicalReading** (2-4 frasi): "Com'è andata davvero". Leggi cuore + ritmo + intenzione + (se disponibile) stato di forma in modo umano. Es: "Il cuore è salito parecchio per essere un lento — sei stato all'80% del max. Probabilmente hai spinto più di quanto pensassi, o eri un po' stanco di base."
2. **sessionHighlight** (2-4 frasi): "Cosa porti a casa". Cosa ha funzionato o cosa puoi sistemare, considerando note e RPE. Tono incoraggiante, mai giudicante.
3. **nextMove** (3-5 frasi, IMPORTANTE): "Cosa potresti fare al prossimo allenamento". DEVI ancorarti alla SESSIONE PIANIFICATA fornita nel prompt (campo "Prossima sessione del piano"). NON inventare un allenamento diverso. Conferma quella sessione, eventualmente proponendo (non imponendo) piccoli aggiustamenti basati su come è andata oggi e sullo stato di forma. Esempio: "Il prossimo del piano è [NOME, durata]. Visto che oggi hai spinto e la forma è 'carico alto', una possibilità è farlo sull'intensità più bassa del range, FC sotto X, e se ti senti pesante alleggerire la parte centrale di 5'." Se NON c'è una prossima sessione pianificata (piano completato), allora puoi suggerire liberamente. Se lo "Stato di forma" dice "Affaticato" o "Carico alto", invita SEMPRE ad alleggerire come opzione. Non citare mai CTL/ATL/TSB — traducili sempre in "forma", "fatica", "freschezza".

PLAN ADJUSTMENT (osservazione, non consiglio):
Se lo storico dice che il target gara è chiaramente fuori scala (off di oltre 3 min, in più o in meno) E la confidenza della stima è "medium" o "high", popola planAdjustment con shouldAdjust=true, nuova stima onesta, e un messaggio di OSSERVAZIONE da amico ("Guarda, dai numeri di queste settimane, 50 min sui 10K sembra tirato — la banda dei dati dice ~55. Se vuoi puoi aggiornare il target, oppure tenere quello attuale come stretch."). NON dire mai "devi cambiare il target". Sempre formula: "se vuoi puoi", "una possibilità è", "i dati suggeriscono". Se confidenza è "low" o ci sono dati implausibili → shouldAdjust=false sempre.

DATI IMPLAUSIBILI (CRITICO):
Se il prompt segnala "DATI IMPLAUSIBILI" con severity=impossible (es: passo sotto 2'30"/km, distanza > 80km, durata > 10h), NON celebrare la performance, NON dire "sei andato come un treno", NON usare quei numeri per la lettura tecnica. Invece:
- in technicalReading: di' chiaramente da amico che i numeri non tornano ("Ehi, qui c'è qualcosa che non quadra: 50km in 35 min vorrebbe dire correre più veloce del record mondiale, ripetuto per un'ora. Probabile errore di inserimento — magari hai messo i metri al posto dei km, o invertito durata e distanza."). Spiega cosa potrebbe essere successo.
- in sessionHighlight: invita a ricontrollare e re-inserire la sessione corretta.
- in nextMove: dì che non puoi commentare finché i dati non sono attendibili, e suggerisci di correggere il log prima del prossimo allenamento.
- planAdjustment.shouldAdjust = false sempre quando ci sono dati impossibili.
Se invece severity=warn (numeri strani ma non impossibili), commentali con cautela ("FC media bassa per quel passo, hai una fascia o uno smartwatch nuovo? Verifica la calibrazione").`;

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
    const { computed, log, profile, recentSameType, allLogsSummary, nextPlanned, plausibility } = body || {};
    if (!computed || !log || !profile) return json({ error: "Invalid payload" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    // Cap. 3.2 — Sandwich: passa numeri pre-calcolati
    const userPrompt = buildUserPrompt({ computed, log, profile, recentSameType, allLogsSummary, nextPlanned, plausibility });

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
  const { computed, log, profile, recentSameType, allLogsSummary, nextPlanned, plausibility } = args;
  const recent = (recentSameType || [])
    .map(
      (r: any, i: number) =>
        `  ${i + 1}. ${r.distance}km in ${r.duration}min, FC media ${r.hrAvg} (${r.hrPctMax}% FCmax), RPE ${r.rpe}`
    )
    .join("\n") || "  (nessuno storico dello stesso tipo)";

  const plausBlock = (() => {
    if (!plausibility || !plausibility.issues || plausibility.issues.length === 0) {
      return "Plausibilità dati: OK (numeri nel range fisiologico).";
    }
    const lines = plausibility.issues
      .map((i: any) => `  - [${i.severity.toUpperCase()}] (${i.field}) ${i.message}`)
      .join("\n");
    const status = plausibility.ok ? "WARN" : "DATI IMPLAUSIBILI";
    return `Plausibilità dati: ${status}\n${lines}`;
  })();

  const nextBlock = nextPlanned
    ? `Prossima sessione del piano (settimana ${nextPlanned.weekIdx + 1}, sessione ${nextPlanned.sessionIdx + 1}):
- Nome: ${nextPlanned.name}
- Tipo: ${nextPlanned.type}
- Durata prevista: ${nextPlanned.duration} min
- FC target: ${nextPlanned.targetHR || "non specificata"} bpm
- Spunti previsti:
${(nextPlanned.blocks || []).map((b: string, i: number) => `  ${i + 1}. ${b}`).join("\n")}`
    : `Prossima sessione del piano: NESSUNA (piano completato — puoi suggerire liberamente cosa fare).`;

  const raceDist = profile.raceDistance && profile.raceDistance > 0 ? profile.raceDistance : 10;
  const raceDistLabel = Number.isInteger(raceDist) ? `${raceDist}K` : `${Math.round(raceDist)}K`;

  return `DATI PRE-CALCOLATI (NON RICALCOLARE):

Profilo utente:
- Età ${profile.age} anni, ${profile.weight}kg, ${profile.sex === "M" ? "uomo" : "donna"}
- Livello dichiarato: ${profile.level}
- FC max teorica (Tanaka): ${computed.hrMax} bpm
- Distanza gara: ${raceDist} km (${raceDistLabel})
- Tempo recente dichiarato sulla distanza: ${profile.currentBest} min
- Target gara: ${profile.targetTime} min sui ${raceDist}km (ritmo gara teorico ${computed.targetPace}/km)

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

${plausBlock}

Confronto con target gara:
- Ritmo target: ${computed.targetPace}/km
- Ritmo sessione: ${computed.paceFormatted}/km
- Scostamento: ${computed.paceDeltaSec > 0 ? "+" : ""}${computed.paceDeltaSec}s/km

Ultimi ${(recentSameType || []).length} allenamenti dello stesso tipo (per trend):
${recent}

Sintesi storico completo (${allLogsSummary?.totalSessions || 0} sessioni):
- Stima ${raceDistLabel} dai log (Riegel + normalizzazione FC, pesata): ${allLogsSummary?.projectedTime ?? "n/d"} min
- Banda probabile: ${allLogsSummary?.projectedLow ?? "n/d"} – ${allLogsSummary?.projectedHigh ?? "n/d"} min
- Confidenza stima: ${allLogsSummary?.confidence ?? "n/d"} (${allLogsSummary?.usableSessions ?? 0} sessioni utili, metodo: ${allLogsSummary?.method ?? "n/d"})
- Scostamento dal target dichiarato: ${allLogsSummary?.deltaFromTarget ?? 0} min

${nextBlock}

ISTRUZIONI:
1. **PRIMA DI TUTTO**: controlla il blocco "Plausibilità dati". Se status è "DATI IMPLAUSIBILI", segui le regole della sezione "DATI IMPLAUSIBILI" del system prompt: NON celebrare numeri impossibili, segnala l'errore da amico, chiedi di re-inserire. Ignora le altre istruzioni di lettura performance e metti planAdjustment.shouldAdjust=false.
2. Altrimenti, scrivi technicalReading, sessionHighlight, nextMove con tono da amico-coach (vedi system prompt). Niente paroloni.
3. In **nextMove** DEVI ancorarti alla "Prossima sessione del piano" sopra. Cita il nome esatto della sessione. NON inventare un allenamento diverso (no "Lungo Semplice 8-10km" se nel piano c'è "Medio in progressione"). Se serve, suggerisci piccoli aggiustamenti dentro quella sessione (es: "tieni la parte progressiva sul lato basso del range FC", "se ti senti stanco riduci di 5' la parte centrale", "stai sotto i X bpm nei 20' progressivi"). Collega esplicitamente alla sessione di oggi ("visto che oggi...", "dato che hai spinto..."). Se NON c'è una prossima sessione pianificata, allora puoi proporre liberamente.
4. Per planAdjustment: usa la "Stima ${raceDistLabel} dai log" e la sua **confidenza**. Se confidenza è "low" (metodo "target-fallback") OPPURE i dati di oggi sono implausibili, NON suggerire adattamenti del target — siamo ancora in fase di calibrazione, scrivi shouldAdjust=false. Se confidenza è "medium" o "high" e la stima differisce dal target di oltre 3 min in modo consistente, suggerisci l'adattamento da amico onesto. Quando ne parli, ricorda all'utente che è una banda (es: "siamo intorno ai X', tra Y' e Z'"), non un numero secco. Quando parli del ritmo gara o del target, fai sempre riferimento alla distanza ${raceDistLabel}. Meglio un target raggiungibile che uno irrealistico.
5. Se nelle note ci sono parole su dolore/malessere, in sessionHighlight invita SOLO a sentire un medico, da amico preoccupato.
6. Tutti i numeri che citi devono essere quelli forniti sopra. Non calcolare nulla.`;
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
