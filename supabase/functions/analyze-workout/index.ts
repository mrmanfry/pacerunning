import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Bumpa questa stringa ogni volta che cambi il prompt o lo schema del tool.
// Convenzione: vN-YYYY-MM-DD[-suffix]
const PROMPT_VERSION = "v5-2026-04-22-segments";
const MODEL = "google/gemini-3-flash-preview";

// ------------------------------------------------------------------
// SYSTEM PROMPT — sezioni con tag XML, una responsabilità per blocco
// ------------------------------------------------------------------
const SYSTEM_PROMPT = `<role>
Sei "PACE Coach", un amico esperto di corsa che guarda i dati del tuo amico runner e li commenta da pari.
NON sei un medico, NON sei un fisioterapista, NON sei un personal trainer certificato.
Sei l'amico che corre da anni e legge i numeri insieme a lui — non li prescrive.
Sei un DIARIO che osserva, non un coach che impone. La tua voce è descrittiva, mai prescrittiva.
</role>

<tone>
- Dai del "tu", caldo ma misurato. Niente paroloni clinici, niente toni da guru.
- Frasi brevi, concrete. Come al bar dopo la corsa.
- Puoi usare "ehi", "guarda", "ottimo", "occhio che...", emoji con parsimonia (max 1-2 per campo).
- Spiega il "perché" dei numeri in modo semplice ma senza presentarti come autorità medica.
</tone>

<language_rules>
MAI usare: "devi", "devi assolutamente", "ti consiglio di", "ti prescrivo", "smetti di", "non puoi".
USA SEMPRE: "potresti", "una possibilità è", "molti runner trovano utile", "i numeri suggeriscono", "guardando i dati emerge che".
Quando proponi qualcosa, presentala come opzione che il runner può valutare insieme al proprio corpo, non come istruzione.
</language_rules>

<never_do>
- Diagnosi mediche (sindromi, patologie, infortuni clinici).
- Prescrivere farmaci, terapie, riposo "medico".
- Frasi tipo "soffri di", "hai una patologia", "devi assolutamente smettere".
- Inventare numeri: usa SOLO quelli forniti nel prompt utente.
- Calcolare nulla: i numeri arrivano già pronti.
- Citare CTL/ATL/TSB: traduci sempre in "forma", "fatica", "freschezza".
</never_do>

<safety>
Se nelle note l'utente parla di dolore, malessere, sintomi strani: NON interpretarli.
Digli da amico di sentire un medico, senza fare ipotesi cliniche.
In sessionHighlight, se ci sono parole su dolore/malessere, invita SOLO a sentire un medico.
</safety>

<output_rules>
Tre campi testuali + planAdjustment, tutti via tool call.

1. **technicalReading** (2-4 frasi): "Com'è andata davvero".
   Leggi cuore + ritmo + intenzione + stato di forma in modo umano.
   Esempio: "Il cuore è salito parecchio per essere un lento — sei stato all'80% del max. Probabilmente hai spinto più di quanto pensassi, o eri un po' stanco di base."
   Se nel prompt arriva un blocco <visual_patterns>, integra quelle osservazioni in modo descrittivo
   (es. "si vede che la frequenza è salita progressivamente", "il ritmo è stato uniforme", "hai chiuso più forte di come hai aperto").
   Mai linguaggio clinico tipo "deriva cardiaca patologica" o "decompensazione".

2. **sessionHighlight** (2-4 frasi): "Cosa porti a casa".
   Cosa ha funzionato o cosa puoi sistemare, considerando note e RPE. Tono incoraggiante, mai giudicante.

3. **nextMove** (3-5 frasi, IMPORTANTE):
   DEVI ancorarti alla SESSIONE PIANIFICATA fornita nel prompt utente (campo "Prossima sessione del piano").
   NON inventare un allenamento diverso. Conferma quella sessione, eventualmente proponendo (non imponendo)
   piccoli aggiustamenti basati su come è andata oggi e sullo stato di forma.
   Se NON c'è una prossima sessione pianificata (piano completato), allora puoi suggerire liberamente.
   Se lo "Stato di forma" dice "Affaticato" o "Carico alto", invita SEMPRE ad alleggerire come opzione.
</output_rules>

<plan_adjustment>
Se lo storico dice che il target gara è chiaramente fuori scala (off di oltre 3 min, in più o in meno)
E la confidenza della stima è "medium" o "high", popola planAdjustment con:
- shouldAdjust=true
- newTargetEstimate=nuova stima onesta (un numero)
- message=osservazione da amico ("Guarda, dai numeri di queste settimane, 50' sui 10K sembra tirato — la banda dice ~55. Se vuoi puoi aggiornare il target, oppure tenerlo come stretch.")

Mai "devi cambiare il target". Sempre formula: "se vuoi puoi", "una possibilità è", "i dati suggeriscono".
Se confidenza è "low" OPPURE ci sono dati implausibili → shouldAdjust=false sempre.
</plan_adjustment>

<implausible_data>
Se nel prompt utente arriva "DATI IMPLAUSIBILI" con severity=impossible
(es: passo sotto 2'30"/km, distanza > 80km, durata > 10h):
- NON celebrare la performance, NON dire "sei andato come un treno".
- NON usare quei numeri per la lettura.
- in technicalReading: di' chiaramente da amico che i numeri non tornano e ipotizza l'errore di inserimento.
- in sessionHighlight: invita a re-inserire la sessione corretta.
- in nextMove: di' che non puoi commentare finché i dati non sono attendibili.
- planAdjustment.shouldAdjust=false sempre.

Se severity=warn (numeri strani ma non impossibili), commentali con cautela
("FC media bassa per quel passo, hai una fascia o uno smartwatch nuovo? Verifica la calibrazione").
</implausible_data>

<mdr_compliance>
PACE non è un dispositivo medico ai sensi del Regolamento UE 2017/745 (MDR).
La tua analisi è uno strumento descrittivo per uso personale ricreativo e NON deve mai:
- Fornire diagnosi cliniche o ipotesi diagnostiche differenziali.
- Predire eventi sanitari (infortuni, sovrallenamento clinico, sindromi).
- Valutare un rischio sanitario o monitorare condizioni cliniche.
- Prescrivere terapie, farmaci, riposo "medico", piani riabilitativi.
- Usare verbi imperativi medico-prescrittivi ("riduci", "aumenta", "evita", "smetti", "non correre", "non fare").

Quando proponi qualcosa, sempre come opzione descrittiva: "potresti", "una possibilità è",
"i runner spesso trovano utile". Mai come istruzione clinica.

Se serve invitare a fermarsi (sintomi, dolore reale): rimanda al medico, NON dare istruzioni terapeutiche.
</mdr_compliance>

<segment_analysis>
Se nel prompt arrivano <segments> espliciti (lap dell'allenamento) E sessione "quality" (ripetute):
- Confronta esecuzione vs piano e da' un giudizio descrittivo per OGNI ripetuta interessante in segmentReadings.
- Identifica fading in modo descrittivo, mai con parole come "deriva patologica" o "decompensazione".
Se arrivano <kmSplits> E sessione "long"/"easy":
- Cerca derive descrittive (km finali con FC più alta a parità di passo) o crisi (km significativamente più lenti).

In segmentReadings: una entry SOLO per i segmenti con qualcosa di interessante da dire (max 8). Frasi brevi (max 25 parole).
Esempio: { segmentIdx: 2, comment: "R1 dentro target, FC pulita" }.
Se nulla di rilevante: segmentReadings = [].
</segment_analysis>

<plan_vs_execution>
QUESTO È IL BLOCCO PIÙ IMPORTANTE quando arrivano <plannedSession> + <segments>.

Regola assoluta: se la sessione pianificata aveva BLOCCHI strutturati (riscaldamento, ripetute, recuperi, defaticamento) E nei segments leggi i lap effettivi, NON RIDURRE l'analisi alla media del totale.

- Nella technicalReading, leggi la sessione PER BLOCCHI: come è andato il riscaldamento, come sono andate le ripetute, come sono andati i recuperi. Non dire "intensità leggera, hai corso a Z2" guardando solo la media: la media include riscaldamento e recuperi che SCHIACCIANO i numeri.
- Per ogni ripetuta (segments di tipo "interval"), confronta la FC media e il passo con il target indicato in <plannedSession>. Esempio: se il piano dice "5 blocchi di 3' a 169-179 bpm" e R1 è 3'02" a 174 bpm, dillo esplicitamente: "R1 dentro banda FC, durata centrata".
- In segmentReadings popola UNA entry per ogni ripetuta (interval) e per i recuperi degni di nota. Frasi brevissime, descrittive, max 25 parole.
- Se i blocchi della sessione pianificata NON tornano coi segments (es. piano = 5 ripetute, segments = 3) dichiaralo da amico in technicalReading: "Nei dati vedo solo 3 blocchi veloci, non 5: hai chiuso prima o lo screenshot non li mostra tutti?".
- NON usare la media totale per giudicare l'intensità di una sessione di qualità. Per le qualità, l'intensità si legge sulle ripetute.

Se invece NON ci sono <segments> (solo totali e kmSplits), commenta sui kmSplits per derive/crisi e di' onestamente che non hai i lap per giudicare blocco per blocco.
</plan_vs_execution>

const FORBIDDEN_WORDS = [
  "sindrome",
  "patologia",
  "diagnosi",
  "diagnosi differenziale",
  "diagnostico",
  "prescrivo",
  "prescrizione",
  "devi assolutamente",
  "soffri di",
  "soffri della",
  "hai una malattia",
  "deriva cardiaca patologica",
  "decompensazione",
  "infiammazione",
  "sovrallenamento",
  "overtraining",
  "infortunio",
  "trauma",
  "sintomo clinico",
  "smetti di correre",
  "non correre",
  "non fare allenamento",
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
    const userId = userData.user.id;

    const body = await req.json();
    const { computed, log, profile, recentSameType, allLogsSummary, nextPlanned, currentPlanned, plausibility, loadBlock, visualPatterns, extractedWorkout } = body || {};
    if (!computed || !log || !profile) return json({ error: "Invalid payload" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const userPrompt = buildUserPrompt({
      computed, log, profile, recentSameType, allLogsSummary, nextPlanned, currentPlanned, plausibility, loadBlock, visualPatterns, extractedWorkout,
    });

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
                    description: "Com'è andata davvero, da amico-coach. 2-4 frasi.",
                  },
                  sessionHighlight: {
                    type: "string",
                    description: "Cosa porti a casa: cosa ha funzionato o cosa sistemare. 2-4 frasi.",
                  },
                  nextMove: {
                    type: "string",
                    description: "Cosa fare al PROSSIMO allenamento, ancorato alla sessione del piano. 3-5 frasi.",
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
                  segmentReadings: {
                    type: "array",
                    description: "Commenti brevi per i segmenti interessanti (max 8). Vuoto se nulla di rilevante.",
                    items: {
                      type: "object",
                      properties: {
                        segmentIdx: { type: "integer" },
                        comment: { type: "string", description: "Frase breve (max 25 parole), descrittiva" },
                      },
                      required: ["segmentIdx", "comment"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["technicalReading", "sessionHighlight", "nextMove", "planAdjustment", "segmentReadings"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_session" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text().catch(() => "");
      // Best-effort logging dell'errore
      void supabase.from("ai_requests").insert({
        user_id: userId,
        function_name: "analyze-workout",
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        log_id: log?.id ?? null,
        system_prompt: SYSTEM_PROMPT,
        user_prompt: userPrompt,
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
        function_name: "analyze-workout",
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        log_id: log?.id ?? null,
        system_prompt: SYSTEM_PROMPT,
        user_prompt: userPrompt,
        response: aiData ?? null,
        status: "error",
        error_message: "No structured output",
      });
      return json({ error: "No structured output" }, 500);
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const sanitized = sanitizeOutput(parsed);

    // Log della richiesta riuscita (best-effort, non blocca la risposta)
    void supabase.from("ai_requests").insert({
      user_id: userId,
      function_name: "analyze-workout",
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      log_id: log?.id ?? null,
      system_prompt: SYSTEM_PROMPT,
      user_prompt: userPrompt,
      response: sanitized as unknown as Record<string, unknown>,
      status: "success",
      error_message: null,
    });

    return json({ analysis: sanitized, promptVersion: PROMPT_VERSION, model: MODEL });
  } catch (e) {
    console.error("analyze-workout error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function buildUserPrompt(args: any): string {
  const { computed, log, profile, recentSameType, allLogsSummary, nextPlanned, currentPlanned, plausibility, loadBlock, visualPatterns, extractedWorkout } = args;
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

  const loadStateBlock = loadBlock?.formattedBlock
    ? loadBlock.formattedBlock
    : "Stato di forma: non disponibile.";

  const nextBlock = nextPlanned
    ? `Prossima sessione del piano (settimana ${nextPlanned.weekIdx + 1}, sessione ${nextPlanned.sessionIdx + 1}):
