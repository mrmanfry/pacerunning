

# Estrazione profonda screenshot — da 5 numeri a dataset segmentato

Hai ragione: oggi diamo `gemini-2.5-flash` (o `pro` come fallback) un'immagine ricca e gli chiediamo 5 numeri. Spreco di modello e spreco dei tuoi dati. Apple Fitness, Strava, Garmin mostrano: **lap-by-lap**, **grafico FC tempo per tempo**, **grafico passo**, **split km, segmenti, zone HR**. Tutto questo serve per un'analisi vera.

## Filosofia

> Lo screenshot è un documento ricco. Estraiamo TUTTO una volta, lo conserviamo strutturato, poi più analisi (qualitativa, di aderenza al piano, di derive, di esecuzione delle ripetute) leggono quel dataset.

Niente RAG vero (overkill ora): basta un **dataset strutturato persistente per workout** e analisi specializzate che lo leggono.

## Cosa estraiamo (nuovo schema "ExtractedWorkout")

```text
{
  // metriche già estratte oggi
  totals: { duration, distance, hrAvg, hrMax, cadence, calories, elevGain }

  // NUOVO: split per km
  kmSplits: [
    { km: 1, paceSecPerKm: 318, hrAvg: 152, hrMax: 161, elevDelta: 4 },
    { km: 2, ... }
  ]

  // NUOVO: segmenti / lap (riscaldamento, ripetute, recuperi, defaticamento)
  segments: [
    { idx: 1, label: "riscaldamento", durationSec: 600, distanceKm: 1.8,
      paceSecPerKm: 360, hrAvg: 140, hrMax: 152, type: "warmup" },
    { idx: 2, label: "ripetuta 1", durationSec: 180, distanceKm: 0.78,
      paceSecPerKm: 230, hrAvg: 172, hrMax: 178, type: "interval" },
    { idx: 3, label: "recupero 1", durationSec: 120, ..., type: "recovery" },
    ...
  ]

  // NUOVO: serie temporale FC ricostruita dal grafico
  hrSeries: { samplingHintSec: 30,
              points: [{tSec: 0, hr: 95}, {tSec: 30, hr: 118}, ...] }

  // NUOVO: serie temporale passo (se grafico passo presente)
  paceSeries: { points: [{tSec: 0, paceSecPerKm: 380}, ...] }

  // NUOVO: zone FC se l'app le mostra
  hrZones: [{ zone: 1, percent: 12 }, { zone: 2, percent: 45 }, ...]

  // pattern qualitativi (già oggi)
  visualPatterns: { hrPattern, paceStrategy, observations }

  // meta
  detectedApp, confidence, sourceImagesUsed
}
```

Tutti i blocchi opzionali: se lo screenshot non li mostra, restano vuoti. Mai inventati.

## Architettura — due chiamate AI invece di una

Una sola call multimodale che estrae TUTTO è fragile (token output esplodono, rischio di hallucination). Splittiamo:

```text
┌─────────────────────────────────────────────────────────────┐
│ Edge Function: extract-workout-data (riscritta)             │
│                                                             │
│ STEP 1 — Triage (gemini-2.5-flash, veloce ~1s)              │
│   Per ogni immagine:                                        │
│   "Cosa contiene?" → tag tra:                               │
│     summary | kmSplits | segments | hrChart | paceChart     │
│     | hrZones | other                                       │
│   Output: mappa imageIdx → tipi presenti                    │
│                                                             │
│ STEP 2 — Estrazione mirata (gemini-2.5-pro, deep)           │
│   UNA sola chiamata multimodale con TUTTE le immagini, ma   │
│   il tool schema è ricco (totals + kmSplits + segments +    │
│   hrSeries + paceSeries + hrZones + visualPatterns).        │
│   System prompt dice quale immagine guardare per cosa,      │
│   usando la mappa STEP 1 come hint.                         │
│                                                             │
│ STEP 3 — Validazione deterministica (TS, no AI)             │
│   - somma durate segmenti ≈ duration totale?                │
│   - somma km splits ≈ distance totale?                      │
│   - hrAvg coerente con media pesata segmenti?               │
│   Se fail grave → flag plausibility issue, non blocchiamo.  │
└─────────────────────────────────────────────────────────────┘
```

Costo: ~2x rispetto a oggi (una flash + una pro), ma usiamo `pro` per quello che merita davvero (lettura grafici e tabelle dense).

## Persistenza — nuova tabella

```text
workout_extractions
  id uuid pk
  user_id uuid (RLS: auth.uid()=user_id)
  log_id uuid nullable (link al workout_log se l'utente salva)
  source_image_paths text[]
  raw_extraction jsonb  ← l'intero ExtractedWorkout
  prompt_version text
  model text
  created_at timestamptz
```

Vantaggi:
- Si può ri-analizzare lo stesso workout con prompt nuovi senza ri-chiamare la vision
- Si può mostrare in UI il dettaglio segmenti / grafico FC ricostruito
- Audit GDPR: l'utente può scaricare anche questo nel suo export

## Analisi profonda nel coach (analyze-workout)

`analyze-workout` riceve oggi solo `visualPatterns`. Estendiamo a `extractedWorkout` completo. Nuovo blocco prompt:

```text
<segment_analysis>
Se sono presenti segments e la sessione era una "quality" (ripetute):
- Confronta esecuzione vs piano (es. piano dice "3' a 169-179 bpm",
  segments mostrano "3'02'' a 174 bpm media") → da' un giudizio descrittivo
  sull'aderenza per OGNI ripetuta.
- Identifica fading tra ripetute (es. R1 a 174 bpm, R5 a 168 bpm a parità
  di passo = ottima tenuta; se il passo cala ma FC sale = derivazione).

Se kmSplits presenti e sessione era "long" o "easy":
- Cerca derive: km finali con FC > km iniziali a parità di passo.
- Cerca crisi: km con pace +30s/km rispetto alla mediana.

Linguaggio sempre descrittivo, mai prescrittivo o clinico.
</segment_analysis>
```

Nuovo campo opzionale nell'output del coach:
- `segmentReadings: [{ segmentIdx, comment }]` — un commento breve per segmento, mostrato nel SessionDetail come timeline.

## UI — nuove sezioni in AnalysisScreen / SessionDetail

```text
SessionDetail / AnalysisScreen guadagnano:

1. "RIPETUTE" (se segments di tipo interval presenti)
   ┌─────────────────────────────────┐
   │ R1 ▓▓▓▓ 3'02"  174bpm  ✓ in target │
   │ R2 ▓▓▓▓ 2'58"  176bpm  ✓ in target │
   │ R3 ▓▓▓▓ 3'05"  179bpm  ⚠ HR alta   │
   └─────────────────────────────────┘

2. "ANDAMENTO FC" (se hrSeries presente)
   sparkline ricostruita + label "stable / spiky / creep"

3. "SPLIT PER KM" (se kmSplits presente)
   tabella compatta km / pace / hr
```

Nessuna chiamata AI extra: tutta UI deterministica sui dati strutturati.

## Cosa NON è incluso (consapevolmente)

- **RAG vero**: nessun embedding store. Per il volume di dati per utente non serve. Se in futuro vuoi cercare "trovami tutti gli allenamenti con creep" facciamo SQL su `raw_extraction` jsonb.
- **Edit manuale dei segmenti** in UI: solo lettura ora. Edit lo aggiungiamo dopo se serve.
- **Re-extraction one-click** dei vecchi workout: i workout già loggati restano com'erano. Nuovo schema solo da qui in avanti.
- **Cambi al deterministic engine** (`pace-engine.ts`): il motore continua a calcolare zone, Karvonen, Riegel sui totali. I segments sono extra-info per il coach AI, non riscriviamo la matematica.

## File toccati

```text
NUOVI:
  supabase/migrations/<ts>_workout_extractions.sql
  src/components/pace/SegmentTimeline.tsx     (UI ripetute)
  src/components/pace/HrSparkline.tsx         (UI grafico ricostruito)

MODIFICATI:
  supabase/functions/extract-workout-data/index.ts
    → 2-step (triage flash + deep pro)
    → schema esteso (kmSplits, segments, hrSeries, paceSeries, hrZones)
    → validazione coerenza deterministica
    → salva in workout_extractions
    → PROMPT_VERSION = v5-2025-04-21-deep
  supabase/functions/analyze-workout/index.ts
    → riceve extractedWorkout
    → nuovo blocco <segment_analysis>
    → output: + segmentReadings opzionale
    → PROMPT_VERSION bump
  src/components/pace/LogWorkout.tsx
    → passa extractedWorkout (non solo visualPatterns) a onSave
  src/pages/Index.tsx
    → persistLog passa extractedWorkout a analyze-workout
  src/lib/pace-repository.ts
    → saveExtraction(userId, logId, extraction)
    → loadExtraction(logId)
    → exportAllUserData() include workout_extractions
  src/lib/pace-engine.ts
    → tipi ExtractedWorkout + Segment + KmSplit (zero logica nuova, solo types)
  src/components/pace/AnalysisScreen.tsx
    → mostra SegmentTimeline, HrSparkline, segmentReadings
  src/components/pace/SessionDetail.tsx
    → mostra le stesse sezioni se l'utente rivede la sessione

DATABASE:
  CREATE TABLE workout_extractions (...);
  RLS: SELECT/INSERT/DELETE own
```

## Costi e latenza

- Estrazione oggi: ~1.5s, 1 call flash (+ retry pro raro).
- Estrazione nuova: ~3-5s, 1 call flash triage + 1 call pro deep. Sempre dietro lo spinner "STO LEGGENDO I DATI".
- Analisi coach: invariata in costo, prompt più ricco ma stesso modello.

Restando dentro Lovable AI Gateway, gratis fino al 13 ottobre 2025.

## Domande aperte (rispondi quando ti torna comodo)

1. **Soglia di campionamento `hrSeries`**: chiediamo all'AI di restituire ~30 punti uniformi del grafico FC (ogni 30s tipico di una sessione da 30-60 min), o vuoi più densità (60 punti) a costo di più token? Suggerimento: parto con 30, alzo se serve.
2. **Sessioni "quality" senza segments leggibili nello screenshot**: l'AI prova a inferirli dal grafico FC (cercando i picchi)? O solo se l'app mostra i lap espliciti? Suggerimento: solo lap espliciti, niente inferenza, per restare onesti.
3. **Re-extraction**: vuoi un bottone "ri-leggi screenshot" su un log esistente per testare prompt nuovi senza re-loggare? Si fa in 30 minuti, ma è un di più — fammi sapere.