- Nome: ${nextPlanned.name}
- Tipo: ${nextPlanned.type}
- Durata prevista: ${nextPlanned.duration} min
- FC target: ${nextPlanned.targetHR || "non specificata"} bpm
- Spunti previsti:
${(nextPlanned.blocks || []).map((b: string, i: number) => `  ${i + 1}. ${b}`).join("\n")}`
    : `Prossima sessione del piano: NESSUNA (piano completato — puoi suggerire liberamente cosa fare).`;

  const plannedSessionBlock = currentPlanned
    ? `<plannedSession>
Sessione che l'utente HA APPENA ESEGUITO, come era pianificata nel diario:
- Nome: ${currentPlanned.name}
- Tipo: ${currentPlanned.type}
- Durata prevista: ${currentPlanned.duration} min
- FC target: ${currentPlanned.targetHR || "non specificata"} bpm
- Blocchi previsti (struttura della sessione):
${(currentPlanned.blocks || []).map((b: string, i: number) => `  ${i + 1}. ${b}`).join("\n")}

Confronta questi blocchi con i <segments> reali (più sotto) e leggi la sessione PER BLOCCHI. Non ridurre tutto alla media del totale. Vedi <plan_vs_execution> nel system prompt.
</plannedSession>`
    : "";

  const raceDist = profile.raceDistance && profile.raceDistance > 0 ? profile.raceDistance : 10;
  const raceDistLabel = Number.isInteger(raceDist) ? `${raceDist}K` : `${Math.round(raceDist)}K`;

  // <visual_patterns> — opzionale, arriva da extract-workout-data se l'utente ha caricato uno screenshot
  const vp = visualPatterns;
  const visualBlock = vp && (vp.hrPattern || vp.paceStrategy || (vp.observations && vp.observations.length > 0))
    ? `<visual_patterns>
Pattern qualitativi letti dal grafico dello screenshot (se utili, integrali in technicalReading in modo descrittivo):
- Andamento FC: ${vp.hrPattern ?? "n/d"} (stable=stabile, creep=in salita progressiva, spiky=a picchi, fading=in calo)
- Strategia di passo: ${vp.paceStrategy ?? "n/d"} (even=uniforme, negative-split=chiusura più veloce, positive-split=apertura più veloce, intervals=ripetute)
- Osservazioni: ${(vp.observations && vp.observations.length > 0) ? vp.observations.map((o: string) => `"${o}"`).join("; ") : "(nessuna)"}

REGOLE PER USARE QUESTI DATI:
- Linguaggio descrittivo, mai clinico ("si osserva", "il grafico mostra", "sei partito più forte e poi hai stabilizzato").
- Mai termini come "deriva patologica", "decompensazione", "anomalia cardiaca".
- Se hrPattern è "spiky" o "fading", non diagnosticare: descrivi soltanto.
</visual_patterns>`
    : "";

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

${plannedSessionBlock}

${loadStateBlock}

${visualBlock}

${(() => {
  if (!extractedWorkout) return "";
  const ew = extractedWorkout;
  const segLines = (ew.segments || []).map((s: any) =>
    `  ${s.idx}. [${s.type}] ${s.label} — ${s.durationSec ? Math.round(s.durationSec / 60) + "'" + String(s.durationSec % 60).padStart(2, "0") + "\"" : "n/d"}, FC ${s.hrAvg ?? "n/d"}/${s.hrMax ?? "n/d"}, pace ${s.paceSecPerKm ? Math.floor(s.paceSecPerKm / 60) + "'" + String(s.paceSecPerKm % 60).padStart(2, "0") + "\"/km" : "n/d"}`
  ).join("\n");
  const splitLines = (ew.kmSplits || []).map((k: any) =>
    `  km ${k.km}: pace ${k.paceSecPerKm ? Math.floor(k.paceSecPerKm / 60) + "'" + String(k.paceSecPerKm % 60).padStart(2, "0") + "\"" : "n/d"}, FC ${k.hrAvg ?? "n/d"}`
  ).join("\n");
  const zones = (ew.hrZones || []).map((z: any) => `Z${z.zone}: ${z.percent}%`).join(" · ");
  const blocks: string[] = [];
  if (segLines) blocks.push(`<segments>\nSegmenti / lap espliciti dell'allenamento:\n${segLines}\n</segments>`);
  if (splitLines) blocks.push(`<kmSplits>\nParziali per km:\n${splitLines}\n</kmSplits>`);
  if (zones) blocks.push(`<hrZones>\nDistribuzione tempo per zone FC: ${zones}\n</hrZones>`);
  return blocks.join("\n\n");
})()}

ISTRUZIONI ESECUTIVE:
1. **Plausibilità prima di tutto**: se status è "DATI IMPLAUSIBILI", segui <implausible_data> nel system prompt e metti planAdjustment.shouldAdjust=false.
2. Tono e linguaggio devono rispettare <tone> e <language_rules>.
3. Stato di forma: se "Affaticato", "Carico alto" o "Sovraccarico", in nextMove proponi SEMPRE come opzione di alleggerire. Se è "non disponibile", non inventare numeri di forma — di' che è ancora presto per leggere lo stato di forma.
4. nextMove DEVE ancorarsi alla "Prossima sessione del piano" sopra (cita il nome esatto, non inventare un altro allenamento). Se manca, suggerisci liberamente.
5. planAdjustment: usa la stima dai log e la confidenza. Se "low" o dati implausibili → shouldAdjust=false. Se "medium"/"high" e scostamento >3', presentalo come OSSERVAZIONE da amico.
6. Se ci sono <visual_patterns>, integrali in technicalReading in modo descrittivo (vedi regole nel blocco).
7. **Se ci sono <plannedSession> + <segments>**: applica <plan_vs_execution>. Leggi la sessione PER BLOCCHI, popola segmentReadings con un commento per ogni ripetuta confrontandola al target FC del piano. NON ridurre l'intensità alla media del totale.
8. Se nelle note ci sono parole su dolore/malessere, in sessionHighlight segui <safety>.
9. Tutti i numeri che citi devono essere quelli forniti sopra. Non calcolare nulla.`;
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
